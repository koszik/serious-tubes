/* What a routed day gives the rest of the game (docs/specs/network-engine.md §8, §9). Pipes, hours and flows are kept in
   R.dp (not listed, so R reads and saves as plain numbers); the old one-number views (R.load, R.useT…) are each pipe's
   busiest hour, so capacity planning reads the peak. Service is judged per endpoint over its own busy hours. */
const EXK_I={t:0,ix:1,p:2,c:3};// the same order as EXK (30-compute.js)
function engResults(X){const {R2,E,NX,NE,NP,EP,IT,F,L,hp,OFFH,LOSSH,CAP,NOH,EPO,EPR,EPD,EPN,TD,TS,TL2,VI,VO,DI,DO,WC,FIN,FOUT,FV}=X,NEP=EP.length,NPOP=X.POPC.length,day=S.day;
  // Items as columns: their flow, network, far end, peak volume, endpoint, cache part, detour and the exit it uses.
  const NI=IT.length,IF=new Int32Array(NI),IJ=new Int32Array(NI),IO=new Int32Array(NI),IV=new Float64Array(NI),IE=new Int32Array(NI),IC=new Uint8Array(NI),ILAT=new Float64Array(NI),ILX=new Int32Array(NI),IS=new Int32Array(NI);
  for(let t=0;t<NI;t++){const it=IT[t];IF[t]=it.f;IJ[t]=it.j;IO[t]=it.o;IS[t]=it.sv>=0?it.sv:it.o>=0?ORIGINS[it.o].ci:-1;IV[t]=it.v;IE[t]=it.ep;IC[t]=it.ce;ILAT[t]=it.lat||0;ILX[t]=it.lx===undefined?-1:it.lx;}
  const EPIP=new Uint8Array(NEP),EPPOP=new Uint8Array(NEP),EPCI=new Int32Array(NEP);for(let i=0;i<NEP;i++){const k=EP[i].k;EPIP[i]=k==='pop'||k==='grp'?1:0;EPPOP[i]=k==='pop'?1:0;EPCI[i]=EP[i].ci;}
  const FVi=new Float64Array(F.v.length),FGa=Float64Array.from(F.g);for(let f=0;f<FVi.length;f++)FVi[f]=F.v[f]>0?1/F.v[f]:0;
  R2.hp=hp;R2.served=TS[hp];R2.demand=TD[hp];R2.egT.l2=TL2[hp];R2.teMoved=X.teMoved||0;
  // Links: an edge's busiest hour in its busier direction, shared by its links (active ones first, standby after).
  R2.ldir={};R2.lossL={};R2.lossD={};
  for(const e of X.EA){let bh=0,bv=-1,bt=-1,ml=0;let m0=0,m1=0;for(let h=0;h<24;h++){const b=h*NP,o0=OFFH[b+2*e.i],o1=OFFH[b+2*e.i+1],c0=o0*(1-LOSSH[b+2*e.i]),c1=o1*(1-LOSSH[b+2*e.i+1]),d=Math.max(c0,c1),t=c0+c1;
      // A full pipe is full in many hours: within a hair, the hour with more traffic in all is the busiest.
      if(d>bv*(1+1e-9)+1e-12||Math.abs(d-bv)<=bv*1e-9+1e-12&&t>bt){bv=d;bh=h;bt=t;}if(LOSSH[b+2*e.i]>m0)m0=LOSSH[b+2*e.i];if(LOSSH[b+2*e.i+1]>m1)m1=LOSSH[b+2*e.i+1];}ml=Math.max(m0,m1);
    const b=bh*NP,dl=[OFFH[b+2*e.i]*(1-LOSSH[b+2*e.i]),OFFH[b+2*e.i+1]*(1-LOSSH[b+2*e.i+1])],ac=e.cap-e.scap;
    for(const l of e.links){const c=capOf(l),f=l.standby?(e.scap>0?c/e.scap:0):(ac>0?c/ac:0),fit=d=>{const a=Math.min(d,ac),sp=d-a;return l.standby?sp*f:a*f;};
      const ab=fit(dl[0]),ba=fit(dl[1]),fw=l.a===e.a;R2.load[l.id]=Math.max(ab,ba);R2.ldir[l.id]=fw?[ab,ba]:[ba,ab];R2.lossL[l.id]=ml;R2.lossD[l.id]=fw?[m0,m1]:[m1,m0];}}
  // Ports: carried at the busiest hour of either direction; transit also keeps the day's six busiest hours each way (p95).
  R2.lossX={};R2.tday={};R2.useTd={};
  const si=new Float64Array(24),so=new Float64Array(24);
  for(let x=0;x<NX;x++){const e=E[x],rx=2*NE+2*x;let m=0,ml=0;
    for(let h=0;h<24;h++){const b=h*NP,la=LOSSH[b+rx],lt=LOSSH[b+rx+1],a=OFFH[b+rx]*(1-la),t=OFFH[b+rx+1]*(1-lt);if(a>m)m=a;if(t>m)m=t;if(la>ml)ml=la;if(lt>ml)ml=lt;si[h]=a;so[h]=t;}
    if(e.k==='t'){let mi=0,mo=0;for(let h=0;h<24;h++){if(si[h]>mi)mi=si[h];if(so[h]>mo)mo=so[h];}R2.useTd[e.id]={rx:mi,tx:mo};R2.useT[e.id]=(R2.useT[e.id]||0)+m;const top=a=>Array.from(a.slice().sort().reverse().slice(0,6),v=>+v.toFixed(3));R2.tday[e.id]={i:top(si),o:top(so)};}
    else if(e.k==='ix')R2.useIx[e.id]=m;else if(e.k==='p')R2.usePni[e.id]=m;else R2.useCache[e.id]=m;R2.lossX[e.ek]=ml;}
  for(let k=0;k<NPOP;k++){const c=X.POPC[k],C=X.NCAP[k];let m=0;for(let h=0;h<24;h++)m=Math.max(m,NOH[h*NPOP+k]);R2.nodeCap[c]=C;R2.nodeLoad[c]=Math.min(m,C);}
  // Service: delivered over offered in an endpoint's busy hours (where it is at least half its busiest), and its worst loss
  // on your network (what the Great Firewall drops is delivery lost, not loss you can fix).
  R2.psf={};R2.bsf={};R2.svc={};const grace=S.engGrace>day;
  for(let i=0;i<NEP;i++){const e=EP[i],T=e.T;let mx=0;for(let h=0;h<24;h++)mx=Math.max(mx,EPO[h*NEP+i]);let so=0,sd=0,wl=0;
    for(let h=0;h<24;h++){const o=EPO[h*NEP+i];if(T.vol?o>0:o>=0.5*mx&&o>0){so+=o;sd+=EPD[h*NEP+i];const r=EPR[h*NEP+i];if(r>0)wl=Math.max(wl,1-EPN[h*NEP+i]/r);}}
    const D=e.dead?0:so>0?Math.min(1,sd/so):1,q=T.el||wl<=T.tol?1:clamp(1-(wl-T.tol)/(3*T.tol),0,1);e.svc={D,L:so>0?wl:0,q};let sf=D*q;if(grace)sf=Math.max(sf,0.95);e.sf=sf;R2.svc[e.k+':'+(e.key||e.city+(e.b?':'+e.b.id:''))]={D,L:e.svc.L,sf};
    if(e.k==='pop')R2.psf[e.city]=sf;else if(e.members)for(const id of e.members)R2.bsf[id]=Math.min(R2.bsf[id]??1,sf);
    if(e.k==='l2')R2.l2[e.b.id]=e.b.bw*R2.bsf[e.b.id];}
  // Traffic by exit at the peak hour (the inbound side), what each network sends you and what crosses China's border.
  const DEMTO=X.DEMTO,cityO={},cityD={},NC=CITIES.length,LATW=new Float64Array(NC),LATL=new Float64Array(NC),FAR=new Map();
  for(let f=0;f<X.NF;f++){const e=EP[F.ep[f]];if(e.k!=='pop'&&e.k!=='grp')continue;cityO[e.city]=(cityO[e.city]||0)+Math.max(VI[f],VO[f]);cityD[e.city]=(cityD[e.city]||0)+Math.max(DI[f],DO[f]);}
  for(const c in cityO){R2.cityDem[c]=cityO[c];R2.citySrv[c]=cityD[c];}
  // By network index and kind of exit (t, ix, p, c), and per transit port and network, in typed sums.
  // egT: what comes in, by the kind of exit it enters at; egO: what goes out, by the exit it leaves by.
  const NN=X.NN,NEA=new Float64Array(NN*4),EGK=new Float64Array(4),EGO=new Float64Array(4),TNA=new Map(),snd=scnRule('sender'),LX=L.LX;let peered=0;
  let gC=0,gL=0;
  for(let t=0;t<NI;t++){const j=IJ[t],ei=IE[t];if(IO[t]<0||j<0||!EPIP[ei])continue;const f=IF[t],v=IV[t],din=DI[f]*v*FVi[f],gf=FGa[f];
    if(gf>0){gC+=din/(1-gf);gL+=din/(1-gf)*gf;}
    if(FOUT[f]>=0){const xo=LX[FOUT[f]];if(xo>=0)EGO[EXK_I[E[xo].k]]+=DO[f]*v*FVi[f];}
    const w0=WC[f*3],w1=WC[f*3+1],w2=WC[f*3+2],tw=(FIN[f*3]>=0?w0:0)+(FIN[f*3+1]>=0?w1:0)+(FIN[f*3+2]>=0?w2:0)||1;
    for(let k=0;k<3;k++){const id=FIN[f*3+k],w=WC[f*3+k];if(id<0||!(w>0))continue;const xi=LX[id],x=E[xi],g=din*w/tw,kx=EXK_I[x.k];
      EGK[kx]+=g;NEA[j*4+kx]+=g;if(x.rank<=2)peered+=g;if(kx===0){const q=xi*NN+j;TNA.set(q,(TNA.get(q)||0)+g);}}
    // Backhaul: users notice the detour to where their traffic leaves (Korean users under sender pays much sooner).
    if(EPPOP[ei]&&ILX[t]>=0){const ci=EPCI[ei],lt=ILAT[t];LATW[ci]+=v;if(lt>0){const ls=(snd&&CITIES[ci].kr?krLatLoss:latLoss)(2*lt);
      if(ls>0){LATL[ci]+=v*ls;const x=E[ILX[t]],k=ci*NC+x.ci;let o=FAR.get(k);if(!o)FAR.set(k,o={c:CITIES[ci].id,to:x.city,g:0,ms:0});o.g+=v;if(2*lt>o.ms)o.ms=2*lt;}}}}
  R2.gfwCross+=gC;R2.gfwLost+=gL;
  R2.peered=peered;for(let k=0;k<4;k++){if(EGK[k]>0)R2.egT[EXK[k]]=EGK[k];if(EGO[k]>0)R2.egO[EXK[k]]=EGO[k];}R2.egO.l2=R2.egT.l2||0;
  for(let j=0;j<NN;j++){const b=j*4;if(NEA[b]||NEA[b+1]||NEA[b+2]||NEA[b+3])R2.netEg[NETS[j].id]={t:NEA[b],ix:NEA[b+1],p:NEA[b+2],c:NEA[b+3]};}
  for(const [q,g] of TNA){const x=E[Math.floor(q/NN)],n=NETS[q%NN].id,m=R2.tNet[x.id]||(R2.tNet[x.id]={});m[n]=(m[n]||0)+g;}
  for(let j=0;j<NN;j++)if(DEMTO[j]>0)R2.demTo[NETS[j].id]=DEMTO[j];
  for(const e of EP)if(e.k==='pop'&&LATW[e.ci]>0&&LATL[e.ci]>0){const c=e.city;R2.latF[c]=clamp(1-LATL[e.ci]/LATW[e.ci],0,1);if(R2.psf[c]!==undefined&&!grace)R2.psf[c]*=R2.latF[c];}
  for(const o of FAR.values()){const cur=R2.latFar[o.c],w=LATW[CIDX[o.c]];if(!cur||o.g>cur.g)R2.latFar[o.c]={to:o.to,g:o.g,ms:o.ms,share:w>0?o.g/w:0};}
  R2.peerShare=R2.served>0?R2.peered/R2.served:0;
  // Floods: what the ports let through, and who else felt it.
  // Collateral is what everyone loses on the pipes the junk crosses (the ports it comes in on and its way to the target).
  if(X.DD){const JP=new Uint8Array(NP),{LP:lp,LOFF:lo}=L,L1=X.L1;for(let x=0;x<NX;x++)if(X.J[x]>0)JP[2*NE+2*x]=1;for(const h of X.hauls)for(let k=lo[h[0]];k<lo[h[0]+1];k++)JP[lp[k]]=1;
    const kept=(id,q)=>{let a=1;for(let k=lo[id];k<lo[id+1];k++){const p=lp[k];if(JP[p])a*=1-L1[2*p+q];}return a;};
    const lostC={};let lost=0;
    for(let f=0;f<X.NF;f++){const ei=F.ep[f];if(!EPIP[ei])continue;const q=F.q[f];let x=0;for(let k=0;k<3;k++){const id=FIN[f*3+k];if(id>=0&&WC[f*3+k]>0)x+=VI[f]*WC[f*3+k]*(1-kept(id,q));}
      if(FOUT[f]>=0)x+=VO[f]*(1-kept(FOUT[f],q));if(x>0){const ci=EPCI[ei];lostC[ci]=(lostC[ci]||0)+x;lost+=x;}}
    ddosAfter(X.DD,{E,R2,lostC,lost,fac:e=>1-LOSSH[hp*NP+2*NE+2*e.xi]});}
  // Traffic between your own POPs, as the link panel names it.
  for(const it of IT)if(it.o<0&&!it.site){const c=EP[it.ep].city,k='onnet:'+c;if(!R2.egDesc[k])R2.egDesc[k]={lab:labOf(N_('compute.on_net_from_city'),'city',CITY[c].name),city:c,k:'l2'};}
  // Kept for the panels, the map and the worker: plain arrays only.
  const dp={NE,NX,NP,hp,OFFH,LOSSH,CAP,LP:Int32Array.from(L.LP),LS:Float32Array.from(L.LS),LB:Uint8Array.from(L.LB),LOFF:Int32Array.from(L.LOFF),LX:Int32Array.from(L.LX),
    FIN,FOUT,FV:Float64Array.from(F.v),FEP:Int32Array.from(F.ep),VI,VO,DI,DO,WC,CV:X.CV,FCV:X.FCV,FI:X.FI,FO:X.FO,
    IF,IJ,IV,IE,IC,IO,IS,IOX:Int32Array.from(IT.map(i=>i.outX===undefined?-1:i.outX)),
    EPO,EPD,epCity:EP.map(e=>e.city),epK:EP.map(e=>e.k),epCls:EP.map(e=>e.cls),epB:EP.map(e=>e.b?e.b.id:null),epM:EP.map(e=>e.members||null),ex:E.map(e=>({k:e.k,id:e.id,city:e.city,net:e.net||null,ek:e.ek,rank:e.rank})),
    edges:X.EA.map(e=>[e.id,e.a,e.i]),hauls:X.hauls||[]};
  engDefine(R2,dp);}
