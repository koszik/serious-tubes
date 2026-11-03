/* Endpoints, items and routes (docs/specs/network-engine.md §5, §6). An endpoint is your side: a POP's eyeballs, a
   group of customers of one class in one city, an L2 circuit, a cache's fill, an attack. An item is one endpoint and
   one far end (an origin, one of your POPs, the other site of a circuit) with its peak volume. */
function engItems(X){const {R2,PC,NN}=X,day=S.day,ev=S.ev,EP=X.EP=[],IT=X.IT=[];
  const viral=(ev.viral>day?1.25:1)*(ev.php&&ev.php>day?0.7:1),loc=scnRule('local'),mt=ev.pmtud&&ev.pmtud.until>day?ev.pmtud:null;
  const shTab=c=>cnCity(c)?NSH_CN:ruCity(c)?NSH_RU:CITY[c].kr&&S.krExit?NSH_KRX:NSH;
  const cacheNets=new Set(S.caches.filter(c=>popUp(c.city)).map(c=>c.net));
  // Goggle video is throttled in Russia (#70); PMTUD and Korean route events thin one network out; under `local`, what you
  // cannot reach is not asked for.
  const mods0=(c,n)=>(n.id==='ggl'&&ruCity(c)?0.5:1)*(mt&&mt.net===n.id?mt.f:1)*(CITY[c].kr&&ev.krroute>day&&n.id==='fbk'?0.8:1),mods=(c,n)=>mods0(c,n)*(loc&&!R2.reachable[n.id]?0:1);
  // What your users would send each network if they could reach it: what peering policies and caches ask about.
  const DEMTO=X.DEMTO=new Float64Array(NN);
  /* Puzzles and Architect runs have no clock: they are capacity puzzles with steady flows (every hour alike, circuits at
     their full rate both ways and ahead of best effort, eyeballs that only download, content from the source nearest its
     users), as their references
     were built for. */
  const FLAT=X.FLAT=pzOn()||!!S.ar;
  const ep=o=>{o.i=EP.length;o.ci=CIDX[o.city];o.T=TRAFFIC[o.cls];if(FLAT&&o.k==='l2')o.T={...o.T,in:1,out:1,pu:1};else if(FLAT)o.T={...o.T,out:0};o.has=prefixHas(PC,o);o.q=polQos(PC,o.has)||FLAT&&o.k==='l2'?1:0;o.sh=FLAT?SHAPE.flat:o.sh||SHAPE[o.T.shape];EP.push(o);return o;};
  const item=(e,o,j,v,x)=>{if(v>0||e.keep&&v>=0)IT.push(Object.assign({ep:e.i,o,j,v,ce:0},x));};
  // A share table already adds up to one; a class that talks to only some networks spreads its traffic over them.
  const serve=(e,sel,peak)=>{const SH=shTab(e.city);let t=1;if(sel!=='all'){t=0;for(const n of NETS)if(!(sel==='nonEye'&&n.type==='eye'||sel==='cdn'&&n.type!=='cdn'))t+=SH[n.id]||0;}if(t<=0)return;
    for(let j=0;j<NN;j++){const n=NETS[j],s=SH[n.id]||0;if(s<=0||sel==='nonEye'&&n.type==='eye'||sel==='cdn'&&n.type!=='cdn')continue;DEMTO[j]+=peak*s/t*mods0(e.city,n);const v=peak*s/t*mods(e.city,n);if(!(v>0)&&!(e.keep&&v===0))continue;const o=nearO(j,e.ci);
      if(e.cls==='home'&&cacheNets.has(n.id)){item(e,o,j,v*CACHE_HIT,{ce:1});item(e,o,j,v*(1-CACHE_HIT),{ce:2});}else item(e,o,j,v);}};
  // An audience: the eyeballs nearest and biggest, and every POP of yours with broadband (on-net traffic). Who is in it
  // does not change with demand, only how much each gets, so routing is kept from day to day.
  const aud=(e,peak)=>{const a=audStatic(e.ci).slice();for(const q of X.pops){const p=S.pops[q];if(q!==e.city&&p.bb)a.push([-1-CIDX[q],Math.max(0,p.bb.d)*EYE_W/(1+kmI(e.ci,CIDX[q])/AUD_KM)]);}
    const t=a.reduce((s,x)=>s+x[1],0);if(t<=0)return;for(const [o,w] of a)if(w>0){if(o>=0)DEMTO[ORIGINS[o].nj]+=peak*w/t;item(e,o,o>=0?ORIGINS[o].nj:-1,peak*w/t);}};
  for(const c of Object.keys(S.pops)){const p=S.pops[c],eye=(p.bb?p.bb.d:0)*viral*(cnCity(c)&&ev.golden>day?1.4:1);R2.cityEye[c]=eye;R2.cityDem[c]=0;R2.citySrv[c]=0;
    if(popUp(c)&&eye>0)serve(ep({k:'pop',city:c,cls:'home'}),'all',eye);}
  // Customers of one class in one city share their traffic and their service; tags (or a rule naming one) split them.
  // A booked event keeps its place (at zero) until it is over, so routing is not rebuilt the day it starts.
  const G=new Map();for(const b of S.biz){const T=BIZ_T[b.type],cls=CLASS_OF[b.type];if(!cls||T.fiber||T.l2||!popUp(b.city))continue;
    const tg=(polTags(PC,'b:'+b.id)||[]).join(','),key=b.city+'|'+cls+'|'+tg;let g=G.get(key);if(!g)G.set(key,g={k:'grp',city:b.city,cls,members:[],peak:0,key});g.members.push(b.id);
    if(T.event)g.keep=true;if(!T.event||eventLive(b))g.peak+=b.bw*TRAFFIC[cls].pu;}
  for(const g of G.values()){const e=ep(g),d=e.T.dst;if(d==='server')serve(e,e.T.nets,g.peak);else aud(e,g.peak);}
  // An embedded cache fills overnight from its own network, never from itself.
  for(const c of S.caches){if(!popUp(c.city))continue;const e=ep({k:'fill',city:c.city,cls:'fill',cache:c.id}),j=NETS.findIndex(n=>n.id===c.net);item(e,nearO(j,e.ci),j,cacheG(c)*FILL_F,{ce:3});}
  // L2 circuits: one item per pair of sites and per path (scenic circuits may split over two).
  // Each pair of sites is an endpoint of its own: a circuit is only as good as its worst pair (an SD-WAN needs every spoke).
  for(const b of S.biz){const T=BIZ_T[b.type];if(!T.l2)continue;const pairs=b.sites?b.sites.slice(1).map(x=>[b.sites[0],x]):[[b.city,b.city2]];let maxLat=0,noPath=false;
    for(const [A,B] of pairs){const e=ep({k:'l2',city:A,cls:CLASS_OF[b.type]||'enterprise',members:[b.id],b,sh:shapeOf(b),key:b.id+'>'+B});
      if(!(popUp(A)&&popUp(B)&&X.SPD[A]&&X.SPD[A][CIDX[B]]<Infinity)){noPath=true;e.dead=true;continue;}
      R2.egDesc['l2:'+b.id]={lab:labOf(b.sites?N_('compute.sd_wan_for_name'):N_('compute.l2vpn_for_name'),'name',b.name),city:A,k:'l2'};
      const routes=engL2Routes(X,A,B,b);if(routes.length>1)R2.l2split[b.id]=routes.length;
      for(const r of routes){maxLat=Math.max(maxLat,r.path.reduce((x,e)=>x+e.lat,0)+r.path.length*0.05);item(e,-1,-1,b.bw*e.T.pu*r.share,{site:r});}}
    R2.l2lat[b.id]=noPath?Infinity:maxLat;
    if((b.reqs||[]).includes('diverse'))R2.div[b.id]=engDisjoint(X,b.city,b.city2);}}
