"""Owner & roles admin UI (mock backend): owner sees the Roles tab, creates a custom role, granting a role needs the
roles password (none set → message, wrong → message, right → applied), a moderator sees only its tabs/actions."""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib

EXTRA = r'''(()=>{const B=window.__MOCK_BACKEND;
let roles=[],pw=null;window.__roles=()=>roles;
B.myAccess=async()=>B.user&&B.user.email==='o@x.com'?{owner:true,role:'admin',panel:true,perms:['users','block','credits','songs','activity','settings','payments','catalog']}:{owner:false,role:'moderator',panel:true,perms:['users']};
B.roles=async()=>roles;B.ownerSaveRole=async(id,name,perms)=>{const r=roles.find(x=>x.id===id);if(r)Object.assign(r,{name,perms});else roles.push({id,name,perms})};
B.ownerDeleteRole=async id=>{roles=roles.filter(r=>r.id!==id)};B.ownerRolePasswordSet=async()=>!!pw;
B.ownerSetRolePassword=async(n,o)=>{if(pw&&o!==pw)return 'bad_password';pw=n;return 'ok'};
B.adminSetRole=async(id,role,p)=>{if(role!=='user'){if(!pw)return 'no_role_password';if(p!==pw)return 'bad_password'}__mock.profiles.find(x=>x.id===id).role=role;return 'ok'};
const au=B.adminUsers;B.adminUsers=async()=>{const l=await au();l.forEach(p=>{if(p.email==='o@x.com')p.owner=true});return l};})();'''

TABS = "[...document.querySelectorAll('#admTabs button')].filter(b=>!b.hidden).map(b=>b.dataset.v)"

@lib.main
def test(t, srv, b):
    ctx, pg = lib.page(b, srv, t, mock=lib.mock_js(EXTRA))
    pg.goto(srv.url('#tool')); lib.wait_booted(pg)
    lib.sign_up(pg, 'oshri', 'o@x.com')
    pg.evaluate("document.querySelector('#adminBtn').click()"); time.sleep(1)
    tabs = pg.evaluate(TABS)
    t.check('owner sees users/songs/activity/settings/roles tabs', all(x in tabs for x in ['users', 'songs', 'activity', 'settings', 'roles']), tabs)
    t.check('owner row listed', 'oshri' in pg.inner_text('#uBody'))
    btns = pg.eval_on_selector_all('#uBody tr:has-text("dana") .acts button', 'e=>e.map(x=>x.textContent)')
    t.check('dana row has a role button', any('רול' in x for x in btns), btns)
    pg.click('#admTabs button[data-v="roles"]'); time.sleep(0.5)
    t.check('roles password state shown', pg.inner_text('#rpState').strip() != '', pg.inner_text('#rpState'))
    pg.fill('#rlName', 'מודרטור'); pg.click('#rlAdd'); time.sleep(0.5)
    pg.check('.rlrow:nth-child(2) input[value="users"]'); pg.check('.rlrow:nth-child(2) input[value="activity"]')
    pg.click('.rlrow:nth-child(2) .rls'); time.sleep(0.4)
    roles = pg.evaluate("__roles()")
    t.check('custom role saved with perms users+activity', len(roles) == 1 and roles[0]['name'] == 'מודרטור' and sorted(roles[0]['perms']) == ['activity', 'users'], roles)
    t.shot(pg, 'roles_tab', full_page=True)

    t.section('granting a role needs the roles password')
    pg.click('#admTabs button[data-v="users"]'); time.sleep(0.4)
    pg.click('#uBody tr:has-text("dana") .acts button:has-text("רול")'); time.sleep(0.3)
    pg.select_option('#rdSel', 'admin'); pg.click('#rdOk'); time.sleep(0.4)
    t.check('no password set → message', pg.inner_text('#rdMsg').strip() != '', pg.inner_text('#rdMsg'))
    t.eq('…and dana still a user', pg.evaluate("__mock.profiles.find(p=>p.username==='dana_beats').role"), 'user')
    pg.click('#rdX')
    pg.click('#admTabs button[data-v="roles"]'); time.sleep(0.3)
    before = pg.inner_text('#rpState')
    pg.fill('#rpNew', 'Owner#Pass1'); pg.fill('#rpNew2', 'Owner#Pass1'); pg.click('#rpSave'); time.sleep(0.4)
    t.check('roles password set (state changes)', pg.inner_text('#rpState') != before, f"{pg.inner_text('#rpMsg')} | {pg.inner_text('#rpState')}")
    pg.click('#admTabs button[data-v="users"]'); time.sleep(0.4)
    pg.click('#uBody tr:has-text("dana") .acts button:has-text("רול")'); time.sleep(0.3)
    rid = pg.evaluate("__roles()[0].id")
    pg.select_option('#rdSel', rid); pg.fill('#rdPw', 'wrong'); pg.click('#rdOk'); time.sleep(0.4)
    t.check('wrong password → message, role unchanged', pg.inner_text('#rdMsg').strip() != '' and pg.evaluate("__mock.profiles.find(p=>p.username==='dana_beats').role") == 'user', pg.inner_text('#rdMsg'))
    pg.fill('#rdPw', 'Owner#Pass1'); pg.click('#rdOk'); time.sleep(0.8)
    t.eq('right password → dana has the custom role', pg.evaluate("__mock.profiles.find(p=>p.username==='dana_beats').role"), rid)
    t.shot(pg, 'roles_users')

    t.section('moderator view')
    pg.click('#adminClose'); lib.sign_out(pg)
    lib.sign_in(pg, 'dana@example.com', 'password1')
    pg.evaluate("document.querySelector('#adminBtn').click()"); time.sleep(1)
    tabs = pg.evaluate(TABS)
    t.check('moderator: users tab only (no roles/settings)', 'users' in tabs and 'roles' not in tabs and 'settings' not in tabs, tabs)
    t.check('moderator: settings panel hidden', pg.evaluate("document.querySelector('#admSettings').hidden"))
    mb = pg.eval_on_selector_all('#uBody .acts button', 'e=>[...new Set(e.map(x=>x.textContent))]')
    t.check('moderator: no role / block buttons', not any(w in x for x in mb for w in ('רול', 'חסימ', 'Role', 'Block')), mb)