// R.dp and the lazy views built from it (also how a route worker's answer is put back together).
function engDefine(R2,dp){Object.defineProperty(R2,'dp',{value:dp,configurable:true});
  const ek={};for(const [id,a,i] of dp.edges)ek[id]=i;Object.defineProperty(R2,'ek',{value:ek,configurable:true});
  const recs={};Object.defineProperty(R2,'ef',{configurable:true,enumerable:false,value:new Proxy({},{get:(t,k)=>typeof k!=='string'?undefined:k in recs?recs[k]:(recs[k]=ek[k]===undefined?undefined:engEdgeRec(dp,ek[k])),
    has:(t,k)=>ek[k]!==undefined,ownKeys:()=>Object.keys(ek),getOwnPropertyDescriptor:(t,k)=>ek[k]===undefined?undefined:{enumerable:true,configurable:true,value:recs[k]||(recs[k]=engEdgeRec(dp,ek[k]))}})});
  let fl=null;Object.defineProperty(R2,'fl',{configurable:true,get(){return fl||(fl=engFlows(dp));}});}
// What crosses edge i at its own busiest hour: by exit (eg), by network and by the city it serves (dst).
function engEdgeRec(dp,i){const rec={eg:{},net:{},dst:{}},{LP,LS,LB,LOFF,LX,FIN,FOUT,WC,FV}=dp,a=2*i,b=2*i+1,NF=FV.length;
  let h=dp.hp,bv=-1;for(let k=0;k<24;k++){const o=k*dp.NP,v=Math.max(dp.OFFH[o+a],dp.OFFH[o+b]);if(v>bv){bv=v;h=k;}}
  const VI=new Float64Array(NF),VO=new Float64Array(NF);for(let f=0;f<NF;f++){const s=dp.CV[dp.FCV[f]+h];VI[f]=FV[f]*dp.FI[f]*s;VO[f]=FV[f]*dp.FO[f]*s;}
  const on=id=>{let s=0;for(let k=LOFF[id],e=LOFF[id+1];k<e;k++)if(LP[k]===a||LP[k]===b)s+=LS[k];return s;};
  const byF=new Map();for(let t=0;t<dp.IF.length;t++){const f=dp.IF[t];let l=byF.get(f);if(!l)byF.set(f,l=[]);l.push(t);}
  const add=(f,g,egk)=>{if(!(g>0))return;rec.eg[egk]=(rec.eg[egk]||0)+g;const items=byF.get(f)||[],tot=FV[f]||1;
    for(const t of items){const j=dp.IJ[t],ep=dp.IE[t],w=g*dp.IV[t]/tot,n=j>=0?NETS[j].id:dp.epK[ep]==='l2'?'l2vpn':'junk',c=dp.epCity[ep];rec.net[n]=(rec.net[n]||0)+w;rec.dst[c]=(rec.dst[c]||0)+w;}};
  for(let f=0;f<NF;f++){const ep=dp.FEP[f],l2=dp.epK[ep]==='l2'?'l2:'+dp.epB[ep]:'onnet:'+dp.epCity[ep];
    for(let k=0;k<3;k++){const id=FIN[f*3+k];if(id<0||!(WC[f*3+k]>0))continue;const s=on(id);if(s>0)add(f,VI[f]*WC[f*3+k]*s,LX[id]>=0?dp.ex[LX[id]].ek:l2);}
    if(FOUT[f]>=0){const s=on(FOUT[f]);if(s>0)add(f,VO[f]*s,LX[FOUT[f]]>=0?dp.ex[LX[FOUT[f]]].ek:l2);}}
  for(const [id,g,j,egk] of dp.hauls){const s=on(id);if(s>0){rec.eg[egk]=(rec.eg[egk]||0)+g*s;rec.net.junk=(rec.net.junk||0)+g*s;}}
  return rec;}