/* Scenic routing (#28): busy is judged without the circuit's own traffic of yesterday; two paths about as quiet share it,
   and yesterday's choice stays unless today's is clearly better. Fast takes the lowest latency; normal follows metrics. */
function engL2Routes(X,A,B,b){const {adj,SPP,edges}=X,m=b.route||'normal',Ai=CIDX[A],Bi=CIDX[B];
  const wLat=e=>e.lat+0.05,fast=X.fastSP||(X.fastSP={});
  if(m!=='scenic')return [{...walkI(m==='fast'?(fast[A]||(fast[A]=dijkstra(adj,Ai,wLat))).P:SPP[A],Ai,Bi),share:1}];
  const key=b.id+'>'+A+'>'+B,old=R.l2route&&R.l2route[key],mine=new Set(old?old.flatMap(r=>r.keys):[]);
  const pl=e=>{let ld=0;for(const l of e.links)ld+=(R.load&&R.load[l.id])||0;return Math.max(0,ld-(mine.has(e.id)?b.bw:0));};
  const wf=e=>e.w*(1+10*(e.cap?pl(e)/e.cap:0)),cost=r=>r.path.reduce((x,e)=>x+wf(e),0)*r.share;
  const s1=dijkstra(adj,Ai,wf,null,Bi);if(s1.D[Bi]===Infinity)return [{...walkI(SPP[A],Ai,Bi),share:1}];
  const p1=walkI(s1.P,Ai,Bi),c1=cost({path:p1.path,share:1}),used=new Set(p1.path.map(e=>e.id));let pick=[{...p1,share:1}];
  const s2=dijkstra(adj,Ai,wf,(v,e)=>used.has(e.id),Bi);
  if(s2.D[Bi]!==Infinity){const p2=walkI(s2.P,Ai,Bi);if(cost({path:p2.path,share:1})<=c1*1.15)pick=[{...p1,share:0.5},{...p2,share:0.5}];}
  let out=pick;if(old&&old.every(r=>r.keys.every(k=>edges[k]))){const prev=old.map(r=>({path:r.keys.map(k=>edges[k]),ni:r.ns.map(c=>CIDX[c]),share:r.share}));
    if(prev.reduce((x,r)=>x+cost(r),0)<=pick.reduce((x,r)=>x+cost(r),0)*1.1)out=prev;}
  X.R2.l2route[key]=out.map(r=>({keys:r.path.map(e=>e.id),ns:r.ni.map(i=>CITIES[i].id),share:r.share}));return out;}
