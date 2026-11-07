/* ---------- customers who keep asking ----------
   Offers come every few days, and signed customers come back: a bigger circuit, a new requirement, a stricter SLA,
   a new site. Every contract has a term; near its end a happy customer renews at today's price (by itself, like an
   evergreen clause), a lukewarm one wants a discount and an unhappy one leaves unless you keep it cheaper. Requests
   live in S.offers with rq:{k,id}, so the Deals list, Accept, Decline and saves treat them like any offer. */
const OFFER_CALM=30,offerMax=()=>Math.min(12,4+Math.floor(Object.keys(S.pops).length/2)),offerExp=()=>15+Math.floor(Math.random()*11);
const RQ_P=1/600,RQ_MAX=6,RQ_EXP=14,RQ_NO=5,RQ_MISS=8,RENEW_D=30;
const RQ_K=['up','req','sla','site','renew'];
// The big buyers sign for three years; circuits for one or two; the rest for one. Fiber leases, capacity deals and events have no term.
const TERM_BIG=new Set(['hyper','ai','aiwan','agi','sov','mtrain']);
function termOf(t,id){const T=BIZ_T[t];if(!T||T.event||T.cap||T.fiber)return 0;if(TERM_BIG.has(t))return 36;return T.l2?(hstr(String(id)+'|term')%2?24:12):12;}
// New offers: a few a week, more at higher levels, up to a cap that grows with the network; a new network gets them slowly.
function offerTick(d){if(S.offers.filter(o=>!o.rq).length>=offerMax())return;if(d<OFFER_CALM&&d-(S.offD??-99)<5)return;
  if(Math.random()<(0.25+0.02*(S.lvl||1))*(ppol()==='closed'?0.6:1)*(confSpOn()?SP_OFFERS:1)){const n=S.offers.length;spawnOffer();if(S.offers.length>n)S.offD=d;}}
// What a customer's circuit lists for today at size bw, before requirements and SLA (the same formulas as a new offer).
function baseRate(b,bw){const T=BIZ_T[b.type];
  if(T.sdwan&&T.mega)return perG((b.sites||[]).filter(c=>c!==b.city).reduce((a,c)=>a+capMo(b.city,c,bw)*T.mk,0),bw);
  if(T.sdwan)return perG(siteMo(T,bw)*(b.sites||[]).length,bw);
  if(T.l2)return cents(l2Rate(T,b.city,b.city2,bw)*(T.lat?latPay():1));
  return ipPrice(T,bw,b.city,b.hg);}
const slaMulOf=b=>slasOf(b.type).length?SLA[slaOf(b)].mul:1;
// Today's price for this customer at size bw: what a new offer like it would get.
function listRate(b,bw=b.bw){const T=BIZ_T[b.type];if(T.fiber)return b.rate;return cents(baseRate(b,bw)*reqMul(T,bw,b.reqs)*slaMulOf(b));}
const rqRecent=b=>(b.rqx||[]).filter(x=>x>S.day-365).length;
const rqOf=b=>S.offers.find(o=>o.rq&&o.rq.id===b.id);
const upBw=b=>{const T=BIZ_T[b.type];return T.opts.find(x=>x>b.bw)||b.bw*2;};
const rqBase=(b,k,o)=>({id:uid(),rq:{k,id:b.id},city:b.city,city2:b.city2||null,sites:b.sites||null,name:b.name,type:b.type,bw:b.bw,rate:b.rate,reqs:(b.reqs||[]).slice(),sla:b.sla,latMax:b.latMax||null,link:b.link,what:b.what,exp:S.day+RQ_EXP,...o});
// A request from a signed customer: an upgrade (half of them), a new requirement, a stricter SLA, or a new site.
function rqMake(b){const T=BIZ_T[b.type];if(T.fiber||T.event||T.cap)return null;const ks=[['up',50]];
  const pool=Object.keys(REQS).filter(k=>!(b.reqs||[]).includes(k)&&!REQS[k].only&&(!REQS[k].l2||T.l2)&&(!REQS[k].ip||!T.l2)&&reqCan(k,b));if(pool.length)ks.push(['req',25]);
  const ls=slasOf(b.type),i=ls.indexOf(slaOf(b)),nx=i<0?ls[0]:ls[i+1];if(nx)ks.push(['sla',15]);
  const mine=Object.keys(S.pops).filter(c=>!(b.sites||[]).includes(c));if(T.sdwan&&!T.mega&&(mine.length||OFFC.length))ks.push(['site',10]);
  let r=Math.random()*ks.reduce((a,x)=>a+x[1],0),k=ks[0][0];for(const [x,w] of ks){if(r<w){k=x;break;}r-=w;}
  if(k==='up'){const T=BIZ_T[b.type],bw=upBw(b),a=baseRate(b,b.bw)*reqMul(T,b.bw,b.reqs);return a>0?rqBase(b,k,{bw,rate:cents(b.rate*baseRate(b,bw)*reqMul(T,bw,b.reqs)/a)}):null;}
  if(k==='req'){const q=pick(pool);return rqBase(b,k,{reqs:(b.reqs||[]).concat(q),rate:cents(b.rate*reqMul(BIZ_T[b.type],b.bw,(b.reqs||[]).concat(q))/reqMul(BIZ_T[b.type],b.bw,b.reqs)),add:q});}
  if(k==='sla')return rqBase(b,k,{sla:nx,rate:cents(b.rate*SLA[nx].mul/SLA[slaOf(b)].mul)});
  const c=Math.random()<0.85&&mine.length?pick(mine):pick(OFFC.filter(x=>!(b.sites||[]).includes(x))),n=(b.sites||[]).length;
  return c&&n?rqBase(b,'site',{sites:b.sites.concat(c),rate:cents(b.rate*(n+1)/n),add:c}):null;}