/* Every flow on some pipes at hour h (default: their busiest), one row per far end, way in or out and endpoint:
   {p: which of the pipes, dir 'in' (towards your endpoint) or 'out', x: the exit it crosses (-1: none, on-net or a
   circuit), o: origin index (-1-ci: one of your POPs; null: a circuit's other site or a flood), ep: endpoint, g: Gbps}. */
function engFlowRows(dp,pipes,h){const {LP,LS,LOFF,LX,FIN,FOUT,WC,FV}=dp,NF=FV.length,at=new Map(pipes.map((p,i)=>[p,i]));
  if(h===undefined||h===null){let bv=-1;h=dp.hp;for(let k=0;k<24;k++){let v=0;for(const p of pipes)v+=dp.OFFH[k*dp.NP+p];if(v>bv){bv=v;h=k;}}}
  const byF=new Map();for(let t=0;t<dp.IF.length;t++){const f=dp.IF[t];let l=byF.get(f);if(!l)byF.set(f,l=[]);l.push(t);}
  const rows=new Map(),add=(f,i,dir,x,g)=>{if(!(g>1e-9))return;const its=byF.get(f)||[],tot=FV[f]||1;
    for(const t of its){const o=dp.IO[t],sv=dp.IS?dp.IS[t]:-1,k=i+'|'+dir+'|'+x+'|'+o+'|'+sv+'|'+dp.IE[t];let r=rows.get(k);if(!r)rows.set(k,r={p:i,dir,x,o:dp.epK[dp.IE[t]]==='l2'?null:o,sv,ep:dp.IE[t],g:0});r.g+=g*dp.IV[t]/tot;}};
  const on=id=>{const o=[];for(let k=LOFF[id],e=LOFF[id+1];k<e;k++){const i=at.get(LP[k]);if(i!==undefined)o.push([i,LS[k]]);}return o;};
  for(let f=0;f<NF;f++){const s=dp.CV[dp.FCV[f]+h],vi=FV[f]*dp.FI[f]*s,vo=FV[f]*dp.FO[f]*s;
    for(let k=0;k<3;k++){const id=FIN[f*3+k];if(id<0||!(WC[f*3+k]>0)||!(vi>0))continue;for(const [i,sh] of on(id))add(f,i,'in',LX[id],vi*WC[f*3+k]*sh);}
    if(FOUT[f]>=0&&vo>0)for(const [i,sh] of on(FOUT[f]))add(f,i,'out',LX[FOUT[f]],vo*sh);}
  const out=[...rows.values()];for(const [id,g,j,egk] of dp.hauls)for(const [i,sh] of on(id))out.push({p:i,dir:'in',x:-1,o:null,ep:-1,g:g*sh,junk:egk});
  return {h,rows:out.sort((a,b)=>b.g-a.g)};}