// Two paths sharing no trench (or fabric) between A and B, on today's live links.
function engDisjoint(X,A,B){const memo=X.divM||(X.divM={}),k=A+'>'+B;if(memo[k]!==undefined)return memo[k];
  const LA=X.LA||(X.LA=(()=>{const L=[];for(const e of X.EA)for(const l of e.links){(L[e.ai]||(L[e.ai]=[])).push([e.bi,l]);(L[e.bi]||(L[e.bi]=[])).push([e.ai,l]);}return L;})());
  const srlg=l=>l.kind==='vxc'?'fab:'+l.prov:(l.trench||l.id),NC=CITIES.length;
  const bfs=(a,b,skip)=>{const prev=[],seen=new Uint8Array(NC),q=[a];seen[a]=1;for(let h=0;h<q.length;){const u=q[h++];if(u===b)break;for(const [v,l] of LA[u]||[])if(!seen[v]&&!(skip&&skip.has(srlg(l)))){seen[v]=1;prev[v]=l;q.push(v);}}
    if(!seen[b])return null;const path=[];let v=b;while(v!==a){const l=prev[v];path.push(l);v=CIDX[l.a]===v?CIDX[l.b]:CIDX[l.a];}return path;};
  const a=CIDX[A],b=CIDX[B],p1=bfs(a,b,null);return memo[k]=!!p1&&!!bfs(a,b,new Set(p1.map(srlg)));}

/* Routes, then the merged flows and their pipe lists. Pipes: edge i gives 2i (a→b) and 2i+1 (b→a); exit x gives
   2NE+2x (rx, into your network) and 2NE+2x+1 (tx). A list is a run of (pipe, share, branch start) plus the routers on
   it; lists are shared by every flow on the same path. */
/* What routing works out from the network's shape, kept while nothing it is built from changes (most days only volumes
   move): the graph and exits, the policy and the events behind them, and every item's endpoint and far end. */
const ENGC={key:null};
function engKey(X,structOnly){const ev=S.ev,d=S.day;let k=(X.GK||'')+'#'+polKey()+'#'+(ev.depeer>d||scnRule('spat')?1:0)+'|'+(ev.leak&&ev.leak.until>d?ev.leak.net:'')+'|'+(scnRule('sender')?1:0)+'|'+(ev.rpki&&ev.rpki.until>d?ev.rpki.nets.join(','):'')+'#'+(S.te&&S.te.on&&coreTE()?'te':'')+(pzOn()||S.ar?'flat':'')+'#'+(scnRule('local')?1:0)+'#'+(coreOn()&&S.core.run>=1?S.core.run+':'+X.pops.map(c=>inCore(c)?1:0).join(''):'');for(const e of X.E)k+='\n'+e.ek+'|'+e.net+'|'+e.city+'|'+e.pref+'|'+(e.nets?e.nets.size??e.nets.length:'*')+'|'+(e.dir?e.dir.size:0);
  k+='#'+NET_IDS.map(n=>X.okBy[n].length).join(',');if(structOnly)return k;
  for(const it of X.IT){const e=X.EP[it.ep];k+=';'+e.k+e.city+e.cls+(e.key||'')+(e.cache||'')+(e.b?e.b.id:'')+'|'+it.o+'|'+it.j+'|'+it.ce;if(it.site)k+='|'+it.site.path.map(p=>p.id).join(',')+'|'+it.site.share;}
  return k;}
function engRoute(X){const key=RC.on&&X.GK!==null?engKey(X):null;
  if(key!==null&&ENGC.key===key){const C=ENGC;
    X.L=C.L;X.M=C.M;X.CH=C.CH;X.LALT=C.LALT;X.POPI=C.POPI;X.POPC=C.POPC;X.SHL=C.SHL;X.pathList=C.pathList;X.walkList=C.walkList;X.inList=C.inList;
    const F=X.F={...C.F,v:new Array(C.F.ep.length).fill(0)};X.IT.forEach((it,i)=>{const m=C.IT[i];Object.assign(it,m);F.v[m.f]+=it.v;});return;}
  engRouteBuild(X);
  if(key!==null){
    Object.assign(ENGC,{key,L:X.L,M:X.M,CH:X.CH,LALT:X.LALT,POPI:X.POPI,POPC:X.POPC,SHL:X.SHL,pathList:X.pathList,walkList:X.walkList,inList:X.inList,F:{...X.F,v:null},
      IT:X.IT.map(it=>({f:it.f,lat:it.lat,inX:it.inX,outX:it.outX,lx:it.lx,tz:it.tz}))});}}
