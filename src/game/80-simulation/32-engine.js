/* ================= THE ENGINE (docs/specs/network-engine.md §5–§9) =================
   One call routes a whole day. The control plane is BGP and never looks at capacity: every endpoint's traffic to each
   origin takes the best path (local-pref, AS path, eBGP over iBGP, IGP, oldest), and traffic toward you enters where the
   far network chooses. The data plane then offers each of 24 hours to two pipes per link and per port; what does not
   fit is dropped. Demand is kept per item (an endpoint and one far end) for reports, and routed as merged flows
   (items with the same path, class, timezone and queue), so the hourly loop stays small on big networks. */
const EYE_W=1e-5,CACHE_HIT=0.85,SPILL_CDN=0.95,AUD_KM=3000,AUD_N=40,FILL_F=0.08,KM_MS=1/154;
// Distances between cities, worked out once each (the catalog never moves).
let KMM=null;
function kmI(a,b){const n=CITIES.length;if(!KMM)KMM=new Float64Array(n*n).fill(-1);const k=a*n+b;let v=KMM[k];
  if(v<0){const A=CITIES[a],B=CITIES[b];v=KMM[k]=KMM[b*n+a]=a===b?0:hav(A.lon,A.lat,B.lon,B.lat);}return v;}
// The origin of network j that serves city ci (CDN mapping: the one with the server nearest it), the city of that
// server, and a city's biggest audiences. A content network serves Paris from Paris when it is there, not from London.
let NEARO=null,SRVO=null;
function srvOf(o,ci){const n=CITIES.length;if(!SRVO)SRVO=new Int32Array(ORIGINS.length*n).fill(-1);const k=o*n+ci;let v=SRVO[k];
  if(v<0){const sv=ORIGINS[o].sv;v=sv[0];for(const s of sv)if(kmI(ci,s)<kmI(ci,v))v=s;SRVO[k]=v;}return v;}
// Under sender pays, content networks keep their servers out of Korea and serve it from next door (Gangnam Style Peering).
function srvNoKr(o,ci){const sv=ORIGINS[o].sv;let v=-1;for(const s of sv)if(!CITIES[s].kr&&(v<0||kmI(ci,s)<kmI(ci,v)))v=s;return v<0?srvOf(o,ci):v;}
function nearO(j,ci){const n=CITIES.length;if(!NEARO)NEARO=new Int32Array(NETS.length*n).fill(-1);const k=j*n+ci;let v=NEARO[k];
  if(v<0){const L=ORIG_BY_NET[NETS[j].id],C=L.some(o=>o.content>0)?L.filter(o=>o.content>0):L,d=o=>kmI(ci,srvOf(o.i,ci));let b=C[0];for(const o of C)if(d(o)<d(b))b=o;v=NEARO[k]=b.i;}return v;}
const AUDM=new Map();
function audStatic(ci){let a=AUDM.get(ci);if(a)return a;a=[];for(const o of ORIGINS)if(o.users>0)a.push([o.i,o.users/(1+kmI(ci,o.ci)/AUD_KM)]);
  a.sort((x,y)=>y[1]-x[1]||x[0]-y[0]);a=a.slice(0,AUD_N);AUDM.set(ci,a);return a;}
// The exits of today: transit, exchanges, PNIs, caches and the courtesy route.
function engExits(R2,day,remote,depeer,leak,snd){const E=[];
  for(const t of S.transit){if(!popUp(t.city)||t.down>day||!liveN(t.city,t.site,t.n))continue;
    const ex=mkEx('t',t.id,t.city,liveCap(PORT[t.tier].g,t.city,t.site,t.n)*lagF(t),3,t.pref||'normal',labOf(N_('common.net_transit'),'net',NET[t.net].name),n=>!(depeer&&t.net==='cog'&&n==='ggl')&&n!==leak&&!(snd&&NET[n].kr),null,t.net);
    ex.clean=!!t.clean;ex.prem=premOn(t);ex.carry=!!t.carry;E.push(ex);}
  for(const c in S.ixp){const ct=ixCity(c);if(!(popUp(ct)||remote.includes(ct))||(S.ev.ixdown&&S.ev.ixdown[c]>day)||!(S.myIx[c]?myIxLive(c):liveN(ct,(S.ixSite||{})[c],(S.ixn||{})[c])))continue;const set=ixSessions(c);R2.sessions+=set.size;
    // A peer announces its customers too (#85): the session reaches its cone, one AS hop further.
    let all=set;for(const id of set)if(DOWN[id].length){if(all===set)all=new Set(set);for(const x of DOWN[id])all.add(x);}
    const x=mkEx('ix',c,ct,ixCap(c),2,(S.ixPref&&S.ixPref[c])||'normal',labOf(N_('common.ix_peering'),'ix',ixName(c)),n=>all.has(n),all);x.dir=all===set?null:set;E.push(x);}
  for(const p of S.pni){if(!pniOn(p)||!popUp(p.city)||!liveN(p.city,p.site,p.n))continue;R2.sessions++;
    const x=mkEx('p',p.id,p.city,liveCap(pniG(p),p.city,p.site,p.n)*lagF(p)*(p.sacrif?0.5:1),1,p.pref||'normal',labOf(N_('common.pni_with_net'),'net',NET[p.net].name),n=>CONE_S[p.net].has(n),CONE[p.net],p.net);x.sac=!!p.sacrif;x.pnc=!!NET[p.net].cn;E.push(x);}
  for(const c of S.caches){if(!popUp(c.city)||siteDown(c.city,c.site==='b'?'b':'a'))continue;const x=mkEx('c',c.id,c.city,cacheG(c),0,'normal',labOf(N_('common.name_cache'),'name',NET[c.net].cache.name),n=>n===c.net,[c.net],c.net);E.push(x);}
  // After an update adds networks, a free courtesy route reaches the new ones you have no other way to (#46).
  R2.graceNets=0;if(S.grace&&S.grace.until>day){const pops=Object.keys(S.pops).filter(popUp),gs=new Set(S.grace.nets.filter(n=>NET[n]&&!E.some(e=>e.k!=='c'&&e.ok(n)))),hc=popUp(S.home)?S.home:pops[0];
    R2.graceNets=gs.size;if(gs.size&&hc)E.push(mkEx('ix','~grace',hc,1e9,2,'normal',tr('compute.courtesy_route_to_new_networks'),n=>gs.has(n),gs));}
  return E;}