/* A customer's own port, seen from your router: rx is what it sends you, tx what you deliver to it, hour by hour. Its
   share of the endpoint it is merged into (customers of one class in one city) goes by its port, as its traffic does. */
// Which endpoints each customer is in and which items each endpoint has, indexed once per routed day.
function custIdx(dp){if(dp._ci)return dp._ci;const byB=new Map(),byE=new Map();
  for(let i=0;i<dp.epK.length;i++){const k=dp.epK[i],ids=k==='l2'?[dp.epB[i]]:k==='grp'&&dp.epM[i]?dp.epM[i]:[];for(const id of ids){let a=byB.get(id);if(!a)byB.set(id,a=[]);a.push(i);}}
  for(let t=0;t<dp.IE.length;t++){const e=dp.IE[t];let a=byE.get(e);if(!a)byE.set(e,a=[]);a.push(t);}
  Object.defineProperty(dp,'_ci',{value:{byB,byE},enumerable:false});return dp._ci;}
function custItems(dp,b){const {byB,byE}=custIdx(dp),live=x=>!BIZ_T[x.type].event||eventLive(x),eps=byB.get(b.id)||[],its=[];let sh=0;
  const bz=dp._bz||Object.defineProperty(dp,'_bz',{value:new Map(S.biz.map(x=>[x.id,x])),enumerable:false})._bz;
  for(const i of eps){if(dp.epK[i]==='l2')sh=1;else{let t=0;for(const id of dp.epM[i]){const x=bz.get(id);if(x&&live(x))t+=x.bw;}sh=live(b)&&t>0?b.bw/t:0;}for(const t of byE.get(i)||[])its.push(t);}
  return {its,sh,eps};}