/* What routing learns from the network's structure alone (views, best paths, ways in, pipe lists, second paths): kept
   while the structure stays (ENGS), so a day where only customers sign or leave redoes just the per-item work. */
const ENGS={key:null,M:null};
function engMemo(){return {VIEW:new Map([['',0]]),VR:[null],VSP:[null],OT:new Map(),TS:new Map(),CH:[],CHM:new Map(),CHK:new Map(),XA:new Map(),INM:new Map(),
  L:{LP:[],LS:[],LB:[],LOFF:[0],LN:[],LW:[],LNOFF:[0],LX:[]},LMEM:new Map(),LMETA:[],CVW:new Map(),CT:new Map(),LALT:[],altN:0,SHI:new Map(),SHL:[]};}
function engRouteBuild(X){const {E,okBy,PC,COMP,SDi,SPi,adj,wW,NE,R2,EP,IT,NC}=X,day=S.day;
  const SK=RC.on&&X.GK!==null?engKey(X,true):null;let M=SK!==null&&ENGS.key===SK?ENGS.M:null;if(!M){M=engMemo();if(SK!==null){ENGS.key=SK;ENGS.M=M;}}X.M=M;
  const POPI=new Int32Array(NC).fill(-1),POPC=[];for(const c of X.pops){POPI[CIDX[c]]=POPC.length;POPC.push(c);}X.POPI=POPI;X.POPC=POPC;
  const CORE=coreOn()&&S.core.run>=1,PASS=c=>CORE?corePass(CITIES[c].id):1;
  // Views: the graph without the links a route may not cross. View 0 is the whole graph.
  const {VIEW,VR,VSP}=M;
  const viewOf=k=>{let v=VIEW.get(k);if(v===undefined){v=VR.length;VIEW.set(k,v);VR.push(new Set(k.split(',')));VSP.push([]);}return v;};
  const spOf=(v,pi)=>{if(!v)return {D:SDi[pi],P:SPi[pi]};const m=VSP[v];return m[pi]||(m[pi]=dijkstra(adj,pi,wW,(u,e)=>VR[v].has(e.id)));};
  // Outbound: each network's routes in BGP order (local-pref, then AS path), per region when a rule asks about regions.
  const OT=M.OT,TS=M.TS,tiersOf=o=>{const O=ORIGINS[o],key=PC.reg?O.net+'|'+O.reg:O.net;let t=OT.get(key);if(t)return t;const L=[];
    for(const e of okBy[O.net]){const has=PC.any?routeHas(PC,e,O,X.coneOf(e,O.net)):null,lp=PC.any?polImport(PC,e,has):(e.pref==='high'?150:e.pref==='low'?20:100);if(lp===null)continue;
      L.push({e,lp,as:asLen(e,O.net),v:PC.linkAny?viewOf(polNoCarry(PC,has)):0,has});}
    L.sort((a,b)=>b.lp-a.lp||a.as-b.as||a.e.xi-b.e.xi);
    // Tiers of equal (local-pref, AS path), each by city (the oldest exit first); networks with the same tiers share them.
    const T=[];for(let i=0;i<L.length;){let j=i;while(j<L.length&&L[j].lp===L[i].lp&&L[j].as===L[i].as)j++;const by=new Map();for(let k=i;k<j;k++){const r=L[k],q=r.e.ci*64+r.v;let a=by.get(q);if(!a)by.set(q,a=[]);a.push(r);}T.push([...by.values()]);i=j;}
    let h1=2166136261,h2=0;for(const g of T){h1=Math.imul(h1^0x3b,16777619);for(const a of g){h1=Math.imul(h1^0x2c,16777619);for(const r of a){const v=r.e.xi*131+r.v;h1=Math.imul(h1^v,16777619);h2=(h2*31+v+7)|0;}}}
    const sig=h1+':'+h2+':'+L.length;let id=TS.get(sig);if(id===undefined)TS.set(sig,id=TS.size);
    OT.set(key,t={L,T,id});return t;};
  // The best route from POP pi (multipath shares the ties), as a choice id into CH: [[exit, share, view], …].
  const CH=X.CH=M.CH,CHM=M.CHM,CHK=M.CHK;
  const pick=(T,pi,mp)=>{const isl=COMP[pi];let best=null;
    for(const g of T){for(const a of g){const e=a[0].e;if(COMP[e.ci]!==isl)continue;const D=spOf(a[0].v,pi).D[e.ci];if(!(D<Infinity))continue;const eb=e.ci===pi?0:1;
        if(!best||eb<best.eb||eb===best.eb&&D<best.D-1e-6)best={eb,D,set:mp?a.slice():[a[0]]};else if(mp&&eb===best.eb&&Math.abs(D-best.D)<=1e-6)best.set.push(...a);}
      if(best)break;}
    return best;};
  const choose=(t,pi)=>{const city=CITIES[pi].id,rs=PC.popAny?polAt(PC.pop,city):null,key=rs?'n'+t.L.length+'|'+t.id+'|'+pi:typeof t.id==='string'?t.id+'|'+pi:t.id*NC+pi;let c=CHM.get(key);if(c!==undefined)return c;const mp=!!PC.mp[city];
    let T=t.T;if(rs){const L=[];for(const r0 of t.L){let lp=r0.lp,deny=false;for(const r of rs)if(polHit(r,r0.has)){if(r.act==='deny')deny=true;else lp=r.n;break;}if(!deny)L.push({...r0,lp});}
      L.sort((a,b)=>b.lp-a.lp||a.as-b.as||a.e.xi-b.e.xi);T=[];for(let i=0;i<L.length;){let j=i;while(j<L.length&&L[j].lp===L[i].lp&&L[j].as===L[i].as)j++;const by=new Map();for(let k=i;k<j;k++){const r=L[k],q=r.e.ci*64+r.v;let a=by.get(q);if(!a)by.set(q,a=[]);a.push(r);}T.push([...by.values()]);i=j;}}
    const best=pick(T,pi,mp);c=-1;
    if(best){best.set.sort((a,b)=>a.e.xi-b.e.xi);const k=best.set.map(r=>r.e.xi+'.'+r.v).join(',');c=CHK.get(k);if(c===undefined){c=CH.length;CHK.set(k,c);CH.push(best.set.map(r=>[r.e.xi,1/best.set.length,r.v]));}}
    CHM.set(key,c);return c;};
  // Inbound: where the far network sends traffic for your prefixes — its customer or peer route first, then the shortest AS
  // path (your prepends count), then its hot potato (the exit nearest to it). A CDN maps your users onto its cache first.
  const expM=e=>{if(!PC.expAny)return '';const m=[];let i=0;for(const rs of PC.exp.values())for(const r of rs){if(polHit(r,e.has))m.push(i);i++;}return m.join(',');};
  for(const e of EP)e.xm=expM(e);
  const XA=M.XA,XA0={no:false,prep:0,reg:false,bh:false},XA3={no:false,prep:3,reg:false,bh:false},xattr=(x,e)=>{if(!PC.expAny)return x.pref==='low'?XA3:XA0;const k=x.xi+'|'+e.xm;let a=XA.get(k);if(!a)XA.set(k,a=PC.expAny?polExport(PC,x,e.has):{no:false,prep:x.pref==='low'?3:0,reg:false,bh:false});return a;};
  const INM=M.INM,inCands=(o,e,ce)=>{const O=ORIGINS[o],pi=e.ci,isl=COMP[pi],key=o+'|'+isl+'|'+e.xm+'|'+(ce===1?pi:ce===0?'':'n');let c=INM.get(key);if(c)return c;
    const sc=[];for(const x of okBy[O.net]){if(COMP[x.ci]!==isl)continue;if(x.k==='c'&&ce!==1)continue;const a=xattr(x,e);if(a.no||a.reg&&CITY[x.city].rg!==O.reg)continue;
      // A cache maps users only across the links its routes may cross (a `nocarry` rule keeps it to its side).
      if(x.k==='c'&&PC.linkAny){const v=viewOf(polNoCarry(PC,routeHas(PC,x,O,false)));CVW.set(x.xi+'|'+pi,v);if(!(spOf(v,pi).D[x.ci]<Infinity))continue;}
      const al=asLen(x,O.net),rel=x.k==='c'?0:(x.k==='p'&&x.net===O.net)||(x.k==='ix'&&al===1&&x.id!=='~grace')?1:2;
      // Ties between equally near ways in go by the far side's own tie-breaks: stable, and spread over your ports.
      const s={x,rel,as:al+a.prep,d:x.k==='c'||X.FLAT?SDi[pi][x.ci]:Math.round(kmI(O.ci,x.ci)),t:-1,o:O};
      // Only the three best are kept: the way in, and two to spill onto.
      if(sc.length<3||cmpIn(s,sc[sc.length-1])<0){sc.push(s);sc.sort(cmpIn);if(sc.length>3)sc.pop();}}
    c=sc.map(s=>s.x.xi);INM.set(key,c);return c;},tieH=s=>s.t>=0?s.t:(s.t=hstr(s.o.net+'|'+s.o.reg+'|'+s.x.k+'|'+s.x.city+'|'+(s.x.net||'')+'|'+s.x.xi)),
    cmpIn=(a,b)=>a.rel-b.rel||a.as-b.as||a.d-b.d||tieH(a)-tieH(b)||a.x.xi-b.x.xi;
  // Pipe lists, shared by key.
  const L0=X.L=M.L,{LP,LS,LB,LOFF,LN,LW,LNOFF,LX}=L0,LMEM=M.LMEM;
  const ePipe=(e,from)=>2*e.i+(from===e.ai?0:1),xRx=x=>2*NE+2*x,xTx=x=>2*NE+2*x+1;
  const close=x=>{LOFF.push(LP.length);LNOFF.push(LN.length);LX.push(x);return LOFF.length-2;};
  const node=(ci,w)=>{const k=POPI[ci];if(k>=0){LN.push(k);LW.push(w);}};
  // From city index `from` along a dijkstra tree P rooted at `root` (towards it), or the reverse (`away`).
  const walk=(P,root,from,away,share,first)=>{const {path,ni}=walkI(P,root,from);const n=path.length;
    if(!away){for(let k=0;k<n;k++){LP.push(ePipe(path[k],ni[k]));LS.push(share);LB.push(first&&k===0?1:0);}for(let k=0;k<ni.length;k++)node(ni[k],(k&&k<ni.length-1?PASS(ni[k]):1)*share);}
    else{for(let k=n-1;k>=0;k--){LP.push(ePipe(path[k],ni[k+1]));LS.push(share);LB.push(first&&k===n-1?1:0);}for(let k=ni.length-1;k>=0;k--)node(ni[k],(k&&k<ni.length-1?PASS(ni[k]):1)*share);}
    return n;};
  // LMETA[id]: how a single-path list was walked, so Auto-TE can build it a second path (§7.3).
  const LMETA=X.LMETA=M.LMETA;
  const CVW=M.CVW,cview=(x,pi)=>E[x].k==='c'?CVW.get(x+'|'+pi)||0:0;
  const inList=(x,pi)=>{const v=cview(x,pi),k='i'+x+'|'+pi+'|'+v;let id=LMEM.get(k);if(id!==undefined)return id;const ex=E[x];LP.push(xRx(x));LS.push(1);LB.push(1);
    walk(spOf(v,pi).P,pi,ex.ci,false,1,false);LMEM.set(k,id=close(x));LMETA[id]={x,pi,v,away:false};return id;};
  const outList=(c,pi)=>{const k='o'+c+'|'+pi;let id=LMEM.get(k);if(id!==undefined)return id;
    for(const [x,sh,v] of CH[c]){const ex=E[x],n=walk(spOf(v,pi).P,pi,ex.ci,true,sh,true);LP.push(xTx(x));LS.push(sh);LB.push(n?0:1);}
    LMEM.set(k,id=close(CH[c][0][0]));if(CH[c].length===1)LMETA[id]={x:CH[c][0][0],pi,v:CH[c][0][2],away:true};return id;};
  // A list along a given dijkstra tree (Auto-TE's second paths), with its exit's pipe.
  const altList=(m,P)=>{const ex=E[m.x];if(!m.away){LP.push(xRx(m.x));LS.push(1);LB.push(1);walk(P,m.pi,ex.ci,false,1,false);}else{const n=walk(P,m.pi,ex.ci,true,1,true);LP.push(xTx(m.x));LS.push(1);LB.push(n?0:1);}return close(m.x);};
  // A path given as edges and cities (an L2 circuit, a haul): forwards from ni[0], or backwards.
  const pathList=(r,back)=>{const mk='p'+(back?1:0)+'|'+r.ni.join(',');let id=LMEM.get(mk);if(id!==undefined)return id;id=pathList0(r,back);LMEM.set(mk,id);return id;};
  const pathList0=(r,back)=>{const {path,ni}=r,n=path.length;
    if(!back)for(let k=0;k<n;k++){LP.push(ePipe(path[k],ni[k]));LS.push(1);LB.push(k===0?1:0);}else for(let k=n-1;k>=0;k--){LP.push(ePipe(path[k],ni[k+1]));LS.push(1);LB.push(k===n-1?1:0);}
    for(let k=0;k<ni.length;k++){const q=back?ni.length-1-k:k;node(ni[q],k&&k<ni.length-1?PASS(ni[q]):1);}return close(-1);};
  X.pathList=pathList;X.inList=inList;X.walkList=(v,root,from,away)=>{const mk='w'+v+'|'+root+'|'+from+'|'+(away?1:0);let id=LMEM.get(mk);if(id===undefined){walk(spOf(v,root).P,root,from,away,1,true);LMEM.set(mk,id=close(-1));}return id;};
  // One-way backbone latency from POP pi to city ci along the IGP path, once per pair.
  const BMS=M.BMS||(M.BMS=new Map()),bbMs=(pi,ci)=>{if(ci===pi||!(SDi[pi][ci]<Infinity))return 0;const k=pi*NC+ci;let v=BMS.get(k);if(v===undefined){v=0;for(const ed of walkI(SPi[pi],pi,ci).path)v+=ed.lat;BMS.set(k,v);}return v;};
  // Each item: its far end's timezone, its routes and lists, then its flow (items alike share one).
  const FM=new Map(),F=X.F={v:[],fi:[],fo:[],sh:[],tz:[],q:[],g:[],in:[],out:[],cdn:[],ep:[],kind:[],oalt:[],cap:[]},SHI=X.SHI=M.SHI,SHL=X.SHL=M.SHL;
  // Puzzles route like a network with Auto-TE: what does not fit spills onto the next path, as their references expect.
  const TEON=!!(S.te&&S.te.on)&&coreTE()||pzOn()||!!S.ar,CAPN=TEON&&X.TRX&&Object.keys(X.TRX.cap).length?new Set(Object.keys(X.TRX.cap)):null,CT=M.CT;
  const capTiers=(t,o)=>{let c=CT.get(t.id);if(c)return c;const L=t.L.filter(r=>!CAPN.has(r.e.net));const T=[];
    for(let i=0;i<L.length;){let j=i;while(j<L.length&&L[j].lp===L[i].lp&&L[j].as===L[i].as)j++;const by=new Map();for(let k=i;k<j;k++){const r=L[k],q=r.e.ci*64+r.v;let a=by.get(q);if(!a)by.set(q,a=[]);a.push(r);}T.push([...by.values()]);i=j;}
    CT.set(t.id,c={L,T,id:'c'+t.id});return c;};
  const shapeId=a=>{let i=SHI.get(a);if(i===undefined){i=SHL.length;SHI.set(a,i);SHL.push(a);}return i;};
  const gfwL=ev=>ev.gfw>day?0.35:0.2;
  for(const it of IT){const e=EP[it.ep],T=e.T,pi=e.ci;let oalt=-1,capK=null,ins=[-1,-1,-1],out=-1,tz=e.city?CITY[e.city].tz:0,cdn=0,g=0,lat=0,inX=-1,outX=-1;
    if(it.site){out=pathList(it.site,true);ins[0]=pathList(it.site,false);}
    else if(it.o<0){const qi=-1-it.o;tz=CITIES[qi].tz;
      if(COMP[qi]===COMP[pi]&&SDi[pi][qi]<Infinity){out=X.walkList(0,pi,qi,true);ins[0]=X.walkList(0,pi,qi,false);}
      else{// Between islands your own prefixes come back with your AS in the path: dropped, unless a session accepts them.
        const fx=E.find(x=>x.k!=='c'&&COMP[x.ci]===COMP[pi]&&PC.sess[exRef(x)]),qx=fx&&E.find(x=>x.k!=='c'&&COMP[x.ci]===COMP[qi]);
        if(fx&&qx){const mk='j'+pi+'|'+qi+'|'+fx.xi+'|'+qx.xi;let j=LMEM.get(mk);if(!j){j=[engJoin(X,[[SPi[pi],pi,fx.ci,true],['tx',fx.xi],['rx',qx.xi],[SPi[qi],qi,qx.ci,false]]),engJoin(X,[[SPi[qi],qi,qx.ci,true],['tx',qx.xi],['rx',fx.xi],[SPi[pi],pi,fx.ci,false]])];LMEM.set(mk,j);}out=j[0];ins[0]=j[1];}}}
    else{const O=ORIGINS[it.o];if(T.who==='o')tz=O.tz;
      const cs=inCands(it.o,e,it.ce);for(let k=0;k<cs.length&&k<(NET[O.net].type==='cdn'?3:1);k++)ins[k]=inList(cs[k],pi);if(cs.length)inX=cs[0];
      if(it.ce===1&&cs.length&&E[cs[0]].k==='c'){const id=X.walkList(cview(cs[0],pi),pi,E[cs[0]].ci,true),mk='c'+id+'|'+cs[0];out=LMEM.get(mk);if(out===undefined){out=engCat(X,id,engJoin(X,[['tx',cs[0]]]),cs[0]);LMEM.set(mk,out);}}
      else{const t=tiersOf(it.o),c=choose(t,pi);if(c>=0){out=outList(c,pi);outX=CH[c][0][0];
        // Auto-TE caps an upstream: what is over the cap takes the best route that avoids it.
        if(CAPN&&CH[c].some(([x])=>CAPN.has(E[x].net))){const ca=choose(capTiers(t,it.o),pi);capK=E[outX].net;if(ca>=0)oalt=outList(ca,pi);}}}
      cdn=NET[O.net].type==='cdn'&&cs.length>1?1:0;
      // The Great Firewall on traffic crossing China's border (a premium path loses far less).
      if(inX>=0){const x=E[inX],cf=cnCity(e.city),cn=!!NETS[it.j].cn;if(cf!==x.cn||(cf&&!cn)||(!cf&&cn&&x.k==='t'))g=(x.k==='t'&&x.prem)||(x.k==='p'&&x.pnc)?0.03:gfwL(S.ev);}
      // Detour: the part of the trip to the far end that is yours to shorten.
      const lx=outX>=0?outX:inX;if(lx>=0&&e.k!=='fill'){const x=E[lx],ms=bbMs(pi,x.ci);
        // Under sender pays Korean users mind the haul itself, however direct (Gangnam Style Peering).
        lat=CITY[e.city].kr&&scnRule('sender')?ms:Math.max(0,ms+(kmI(x.ci,O.ci)-kmI(pi,O.ci))*KM_MS);it.lx=lx;}}
    it.lat=lat;it.inX=inX;it.outX=outX;it.tz=tz;
    const sh=shapeId(e.sh),key=it.site||it.o<0?null:e.i+'|'+tz+'|'+ins.join(',')+'|'+out+'|'+oalt+'|'+g+'|'+(cdn?it.j:'');let f=key===null?undefined:FM.get(key);
    if(f===undefined){f=F.v.length;if(key!==null)FM.set(key,f);F.v.push(0);F.fi.push(T.in);F.fo.push(T.out);F.sh.push(sh);F.tz.push(tz);F.q.push(e.q);F.g.push(g);F.in.push(ins);F.out.push(out);F.cdn.push(cdn);F.ep.push(e.i);F.kind.push(0);F.oalt.push(oalt);F.cap.push(capK);}
    F.v[f]+=it.v;it.f=f;}
  // Auto-TE's second paths: for every single-path list, the shortest path avoiding its links, if it is not too long.
  const LALT=X.LALT=M.LALT;if(TEON){const REACH=coreTeReach(),CORE2=coreOn()&&S.core.run>=1,OUTC=c=>CORE2&&!inCore(CITIES[c].id);
    for(let id=M.altN;id<LMETA.length;id++){const m=LMETA[id];if(!m)continue;const ex=E[m.x];if(ex.ci===m.pi)continue;const P0=spOf(m.v,m.pi),base=P0.D[ex.ci];if(!(base<Infinity))continue;
      const used=new Set(walkI(P0.P,m.pi,ex.ci).path.map(e=>e.id)),r=dijkstra(adj,m.pi,wW,(u,e)=>used.has(e.id)||(m.v&&VR[m.v].has(e.id))||(OUTC(u)&&u!==ex.ci),ex.ci);
      if(r.D[ex.ci]<Infinity&&r.D[ex.ci]<=REACH*base+60)LALT[id]=altList(m,r.P);}M.altN=LMETA.length;}}