// AS hops from your exit e to network n: its own network 1, a customer of it 2, anything else via transit 3.
const asLen=(e,n)=>e.k==='c'?1:e.k==='p'?(e.net===n?1:2):e.k==='ix'?(e.id==='~grace'?2:e.dir&&!e.dir.has(n)?2:1):e.net===n?1:CONE_S[e.net].has(n)?2:3;

function compute(){RW.gen++;
  const R2=emptyR();R2.l2route={};R2.l2split={};R2.bizDem={};R2.bizSrv={};const X=engBase(R2);
  engItems(X);engRoute(X);engHours(X);engResults(X);
  computeMoney(R2);R=R2;UI.hotMap=hotByCity();}
// The graph, today's exits and who reaches whom: what every routing question starts from (the looking glass too).
function engBase(R2){const day=S.day,pops=Object.keys(S.pops).filter(popUp),NC=CITIES.length,NN=NETS.length,ev=S.ev,PC=polCompile();
  // The graph: parallel links between two cities are one edge (they balance); adj[i] lists [neighbour, edge].
  const remote=remoteCities(),adj=new Array(NC);pops.concat(remote).forEach(p=>adj[CIDX[p]]=[]);
  const edges={},EA=[],TRX=teRules(),live=[];let NE=0;
  for(const l of S.links){const ai=CIDX[l.a],bi=CIDX[l.b];if(linkDown(l)||!adj[ai]||!adj[bi])continue;live.push(l);const key=l.a<l.b?l.a+'|'+l.b:l.b+'|'+l.a;let e=edges[key];
    if(!e){const a=l.a<l.b?l.a:l.b,b=a===l.a?l.b:l.a;e=edges[key]={id:key,a,b,ai:CIDX[a],bi:CIDX[b],i:NE++,km:l.km,cap:0,scap:0,w:Infinity,lat:Infinity,slat:Infinity,links:[],f:TRX&&TRX.avoid.has(key)?60:1};EA.push(e);adj[e.ai].push([e.bi,e]);adj[e.bi].push([e.ai,e]);}
    const c=capOf(l),lt=linkLat(l);e.cap+=c;e.links.push(l);e.w=Math.min(e.w,pairW(key,l.km)*e.f);if(l.standby){e.scap+=c;e.slat=Math.min(e.slat,lt);}else e.lat=Math.min(e.lat,lt);}
  for(const e of EA)if(e.lat===Infinity)e.lat=e.slat;
  const wW=e=>e.w,GK=RC.on?rcGraphKey(pops,remote,EA):null,{SPD,SPP,SDi,SPi,COMP}=rcGraph(GK,pops,adj,EA,NC,wW);
  const depeer=ev.depeer>day||scnRule('spat'),leak=ev.leak&&ev.leak.until>day?ev.leak.net:null,snd=scnRule('sender');
  const E=engExits(R2,day,remote,depeer,leak,snd),NX=E.length;
  const rp=ev.rpki&&ev.rpki.until>day?new Set(ev.rpki.nets):null;if(rp)for(const e of E){if(e.k==='c')continue;const o=e.ok;e.ok=n=>!rp.has(n)&&o(n);}
  // okBy[net]: the exits that reach it, in E's order. Then what is reachable at all, and only through cones (#85).
  const okBy={};for(const id of NET_IDS)okBy[id]=[];
  for(let i=0;i<NX;i++){const e=E[i];e.xi=i;e.ci=CIDX[e.city];e.cn=cnCity(e.city);e.ek=e.k+':'+e.id;e.desc={lab:e.lab,city:e.city,k:e.k};R2.egDesc[e.ek]=e.desc;
    const ns=e.nets||NET_IDS;const f=n=>{const L=okBy[n];if(L&&L[L.length-1]!==e&&e.ok(n))L.push(e);};if(Array.isArray(ns))ns.forEach(f);else ns.forEach(f);}
  const coneOf=(e,n)=>e.k==='p'?e.net!==n:!!e.dir&&!e.dir.has(n);
  for(const n of NETS){let any=false,nt=false;for(const e of okBy[n.id])if(e.rank>0){any=true;if(e.k!=='t'){nt=true;break;}}R2.reachable[n.id]=any;if(any)R2.reach+=NSH[n.id];
    if(nt){R2.nt[n.id]=1;R2.reachNT+=NSH[n.id];if(!okBy[n.id].some(e=>(e.k==='p'||e.k==='ix')&&!coneOf(e,n.id)))R2.cone[n.id]=coneBy(okBy[n.id],n.id);}}
  return {R2,E,NX,okBy,edges,EA,NE,adj,SPD,SPP,SDi,SPi,COMP,PC,pops,NC,NN,day,wW,coneOf,TRX,GK};}