// An endpoint's day, delivered (rx: what it sends, tx: what it gets), its worst hour's loss and its hours under
// SLA_BAD (what an SLA counts as down), once per routed day.
function epDay(dp,ep){const m=dp._ed||Object.defineProperty(dp,'_ed',{value:new Map(),enumerable:false})._ed;let D=m.get(ep);if(D)return D;
  const NEP=dp.epK.length,rx=new Float64Array(24),tx=new Float64Array(24);let loss=0;
  for(const t of custIdx(dp).byE.get(ep)||[]){const f=dp.IF[t];for(let h=0;h<24;h++){const s=dp.CV[dp.FCV[f]+h],o=dp.EPO[h*NEP+ep],d=o>0?dp.EPD[h*NEP+ep]/o:1,v=dp.IV[t]*s*d;tx[h]+=v*dp.FI[f];rx[h]+=v*dp.FO[f];if(o>0&&s>0&&1-d>loss)loss=1-d;}}
  let bad=0,out=0;for(let h=0;h<24;h++){const o=dp.EPO[h*NEP+ep];if(o>0){const f=dp.EPD[h*NEP+ep]/o;if(f<SLA_BAD)bad++;if(f<BB_OUT)out++;}}
  m.set(ep,D={rx,tx,loss:Math.max(0,loss),bad,out});return D;}