// Two lists one after the other (a walk, then a port), as one list ending at exit x.
function engCat(X,a,b,x){const L=X.L,s=L.LOFF[a],e=L.LOFF[a+1],s2=L.LOFF[b],e2=L.LOFF[b+1],ns=L.LNOFF[a],ne=L.LNOFF[a+1];
  const P=L.LP.slice(s,e).concat(L.LP.slice(s2,e2)),Sh=L.LS.slice(s,e).concat(L.LS.slice(s2,e2)),B=L.LB.slice(s,e).concat(L.LB.slice(s2,e2).map(()=>0));if(B.length)B[0]=1;
  const N=L.LN.slice(ns,ne),W=L.LW.slice(ns,ne);for(let k=0;k<P.length;k++){L.LP.push(P[k]);L.LS.push(Sh[k]);L.LB.push(B[k]);}for(let k=0;k<N.length;k++){L.LN.push(N[k]);L.LW.push(W[k]);}
  L.LOFF.push(L.LP.length);L.LNOFF.push(L.LN.length);L.LX.push(x);return L.LOFF.length-2;}
// A list made of pieces: tree walks [P, root, from, away] and exit pipes ['rx'|'tx', x].
function engJoin(X,parts){const L=X.L,NE=X.NE;let first=true;
  for(const p of parts){if(p[0]==='rx'||p[0]==='tx'){L.LP.push(2*NE+2*p[1]+(p[0]==='tx'?1:0));L.LS.push(1);L.LB.push(first?1:0);first=false;continue;}
    const [P,root,from,away]=p,{path,ni}=walkI(P,root,from),n=path.length,ePipe=(e,f)=>2*e.i+(f===e.ai?0:1);
    if(!away)for(let k=0;k<n;k++){L.LP.push(ePipe(path[k],ni[k]));L.LS.push(1);L.LB.push(first?1:0);first=false;}
    else for(let k=n-1;k>=0;k--){L.LP.push(ePipe(path[k],ni[k+1]));L.LS.push(1);L.LB.push(first?1:0);first=false;}
    for(const c of ni){const k=X.POPI[c];if(k>=0){L.LN.push(k);L.LW.push(1);}}}
  L.LOFF.push(L.LP.length);L.LNOFF.push(L.LN.length);L.LX.push(-1);return L.LOFF.length-2;}