// A month before the end: renew at today's price, ask for a discount, or announce leaving. Ignored requests count against you.
function renewOffer(b){const eff=b.mood-10*rqRecent(b),term=termOf(b.type,b.id),T=BIZ_T[b.type];
  const up=eff>=70&&!T.fiber&&Math.random()<0.5,bw=up?upBw(b):b.bw,disc=eff>=70?0:eff>=40?0.15:0.3;
  b.rnw={a:disc?0:1,p:disc};if(disc===0.3)toast(tr('requests.name_will_leave_on_date',{name:esc(b.name),date:dateStr(b.end)}),'bad',[{l:tr('common.show_me'),act:'leftTab',args:{t:'deals'}}]);
  return rqBase(b,'renew',{bw,rate:cents(listRate(b,bw)*(1-disc)),term,exp:b.end+1});}
// The contract's last day: an accepted renewal already moved it on; an evergreen one rolls over; otherwise they leave.
function renewEnd(b){if(!b.rnw){b.end=S.day+RENEW_D;return;}const o=S.offers.find(x=>x.rq&&x.rq.k==='renew'&&x.rq.id===b.id);if(o)S.offers=S.offers.filter(x=>x!==o);
  if(b.rnw.a){const fit=o&&o.bw!==b.bw&&bCities(b).every(c=>portsUsed(c)+bizPorts({...b,bw:o.bw},c)-bizPorts(b,c)<=portsMax(c)+1e-9);
    b.rate=o?(fit||o.bw===b.bw?o.rate:listRate(b)):listRate(b);if(fit)b.bw=o.bw;b.end+=termOf(b.type,b.id)*30;delete b.rnw;return;}
  S.biz=S.biz.filter(x=>x!==b);toast(tr('requests.name_let_its_contract_run_out',{name:esc(b.name)}),'bad');sfx('err');}
function rqTick(d){if(pzOn())return;const fresh=[];
  for(const b of S.biz.slice()){const T=BIZ_T[b.type];if(!T||b.scripted)continue;
    if(b.end>0){if(d>=b.end){renewEnd(b);continue;}if(!b.rnw&&d>=b.end-RENEW_D){S.offers=S.offers.filter(o=>!(o.rq&&o.rq.id===b.id));const o=renewOffer(b);S.offers.push(o);fresh.push(o);continue;}}
    if(T.event||inGrace(b)||rqOf(b)||Math.random()>=RQ_P||S.offers.filter(o=>o.rq).length>=RQ_MAX)continue;
    const o=rqMake(b);if(o){S.offers.push(o);fresh.push(o);}}
  if(fresh.length===1){const o=fresh[0];toast(tr('requests.name_asks_what',{name:esc(o.name),what:rqWhat(o)}),'',[{l:tr('common.show_me'),act:'leftTab',args:{t:'deals'}}]);}
  else if(fresh.length)toast(trn('requests.n_new_requests_from_your_customers',fresh.length),'',[{l:tr('common.show_me'),act:'leftTab',args:{t:'deals'}}]);}
// Requests nobody answered cost happiness and are remembered; a request whose customer is gone is dropped.
function rqExpire(d){S.offers=S.offers.filter(o=>{if(!o.rq)return true;const b=S.biz.find(x=>x.id===o.rq.id);if(!b)return false;
  if(o.exp<=d&&o.rq.k!=='renew'){rqNo(b,RQ_MISS);return false;}return true;});}