// Its loss: the worst hour of what it asked for and did not get, end to end (its port itself is never the bottleneck).
function custDay(b,r=R){const dp=r.dp;if(!dp||!dp.EPO)return null;const {its,sh,eps}=custItems(dp,b),rx=new Float64Array(24),tx=new Float64Array(24);let loss=0,bad=0;
  for(const ep of eps){const D=epDay(dp,ep);for(let h=0;h<24;h++){rx[h]+=D.rx[h]*sh;tx[h]+=D.tx[h]*sh;}if(D.loss>loss)loss=D.loss;if(D.bad>bad)bad=D.bad;}
  return {rx,tx,its,sh,loss,bad};}
// Its flows at hour h (its busiest when none): rows as engFlowRows gives them, p 0 = rx (from it), 1 = tx (to it).
function custFlowRows(b,h){const dp=R.dp,D=custDay(b);if(!D)return {h:0,rows:[]};
  if(h===undefined||h===null){h=0;for(let k=1;k<24;k++)if(D.rx[k]+D.tx[k]>D.rx[h]+D.tx[h])h=k;}const NEP=dp.epK.length,rows=new Map();
  const add=(p,dir,x,t,g)=>{if(!(g>1e-9))return;const o=dp.epK[dp.IE[t]]==='l2'?null:dp.IO[t],sv=dp.IS?dp.IS[t]:-1,k=p+'|'+x+'|'+o+'|'+sv+'|'+dp.IE[t];let r=rows.get(k);if(!r)rows.set(k,r={p,dir,x,o,sv,ep:dp.IE[t],g:0});r.g+=g;};
  for(const t of D.its){const f=dp.IF[t],ep=dp.IE[t],o=dp.EPO[h*NEP+ep],v=dp.IV[t]*dp.CV[dp.FCV[f]+h]*D.sh*(o>0?dp.EPD[h*NEP+ep]/o:1),fi=dp.FIN[f*3];
    add(1,'in',fi>=0?dp.LX[fi]:-1,t,v*dp.FI[f]);add(0,'out',dp.IOX[t]>=0?dp.IOX[t]:dp.FOUT[f]>=0?dp.LX[dp.FOUT[f]]:-1,t,v*dp.FO[f]);}
  return {h,rows:[...rows.values()].sort((a,b)=>b.g-a.g)};}
