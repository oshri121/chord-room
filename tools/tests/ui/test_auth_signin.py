"""Sign-in dialog (mock backend with codes): keyboard open + focus, inline e-mail error, wrong password, focus trap,
Esc returns focus, sign in/out, forgot password by code (wrong code, new password saved), an unconfirmed account is
sent to the code step with an automatic resend, the reset-link flow (PASSWORD_RECOVERY), and sign-up closed by the
admin (allow_signup:false) hides every sign-up entry point."""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib

@lib.main
def test(t, srv, b):
    ctx, pg = lib.page(b, srv, t, mock=lib.auth_mock(), h=960, lang='he')
    pg.goto(srv.url('#tool')); lib.wait_booted(pg)
    pg.focus('#signInBtn'); pg.keyboard.press('Enter'); time.sleep(0.5)
    t.check('sign-in form opens from the keyboard', pg.is_visible('#fIn'))
    t.eq('focus on e-mail', pg.evaluate('document.activeElement.id'), 'inEmail')
    pg.keyboard.type('dana@'); pg.keyboard.press('Enter'); time.sleep(0.2)
    t.check('bad e-mail inline error', pg.inner_text('#inEmailE') != '', pg.inner_text('#inEmailE'))
    pg.fill('#inEmail', 'dana@example.com'); pg.fill('#inPass', 'wrongpass'); pg.keyboard.press('Enter'); time.sleep(0.5)
    t.check('wrong password message', 'שגויים' in pg.inner_text('#auMsg'), pg.inner_text('#auMsg'))
    for _ in range(25): pg.keyboard.press('Tab')
    t.check('focus trapped in the dialog', pg.evaluate("document.getElementById('authBox').contains(document.activeElement)"))
    pg.keyboard.press('Escape'); time.sleep(0.3)
    t.check('Esc closes', pg.is_hidden('#authDlg'))
    t.eq('focus back on the sign-in button', pg.evaluate('document.activeElement.id'), 'signInBtn')
    pg.click('#signInBtn'); time.sleep(0.4); pg.fill('#inEmail', 'dana@example.com'); pg.fill('#inPass', 'password1'); pg.click('#fIn .au-cta'); time.sleep(1)
    t.check('signed in', pg.is_hidden('#authDlg') and pg.is_visible('#accBtn'))
    lib.sign_out(pg)
    t.check('signed out → buttons back', pg.is_visible('#signUpBtn'))

    t.section('forgot password by code')
    pg.click('#signInBtn'); time.sleep(0.4); pg.fill('#inEmail', 'dana@example.com'); pg.click('#toForgot'); time.sleep(0.3)
    t.eq('e-mail carried to the forgot form', pg.input_value('#fgEmail'), 'dana@example.com')
    pg.click('#fForgot .au-cta'); time.sleep(0.5)
    t.check('recover step + code sent', pg.is_visible('#fRecover') and pg.evaluate('window.__rec') == 'dana@example.com')
    pg.fill('#rcCode', '111111'); pg.fill('#rcPass', 'BrandNew-Pass9'); pg.fill('#rcPass2', 'BrandNew-Pass9'); pg.click('#fRecover .au-cta'); time.sleep(0.5)
    t.check('wrong recovery code', 'שגוי' in pg.inner_text('#rcCodeE'), pg.inner_text('#rcCodeE'))
    pg.fill('#rcCode', '654321'); pg.fill('#rcPass', 'BrandNew-Pass9'); pg.fill('#rcPass2', 'BrandNew-Pass9'); pg.click('#fRecover .au-cta'); time.sleep(1)
    t.check('password updated state', pg.is_visible('#auDone') and 'הסיסמה עודכנה' in pg.inner_text('#authTitle'), pg.inner_text('#authTitle'))
    t.eq('password actually changed', pg.evaluate("__mock.users.find(u=>u.email==='dana@example.com').password"), 'BrandNew-Pass9')
    pg.click('#auDoneGo'); time.sleep(0.3); lib.sign_out(pg)

    t.section('unconfirmed account')
    pg.evaluate("Backend.signUp({username:'pending1',email:'pend@x.com',password:'Pending-Pass1'})"); time.sleep(0.3)
    pg.click('#signInBtn'); time.sleep(0.3); pg.fill('#inEmail', 'pend@x.com'); pg.fill('#inPass', 'Pending-Pass1'); pg.click('#fIn .au-cta'); time.sleep(0.8)
    t.check('unconfirmed → code step', pg.is_visible('#fCode'), pg.inner_text('#auMsg'))
    t.eq('code resent automatically', pg.evaluate('window.__resends'), 1)
    pg.fill('#auCode', '222222'); time.sleep(1)
    t.check('verified from the sign-in path', pg.is_visible('#auDone'))
    pg.click('#auDoneGo'); time.sleep(0.3); lib.sign_out(pg)

    t.section('reset link (PASSWORD_RECOVERY)')
    pg.evaluate("Backend.signIn({email:'dana@example.com',password:'BrandNew-Pass9'}).then(()=>window.__cb('PASSWORD_RECOVERY',window.__MOCK_BACKEND.user))"); time.sleep(0.8)
    t.check('link flow → reset form', pg.is_visible('#fReset'))
    pg.fill('#rsPass', 'password1'); pg.fill('#rsPass2', 'password1'); pg.click('#fReset .au-cta'); time.sleep(0.5)
    t.check('weak/same password refused', not pg.is_visible('#auDone'), pg.inner_text('#rsPassS'))
    pg.fill('#rsPass', 'Another-Pass7'); pg.fill('#rsPass2', 'Another-Pass7'); pg.click('#fReset .au-cta'); time.sleep(0.5)
    t.check('link reset done', pg.is_visible('#auDone'))
    ctx.close()

    t.section('sign-up closed')
    ctx, pg = lib.page(b, srv, t, mock=lib.auth_mock(cfg='{allow_signup:false}'), lang='he')
    pg.goto(srv.url('#tool')); lib.wait_booted(pg); time.sleep(0.5)
    t.check('no sign-up button, sign-in stays', pg.is_hidden('#signUpBtn') and pg.is_visible('#signInBtn'))
    pg.evaluate("document.getElementById('signInBtn').click()"); time.sleep(0.4)
    t.check('no sign-up tab / link in the dialog', pg.is_hidden('#auTabUp') and pg.is_hidden('#auAltUp'))
    t.shot(pg, 'signup_closed')
