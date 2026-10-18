/* Key + chord benchmark, run in the page (local preview, after fixtures/gen_keys.js):
     await KB.run('keys')    → window.KB.res (per song) + KB.summary('keys') (per category: exact / relative / fifth / parallel / other, MIREX)
     await KB.run('chords')  → majmin per true beat on gen_chords.py's songs (CR._lastAna = the analysis' beats + chords)
   MIREX key score: exact 1, fifth 0.5, relative 0.3, parallel 0.2. Genuinely ambiguous by construction (relative answer is fair):
   'axis vi-IV-I-V' (same audio as 'minor i-VI-III-VII'), 'royal road' (no tonic chord), pop_E_120.
   Load: on http://localhost:8000/.claude/preview/index.html add <script> tags for fixtures/gen_keys.js then this file. In a hidden
   browser pane, route setTimeout(…,0) through a MessageChannel or background throttling makes it ~10× slower.
   Results 2026-10 (keys v2): keys 114/126 (all 12 misses = ambiguous loops + 2 'starts on IV'), chords set 24/26, majmin 0.998. */
(function(){
const NM=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'],kn=k=>k?NM[k.pc]+(k.mode?'m':''):'-';
function cls(t,g){
  if(!g)return 'other';
  if(g.pc===t.pc&&g.mode===t.mode)return 'exact';
  if(g.mode===t.mode&&(((g.pc-t.pc)%12+12)%12===7||((t.pc-g.pc)%12+12)%12===7))return 'fifth';
  if(g.mode!==t.mode&&((t.mode===0&&g.pc===(t.pc+9)%12)||(t.mode===1&&g.pc===(t.pc+3)%12)))return 'relative';
  if(g.pc===t.pc)return 'parallel';
  return 'other';
}
const W={exact:1,fifth:0.5,relative:0.3,parallel:0.2,other:0};
function buf(g){const b=new AudioBuffer({length:g.x.length,sampleRate:g.sr,numberOfChannels:1});b.copyToChannel(g.x,0);return b}
function chordAcc(tr,ana){
  let ok=0,n=0;const B=ana.beats,C=ana.chords;
  tr.beats.forEach((t,j)=>{const c=tr.chords[j];if(!c)return;const tm=t+tr.T/2;let k=-1;
    for(let i=0;i<B.length;i++){if(B[i]<=tm)k=i;else break}n++;
    const a=k>=0?C[k]:-1;if(a>=0&&a%12===c.root&&(a>=12?'min':'maj')===c.mm)ok++});
  return {ok,n};
}
const KB={res:{keys:[],chords:[]},
  async run(which,filter){
    const set=which==='keys'?GENK.KEYSET():Object.entries(GENK.CHORDSET).map(([name,spec],i)=>({name,cat:'chords',spec,seed:i+1}));
    const out=this.res[which]=[];
    for(const s of set){if(filter&&!filter(s))continue;
      const g=GENK.make(s.spec,s.seed),t0=performance.now(),r=await CR.analyzeTrack(buf(g)),dt=performance.now()-t0,ana=CR._lastAna();
      const c=cls(g.truth.key,r.key),ca=chordAcc(g.truth,ana);
      out.push({name:s.name,cat:s.cat,truth:kn(g.truth.key),got:kn(r.key),alt:r.keyAlt?kn(r.keyAlt):'',conf:r.keyConf,cls:c,ok:ca.ok,n:ca.n,ms:Math.round(dt),dur:g.x.length/g.sr,tk:g.truth.key.pc+12*g.truth.key.mode,dbg:ana.dbg,keyIn:ana.keyIn});
      await new Promise(f=>setTimeout(f,0));
    }
    return this.summary(which);
  },
  summary(which){
    const out=this.res[which],cats={};
    for(const r of out){const c=cats[r.cat]=cats[r.cat]||{n:0,exact:0,relative:0,fifth:0,parallel:0,other:0,mirex:0,ok:0,bn:0};
      c.n++;c[r.cls]++;c.mirex+=W[r.cls];c.ok+=r.ok;c.bn+=r.n}
    const tot={n:0,exact:0,relative:0,fifth:0,parallel:0,other:0,mirex:0,ok:0,bn:0};
    const lines=Object.entries(cats).map(([k,c])=>{for(const f in tot)tot[f]+=c[f];return `${k.padEnd(24)} ${c.exact}/${c.n} rel ${c.relative} 5th ${c.fifth} par ${c.parallel} oth ${c.other} mirex ${(c.mirex/c.n).toFixed(2)} chords ${(c.ok/c.bn).toFixed(3)}`});
    const ms=out.reduce((a,r)=>a+r.ms,0),sec=out.reduce((a,r)=>a+r.dur,0);
    lines.push(`TOTAL ${tot.exact}/${tot.n} (${(100*tot.exact/tot.n).toFixed(1)} %) rel ${tot.relative} 5th ${tot.fifth} par ${tot.parallel} oth ${tot.other} mirex ${(tot.mirex/tot.n).toFixed(3)} chords ${(tot.ok/tot.bn).toFixed(3)} · ${(ms/sec).toFixed(1)} ms per s of audio`);
    lines.push('wrong: '+out.filter(r=>r.cls!=='exact').map(r=>`${r.name}→${r.got}`).join(', '));
    return lines.join('\n');
  }};
window.KB=KB;
})();