// What each network sends you (in) and you send it (out) at the peak hour, delivered: per item, its share of its flow.
function engNetIO(dp){if(dp._nio)return dp._nio;const NN=NETS.length,I=new Float64Array(NN),O=new Float64Array(NN);
  for(let t=0;t<dp.IJ.length;t++){const j=dp.IJ[t];if(j<0)continue;const f=dp.IF[t],s=dp.FV[f]>0?dp.IV[t]/dp.FV[f]:0;I[j]+=dp.DI[f]*s;O[j]+=dp.DO[f]*s;}
  Object.defineProperty(dp,'_nio',{value:{I,O},enumerable:false});return dp._nio;}
// The flows as the PNI estimate reads them (38-pni-value.js): per item, at the peak hour, by the way it came in.
function engFlows(dp){const out=[],{FIN,VI,DI,WC,LX,FV}=dp;
  for(let t=0;t<dp.IF.length;t++){const j=dp.IJ[t],ep=dp.IE[t],k0=dp.epK[ep];if(j<0||dp.IO[t]<0||(k0!=='pop'&&k0!=='grp'))continue;const f=dp.IF[t],s=dp.IV[t]/(FV[f]||1),c=dp.epCity[ep],n=NETS[j].id;
    const o={c,n,rem:Math.max(0,(VI[f]-DI[f])*s),cache:dp.IC[t]===1,junk:false,bz:k0==='grp',ci:CIDX[c],cn:cnCity(c),ncn:!!NETS[j].cn,nj:j,nr:j,gt:0,gi:0,gp:0,gh:0,ti:null,ii:null};
    let tw=0;for(let k=0;k<3;k++)if(FIN[f*3+k]>=0)tw+=WC[f*3+k];
    for(let k=0;k<3;k++){const id=FIN[f*3+k];if(id<0||!(WC[f*3+k]>0))continue;const x=dp.ex[LX[id]],g=DI[f]*s*WC[f*3+k]/(tw||1);
      if(x.k==='t'){o.gt+=g;o.ti=x.id;}else if(x.k==='ix'){o.gi+=g;o.ii=x.id;}else if(x.k==='p'){if(x.city===c&&x.net===n)o.gh+=g;else o.gp+=g;}}
    out.push(o);}
  return out;}
