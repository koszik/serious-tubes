/* ---------- routing quality ----------
   Every customer feels the round trip its traffic takes: in where the far network hands it over (hot potato, near
   itself), out where you send it. The routing pass works out how much longer that is than a handoff in the customer's
   own city (R.rq, R.rqC) and how much the exits you already have could save. A customer over its type's tolerance
   loses happiness; the NOC lists the worst, with what would fix them. */
// Extra round trip (ms) a type notices; types not listed (L2 circuits, fiber, events) are judged otherwise or not at all.
const LAT_TOL={cgame:10,game:10,metav:10,scrub:20,dia:30,edu:30,fabip:30,host:30,stream:40,gpu:50,isp:50,provedor:50};
const latTol=t=>LAT_TOL[t]||0;
const rtq=b=>(R&&R.rq&&R.rq[b.id])||null;
// What it costs in happiness once it minds: each slow network's ms over tolerance, weighted by its share of the traffic.
function rtqPain(b){const tol=latTol(b.type),q=tol&&rtq(b);if(!q)return 0;let p=0;for(const f of q.flows||[q])p+=(f.share||1)*Math.max(0,f.ms-tol);return p;}
// The share of its traffic over its tolerance, summed over its networks.
function rtqSlow(b){const tol=latTol(b.type),q=tol&&rtq(b);if(!q)return 0;let s=0;for(const f of q.flows||[q])if(f.ms>tol)s+=f.share||1;return s;}
/* Unhappy about latency once RQ_BAD of its traffic is slow: the same allowance as loss (it minds below 95% service), so a
   small far-off network alone does not stop it recovering. The test the daily mood uses, so the NOC, the customer's
   reasons and the mood all agree; how much it then costs is rtqPain. */
const RQ_BAD=0.05,rtqBad=b=>latTol(b.type)>0&&rtqSlow(b)>=RQ_BAD;
// The flow that costs it most (share × ms over tolerance), with the full list: what the NOC and the reasons name.
function rtqTop(b){const tol=latTol(b.type),q=rtq(b);if(!q)return null;let t=null,w=0;for(const f of q.flows||[q]){const x=(f.share||1)*(f.ms-tol);if(x>w){w=x;t=f;}}return t?{...t,flows:q.flows}:q;}
// A far network counts once it carries this share of a customer's traffic: one slow network is noticed on its own.
// Smaller ones (from RQ_SHOW) are listed and weigh in by their share, but do not decide on their own.
const RQ_SH=0.05,RQ_SHOW=0.01;
// One flow's numbers and way, for the NOC and the city's warning: where it comes in and leaves, with the network there.
function rtqVars(f){const at=(c,n)=>c&&CITY[c]?CITY[c].name+(n&&NET[n]?` (${NET[n].name})`:''):'';
  return {net:NET[f.net]?NET[f.net].name:f.net,p:pct(Math.min(1,f.share||1)),ms:Math.round(f.ms),rt:Math.round(f.rt||f.ms),city:at(f.inC,f.inN),out:at(f.outC||f.inC,f.outC?f.outN:f.inN)};}
const rtqCache=f=>f.inK==='c'&&!f.outC;
// The cause, in words: the network, its share, where it comes in (or which of your caches serves it), and the fix.
function rtqWhy(q,who){if(!q||!q.net||!NET[q.net])return '';const v={who,...rtqVars(q)};
  if(q.sc)return tr('routing_quality.who_net_p_rt_ms_scrub',{...v,city:CITY[q.scC]?CITY[q.scC].name:v.city});
  return (rtqCache(q)?tr('routing_quality.who_net_p_rt_ms_cache',v):tr('routing_quality.who_net_p_rt_ms_in_out',v))+' '+(q.fix>=Math.max(3,q.ms*0.3)?tr('routing_quality.fixable_with_routing_save_ms',{ms:Math.round(q.fix)}):tr('routing_quality.needs_a_connection_nearer'));}
// A broadband city's slow flows (over LAT_BB), slowest first.
const rtqSlowC=c=>((R&&R.rqC&&R.rqC[c]&&R.rqC[c].flows)||[]).filter(f=>f.ms>LAT_BB);
// The NOC's list: customers and broadband cities over their tolerance, worst first.
function rtqRows(){const out=[];if(!R||!R.rq)return out;
  for(const b of S.biz){if(!rtqBad(b)||inGrace(b))continue;const q=rtqTop(b),tol=latTol(b.type);out.push({k:'b',id:b.id,name:b.name,city:b.city,over:q.ms-tol,q,tol});}
  // A broadband city shows every slow network it lists, the same ones its 🐢 warning names.
  for(const c in R.rqC||{}){const fl=rtqSlowC(c);if(fl.length)out.push({k:'c',id:c,name:CITY[c].name,city:c,over:fl[0].ms-LAT_BB,q:{...fl[0],flows:fl},tol:LAT_BB});}
  return out.sort((a,b)=>b.over-a.over);}
const LAT_BB=20;
function rtqSection(){const rows=rtqRows();if(!rows.length)return '';
  return `<h3 style="font-size:15px;margin:4px 0">🐢 ${tr('routing_quality.routing_quality')}</h3><p class="meta" style="margin:0 0 4px">${tr('routing_quality.customers_whose_traffic_takes_longer')}</p>`+rows.slice(0,10).map(r=>`<div class="row"><div class="grow"><div class="nm">${esc(r.name)} <span class="meta">+${Math.round(r.q.ms)} ms · ${tr('routing_quality.notices_from_n_ms',{n:r.tol})}</span></div>${(r.q.flows||[r.q]).filter(f=>f.ms>r.tol).slice(0,3).map(f=>`<div class="meta">${rtqWhy(f,esc(r.name))}</div>`).join('')}</div>${btn(tr('common.show_me'),r.k==='b'?'custGo':'focusCity',r.k==='b'?{id:r.id}:{city:r.id},'ghost sm')}</div>`).join('');}
// Once a month at most, a word when a customer first goes over its tolerance.
function rtqNotice(d){if(!pref('warnUnhappy'))return;for(const b of S.biz){if(!rtqBad(b)||inGrace(b)||(b.latW&&b.latW>d-30))continue;b.latW=d;
  toast(rtqWhy(rtqTop(b),esc(b.name)),'',[{l:tr('common.show_me'),act:'custGo',args:{id:b.id}}]);break;}}
