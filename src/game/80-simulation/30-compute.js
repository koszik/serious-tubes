// tr() with one placeholder, remembered: compute() labels every port, PNI and cache on every run.
const LABS=new Map();function labOf(s,k,v){const key=s+'|'+v;let o=LABS.get(key);if(o===undefined)LABS.set(key,o=tr(s,{[k]:v}));return o;}
// Who carries a network reached only through a cone (kept out of compute(), whose size the JIT is sensitive to).
function coneBy(L,id){let by=null;for(const e of L){if(e.k==='p')return e.net;if(!by&&e.k==='ix'&&e.dir)by=ANC[id].find(u=>e.dir.has(u))||null;}return by||1;}
/* Every exit has the same fields in the same order, whatever its kind, so the routing loop reads them from one object shape
   (exits of six shapes made each property read there a slow lookup). */
function mkEx(k,id,city,cap,rank,pref,lab,ok,nets,net){return {k,net,id,city,lab,cap,used:0,rank,pref,ok,nets,dir:null,clean:false,prem:false,carry:false,prep:false,sac:false,pnc:false,
  ek:'',J:0,byC:null,desc:null,dup:false,told:false,hp:1,ci:0,cn:false,vis:0,ts:-1,xi:0,kx:EXK.indexOf(k),fac:undefined};}
// The exit kinds by number (mkEx's kx), for what routing adds up per kind in typed arrays.
const EXK=['t','ix','p','c'];
// What the network costs and earns per month, from what compute() routed.
function computeMoney(R2){
  const C=R2.cost,V=R2.rev,pm=S.priceMul;
  C.pops=Object.entries(S.pops).reduce((a,[c,p])=>a+popMo(c)+((p.routers||1)-1)*ROUTER_MO+cageMo(p.routers)+(p.routers||1)*RG[p.rgen||0].mo+(p.gen?GEN_MO:0),0);
  C.optical=S.links.filter(l=>l.kind==='df').reduce((a,l)=>a+(l.ready>S.day?0:ampCount(l.km)*AMP_MO*(l.own&&isRdm(l.sys)&&!l.sub?Math.max(1,l.pairs|0):1)+(l.regen|0)*REGEN_MO)+(l.spares?Math.round(150+(l.ch||[]).length*80):0),0);
  C.links=S.links.reduce((a,l)=>a+(l.mo||0),0);
  C.nni=(S.nni||[]).reduce((a,x)=>a+NNI[x.tier].mo,0);
  const htd=histToday();R2.p95dir={};C.transit=S.transit.reduce((a,t)=>{const d=p95dir(t,R2.tday[t.id],htd);R2.p95dir[t.id]=d;const q=Math.max(d.i,d.o);R2.p95[t.id]=q;return a+transitMo(t,q);},0);
  C.ix=Object.keys(S.ixp).reduce((a,c)=>a+ixMo(c),0);
  C.pni=S.pni.reduce((a,p)=>a+pniMo(p,R2.usePni[p.id]||0),0);
  C.caches=cachesMo();
  C.loans=(S.loans||[]).reduce((a,l)=>a+(BANKS[l.bank].equity?0:l.model==='transit'?Math.round((C.transit||0)*(l.cut||0.3)):l.pay)+loanFees(l),0);
  C.extras=(S.cnLic&&S.cnLic.state==='ok'?CN_JV_MO:0)+scrubMo()+Object.keys(S.pops).filter(ruCity).length*RU_BOX_MO+Object.values(S.pops).filter(p=>p.site2).length*SITE2_MO+(S.te?TE_MO:0)+(S.ops&&S.ops.intern?INTERN_MO:0);
  V.eyeballs=0;V.business=0;V.ix=0;V.grant=grantOn(R2)?GRANT_MO:0;
  C.wholesale=0;C.levy=0;const lev=scnRule('levy');for(const c in S.pops){const sf=sfOf(R2,c)*(R2.bbF[c]??1),v=R2.cityEye[c]*sf*eyeRate(c);V.eyeballs+=v;if(CITY[c].au){if(lev)C.levy+=v*AU_LEVY;else C.wholesale+=v*AU_WHOLESALE;}}
  C.access=accessMo(R2);
  const ids=linkIds();for(const b of S.biz){if(capPend(b))continue;const sf=BIZ_T[b.type].fiber?(fiberOk(b,ids)?1:0):BIZ_T[b.type].l2?clamp((R2.l2[b.id]||0)/b.bw,0,1):(R2.bsf[b.id]??sfOf(R2,b.city))*(R2.tgtF[b.id]??1);V.business+=b.bw*b.rate*Math.min(1,sf/0.95);}
  for(const c in S.myIx)V.ix+=S.myIx[c].members.length*MYIX_FEE;
  C.revshare=(S.loans||[]).reduce((a,l)=>a+(BANKS[l.bank].equity||l.bal>0?l.share||0:0),0)*(V.eyeballs+V.business+V.ix);
  R2.costMo=Object.values(C).reduce((a,b)=>a+b,0);
  R2.revMo=V.eyeballs+V.business+V.ix+V.grant;
}