// The exit a POP's own users leave by for network id (their biggest item), as {k, id}; null when none.
function engOutOf(city,id,r=R){const dp=r.dp;if(!dp||!dp.IOX)return null;const j=NETS.findIndex(n=>n.id===id);let best=-1,bv=-1;
  for(let t=0;t<dp.IJ.length;t++){if(dp.IJ[t]!==j||dp.epCity[dp.IE[t]]!==city||dp.epK[dp.IE[t]]!=='pop'||dp.IOX[t]<0)continue;if(dp.IV[t]>bv){bv=dp.IV[t];best=dp.IOX[t];}}
  return best<0?null:dp.ex[best];}
// A link's two pipes, oriented l.a→l.b, and an exit's (rx, tx); then one pipe at an hour.
function pipeOfLink(l,r=R){const i=r.ek&&r.ek[edgeKey(l)];if(i===undefined)return null;const a=l.a<l.b;return a?[2*i,2*i+1]:[2*i+1,2*i];}
// An exit's pipes by kind and id, through an index built once per routed day (the lists ask for thousands).
function pipeOfExit(k,id,r=R){const dp=r.dp;if(!dp)return null;let m=dp._exi;if(!m){m=new Map();dp.ex.forEach((e,x)=>{const key=e.k+'|'+e.id;if(!m.has(key))m.set(key,x);});Object.defineProperty(dp,'_exi',{value:m,enumerable:false});}
  const x=m.get(k+'|'+id);return x===undefined?null:[2*dp.NE+2*x,2*dp.NE+2*x+1];}
function pipeAt(p,h=R.hp,r=R){const dp=r.dp;if(!dp||p===null||p===undefined)return {off:0,loss:0,cap:0,dlv:0};const k=h*dp.NP+p,off=dp.OFFH[k],loss=dp.LOSSH[k];return {off,loss,cap:dp.CAP[p],dlv:off*(1-loss)};}