function rqNo(b,n){b.mood=Math.max(0,b.mood-n);(b.rqx||(b.rqx=[])).push(S.day);b.rqx=b.rqx.filter(x=>x>S.day-365);}
// The customer as it would be with the request signed.
const rqPatch=o=>({up:{bw:o.bw,rate:o.rate},req:{reqs:o.reqs,rate:o.rate},sla:{sla:o.sla,rate:o.rate},site:{sites:o.sites,rate:o.rate},renew:{bw:o.bw,rate:o.rate}})[o.rq.k];
// Would the network carry it? A trial routing pass on a copy, like the intern's trial of a new offer.
function rqTrial(b,patch){const state=S,result=R,hot=UI.hotMap;try{const healthy=S.biz.filter(x=>x!==b&&!bizWhy(x).length),nb={...b,...patch};S={...S,biz:S.biz.map(x=>x===b?nb:x)};compute();
  return !bizWhy(nb).length&&healthy.every(x=>!bizWhy(S.biz.find(y=>y.id===x.id)).length);}finally{S=state;R=result;UI.hotMap=hot;}}
function applyRq(o,auto){const b=S.biz.find(x=>x.id===o.rq.id),k=o.rq.k;if(!b){S.offers=S.offers.filter(x=>x!==o);after();return;}
  if(auto&&k==='site')return;const patch=rqPatch(o),nb={...b,...patch};if(auto&&k==='req'&&!reqOk(nb))return;
  if(!bCities(nb).every(c=>S.pops[c])){if(!auto)toast(tr('customers.you_need_a_pop_in_every'),'bad');return;}
  for(const c of bCities(nb)){const n=bizPorts(nb,c)-bizPorts(b,c);if(n>0&&(auto?portsUsed(c)+n>portsMax(c)+1e-9:!portGate(c,n)))return;}
  if(auto&&nb.bw!==b.bw&&!rqTrial(b,patch))return;
  Object.assign(b,patch);if(k==='req')b.rqG=S.day+PROV_D;if(k==='renew'){b.end+=(o.term||termOf(b.type,b.id))*30;delete b.rnw;}
  S.offers=S.offers.filter(x=>x!==o);floater(CITY[b.city].x,CITY[b.city].y-30,tr('common.signed'),'#16A866');sfx('coin');after();}
// Saying no: a request costs happiness; a renewal you turn down means they leave at the end.
function declineRq(o){const b=S.biz.find(x=>x.id===o.rq.id);if(b){if(o.rq.k==='renew')b.rnw={a:0,p:(b.rnw&&b.rnw.p)||0};else rqNo(b,RQ_NO);}}
// What the request asks for, one line.
function rqWhat(o){const b=S.biz.find(x=>x.id===o.rq.id);if(!b)return '';const k=o.rq.k;
  if(k==='up')return tr('requests.upgrade_a_to_b',{a:fmtG(b.bw),b:fmtG(o.bw)});
  if(k==='req'){const R0=REQS[o.add];return tr('requests.wants_more_req',{req:R0?(typeof R0.l==='function'?R0.l(o):R0.l):''});}
  if(k==='sla')return tr('requests.stricter_sla_a_to_b',{a:SLA[slaOf(b)].l,b:SLA[o.sla].l});
  if(k==='site')return tr('requests.a_new_site_in_city',{city:CITY[o.add]?CITY[o.add].name:''});
  const n=o.term||termOf(b.type,b.id),date=dateStr(b.end),p=Math.round(((b.rnw&&b.rnw.p)||0)*100);
  return p>=30?tr('requests.leaving_on_date_unless_kept',{date,p,n}):p?tr('requests.contract_ends_date_stays_for_p_off',{date,p,n}):tr('requests.contract_ends_date_renew_for_n',{date,n})+(o.bw!==b.bw?' · '+tr('requests.upgrade_a_to_b',{a:fmtG(b.bw),b:fmtG(o.bw)}):'');}
// The card's lines for a request: what changes, the price before and after, and what saying no costs.
function rqLine(o){const b=S.biz.find(x=>x.id===o.rq.id);if(!b)return '';const no=o.rq.k==='renew'?(b.rnw&&b.rnw.a?tr('requests.renews_by_itself_if_you_do'):tr('requests.leaves_if_you_do_nothing')):tr('requests.saying_no_costs_n_happiness',{n:RQ_NO});
  return `<div class="meta"><b>${rqWhat(o)}</b> · ${tr('requests.price_a_to_b',{a:fmt$(bizMo(b)),b:fmt$(bizMo(o))})}</div><div class="meta">${no}</div>`;}
// A new offer's contract length, for its card.
const termLine=o=>{const n=o.rq?0:termOf(o.type,o.id);return n?' · '+tr('requests.n_month_contract',{n}):'';};
// The Customers tab: when the contract ends, and requests ignored this year.
function contractLine(b){if(!(b.end>0))return '';const n=rqRecent(b);return tr('requests.contract_until_date',{date:dateStr(b.end)})+(n?' · '+trn('requests.n_requests_ignored_this_year',n):'');}
// The Deals tab's count: your customers' requests in red, then new offers.
const dealsCnt=()=>{const r=S.offers.filter(o=>o.rq).length,n=S.offers.length-r;return (r?`<span class="cnt red">${r}</span>`:'')+(n?`<span class="cnt">${n}</span>`:'');};
