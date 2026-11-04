/* The looking glass (docs/specs/network-engine.md §6.5, §6.6): every route a POP has to a network, in the order BGP
   ranks them, with what decided each one, and the ways the far network can send traffic back. It asks the same
   questions routing does (engBase(), the same policy and the same keys), without touching R. */
const LG_WHY={best:N_('lg.why_best'),mp:N_('lg.why_multipath'),deny:N_('lg.why_denied'),popdeny:N_('lg.why_pop_denied'),island:N_('lg.why_other_island'),
  nocarry:N_('lg.why_nocarry'),lp:N_('lg.why_lower_lp'),as:N_('lg.why_longer_as'),ibgp:N_('lg.why_ibgp'),igp:N_('lg.why_farther'),old:N_('lg.why_older_wins'),
  inbest:N_('lg.in_best'),noexp:N_('lg.in_not_announced'),regonly:N_('lg.in_region_only'),rel:N_('lg.in_rel'),inas:N_('lg.in_longer_as'),far:N_('lg.in_farther'),tie:N_('lg.in_tie'),cache:N_('lg.in_cache')};
// A route's AS path as the far side sees it, from your AS to the network (… where the middle is unknown).
function lgPath(e,n){const me='AS'+S.asn,a=id=>'AS'+NET[id].asn;if(e.k==='c')return [me,a(n)];
  if(e.k==='p'||(e.k==='ix'&&e.id!=='~grace')){const via=e.k==='p'?e.net:null;if(via&&via!==n)return [me,...coneChain(via,n).map(a)];if(e.k==='ix'&&e.dir&&!e.dir.has(n)){const v=ANC[n].find(u=>e.dir.has(u));return v?[me,...coneChain(v,n).map(a)]:[me,'…',a(n)];}return [me,a(n)];}
  if(e.k==='t'){if(e.net===n)return [me,a(n)];if(CONE_S[e.net].has(n))return [me,...coneChain(e.net,n).map(a)];return [me,a(e.net),'…',a(n)];}return [me,'…',a(n)];}
// The communities a route carries, for the reader: automatic ones and your tags.
function lgComms(PC,e,O,cone){const tg=(polTags(PC,exRef(e))||[]).map(id=>{const t=(S.pol.tags||[]).find(x=>x.id===id);return t?t.name:id;});
  return [FROM_K[e.k],...(cone?['cone']:[]),'net:'+O.net,'region:'+O.reg,'at:'+e.city,...tg];}
function engLookingGlass(city,net){if(!S||!S.pops[city]||!NET[net])return null;
  const X=engBase(emptyR()),{E,okBy,PC,COMP,SDi,adj,wW}=X,pi=CIDX[city],j=NETS.findIndex(n=>n.id===net),O=ORIGINS[nearO(j,pi)],sv=scnRule('sender')&&CITY[city].kr?srvNoKr(O.i,pi):srvOf(O.i,pi),isl=COMP[pi],used=engOutOf(city,net);
  const VD=new Map(),dist=k=>{if(!k)return SDi[pi];let D=VD.get(k);if(!D){const rm=new Set(k.split(','));VD.set(k,D=dijkstra(adj,pi,wW,(u,e)=>rm.has(e.id)).D);}return D;};
  const rs=PC.popAny?polAt(PC.pop,city):null;
  // Out: every exit that reaches it, ranked as BGP does; those it cannot use say why.
  const out=okBy[net].map(e=>{const cone=X.coneOf(e,net),has=routeHas(PC,e,O,cone);let lp=polImport(PC,e,has),why=null;
    if(lp===null)why='deny';else if(rs)for(const r of rs)if(polHit(r,has)){if(r.act==='deny')why='popdeny';else lp=r.n;break;}
    const nc=PC.linkAny?polNoCarry(PC,has):'',D=COMP[e.ci]===isl?dist(nc)[e.ci]:Infinity;
    if(!why&&COMP[e.ci]!==isl)why='island';else if(!why&&!(D<Infinity))why='nocarry';
    return {e,lp:lp??0,as:asLen(e,net),ebgp:e.ci===pi,D,why,path:lgPath(e,net),comms:lgComms(PC,e,O,cone),nc};});
  const live=out.filter(r=>!r.why).sort((a,b)=>b.lp-a.lp||a.as-b.as||(a.ebgp?0:1)-(b.ebgp?0:1)||a.D-b.D||a.e.xi-b.e.xi),best=live[0],mp=!!PC.mp[city];
  for(const r of live){if(r===best){r.why='best';continue;}
    r.why=r.lp<best.lp?'lp':r.as>best.as?'as':r.ebgp!==best.ebgp?'ibgp':r.D>best.D+1e-6?'igp':mp?'mp':'old';}
  out.sort((a,b)=>(live.includes(b)?1:0)-(live.includes(a)?1:0)||live.indexOf(a)-live.indexOf(b));
  // In: how the network sends traffic for this POP, by its own preference (cache, peer, provider; AS path; nearest).
  const P={city,cls:'home',members:[]},has=prefixHas(PC,P),inb=okBy[net].filter(x=>COMP[x.ci]===isl).map(x=>{const a=PC.expAny?polExport(PC,x,has):{no:false,prep:x.pref==='low'?3:0,reg:false};
    const al=asLen(x,net),rel=x.k==='c'?0:(x.k==='p'&&x.net===net)||(x.k==='ix'&&al===1&&x.id!=='~grace')?1:2;
    return {e:x,rel,as:al+a.prep,prep:a.prep,km:x.k==='c'?SDi[pi][x.ci]:Math.round(kmI(sv,x.ci)),why:a.no?'noexp':a.reg&&CITY[x.city].rg!==O.reg?'regonly':null,t:hstr(O.net+'|'+O.reg+'|'+x.k+'|'+x.city+'|'+(x.net||'')+'|'+x.xi)};});
  const ok=inb.filter(r=>!r.why).sort((a,b)=>a.rel-b.rel||a.as-b.as||a.km-b.km||a.t-b.t||a.e.xi-b.e.xi),ib=ok.find(r=>r.e.k!=='c')||ok[0];
  for(const r of ok){r.why=r.e.k==='c'?'cache':r===ib?'inbest':r.rel>ib.rel?'rel':r.as>ib.as?'inas':r.km>ib.km?'far':'tie';}
  inb.sort((a,b)=>(ok.includes(b)?1:0)-(ok.includes(a)?1:0)||ok.indexOf(a)-ok.indexOf(b));
  return {city,net,origin:O,sv:CITIES[sv].id,out,inb,used};}
