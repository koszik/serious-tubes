/* ---------- SLAs ----------
   Every contract is signed at a service level: a promised availability a month, and what an outage beyond it costs.
   A stricter promise pays more, and each started hour past the allowance is rebated as a share of the monthly fee,
   up to a cap (Strict: a year's fees, the liquidated damages trading firms and hyperscalers write into contracts).
   Strict customers also walk away after three broken months in a year. Events pay on completion instead. */
const SLA={
 std:{l:tr('sla.standard'),up:0.999,mul:1,cr:0.1,cap:1},
 prem:{l:tr('sla.premium'),up:0.9999,mul:1.3,cr:0.5,cap:3},
 strict:{l:tr('sla.strict'),up:0.99999,mul:2,cr:1,cap:12,quit:3},
};
// High-markup customers only sign tight SLAs; trading links only the tightest.
const SLA_TOP=new Set(['hft','flex','mars','hyper','aiwan','agi','sov']);
function slasOf(t){const T=BIZ_T[t];if(!T||T.event)return [];if(t==='hft')return ['strict'];if(SLA_TOP.has(t))return ['prem','strict'];return T.l2?['std','prem','strict']:['std','prem'];}
const slaOf=b=>own(SLA,b.sla)?b.sla:'std';
// Minutes of downtime a month the promise allows (99.9% of a 30-day month is 43 minutes).
const slaAllow=(k,d)=>(1-SLA[k].up)*monLen(d)*1440;
const slaUp=k=>(SLA[k].up*100).toFixed(k==='strict'?3:k==='prem'?2:1)+'%';
const slaDur=m=>m<60?tr('sla.n_min',{n:Math.round(m)}):tr('sla.n_h',{n:+(m/60).toFixed(1)});
const SLA_BLIP=3,SLA_BAD=0.95;
// A new customer's first days are provisioning: no mood lost and no SLA counted while it is turned up.
const PROV_D=15,provLeft=b=>PROV_D-(S.day-(b.since||0)),inGrace=b=>provLeft(b)>0;
/* A cut that reroutes still drops packets while the network converges: a few minutes, unless fast reroute has the
   backup ready. Yesterday's down links and each circuit's path are kept between days (a reload forgets one blip). */
let SLA_PREV=null;
// Minutes a customer was down today: hours it got under 95% of its traffic, a whole day off its latency, a blip.
function slaDown(b,ids,fresh,path){const T=BIZ_T[b.type];if(T.fiber)return fiberOk(b,ids)?0:1440;
  const sf=bizSf(b,ids);let h=sf<SLA_BAD?Math.ceil(24*(1-sf)-1e-9):0;const D=custDay(b);if(D&&D.bad>h)h=D.bad;
  if(T.lat&&b.latMax&&R.l2lat&&R.l2lat[b.id]>b.latMax)h=24;
  if(h)return h*60;
  if(T.l2&&fresh.size&&!coreFrr()){const p=path.get(b.id);if(p)for(const k of p)if(fresh.has(k))return SLA_BLIP;}
  return 0;}
// Like real carrier SLAs, an attack aimed at the customer is not downtime you owe for, unless it bought protection
// (DDoS-protected internet, or a contract that asks for scrubbing). It still makes the customer unhappy.
const ddosExcused=b=>b.type!=='scrub'&&!(b.reqs||[]).some(k=>k==='scrubbed'||k==='scrubnear')&&ddosAll().some(a=>a.tgt===b.id);
function slaTick(d){const ids=linkIds(),down=new Set(S.links.filter(linkDown).map(l=>edgeKey(l))),path=new Map();
  for(const id in R.l2path||{})path.set(id,new Set(R.l2path[id]));
  const prev=SLA_PREV,fresh=prev?new Set([...down].filter(k=>!prev.down.has(k))):new Set();
  const mon=monthIdx(d),paid=[];
  for(const b of S.biz.slice()){const T=BIZ_T[b.type];if(!T||T.event||capPend(b)||inGrace(b))continue;const k=slaOf(b),L=SLA[k];
    if(b.dnM!==mon){b.dnM=mon;b.dn=0;b.cr=0;}
    if(ddosExcused(b))continue;
    const m=slaDown(b,ids,fresh,prev?prev.path:path);if(!m)continue;
    const before=b.dn>slaAllow(k,d);b.dn+=m;const over=b.dn-slaAllow(k,d);if(over<=0)continue;
    const mo=bizMo(b),owe=Math.round(Math.min(L.cap,Math.ceil(over/60)*L.cr)*mo),pay=owe-(b.cr||0);
    if(!before){b.brs=(b.brs||[]).filter(x=>x>mon-12).concat(mon);if(k==='strict')b.mood=Math.max(0,b.mood-10);}
    if(pay>0){S.cash-=pay;b.cr=(b.cr||0)+pay;slaBook(d,b,k,pay);paid.push([b,pay]);}
    if(L.quit&&b.brs.length>=L.quit){S.biz=S.biz.filter(x=>x!==b);toast(tr('sla.name_walked_away_n_broken',{name:esc(b.name),n:b.brs.length}),'bad');sfx('err');}}
  SLA_PREV={down,path};const bbp=bbSlaTick(d);
  const H=S.hist&&S.hist[S.hist.length-1],tot=paid.reduce((a,x)=>a+x[1],0)+bbp;if(H&&H.d===d&&tot>0)H.sla=Math.round(tot);
  if(paid.length===1){const [b,pay]=paid[0],k=slaOf(b);toast(tr('sla.rebate_pay_to_name',{pay:fmt$(pay),name:esc(b.name),dn:slaDur(b.dn),up:slaUp(k)}),'bad',[{l:tr('common.show_me'),act:'custGo',args:{id:b.id}}]);sfx('err');}
  else if(paid.length)toast(trn('sla.rebates_pay_to_n_customers',paid.length,{pay:fmt$(paid.reduce((a,x)=>a+x[1],0))}),'bad',[{l:tr('common.show_me'),act:'custOpen',args:{sad:0}}]);}
// Every rebate is kept: a running total, this month's, and the last SLA_LOG of them for the Customers tab.
const SLA_LOG=50;
function slaPaid(d,pay){const st=S.stats,mon=monthIdx(d);st.slaCr=(st.slaCr||0)+pay;if(st.slaM!==mon){st.slaM=mon;st.slaMv=0;}st.slaMv+=pay;}
function slaLogAdd(x){(S.slaLog||(S.slaLog=[])).push(x);if(S.slaLog.length>SLA_LOG)S.slaLog.splice(0,S.slaLog.length-SLA_LOG);}
function slaBook(d,b,k,pay){slaPaid(d,pay);slaLogAdd({d,id:b.id,name:b.name,sla:k,pay:Math.round(pay),dn:Math.round(b.dn)});}
/* Broadband: 99% a month, a month's fee back, but only for the subscribers who ask. An hour counts as out when the city
   gets under half its traffic (a real outage, not a busy evening: congestion costs subscribers instead). For each
   hour over the allowance 1% of subscribers claim, up to a quarter of them, and their claims come in over two weeks. */
const BB_UP=0.99,BB_OUT=0.5,BB_CL=0.01,BB_CAP=0.25,BB_DAYS=14;
const bbAllow=d=>(1-BB_UP)*monLen(d)*24;
// Hours city c's broadband was out today: from the engine's hours, or from the day's served share.
function bbOut(c){const dp=R.dp,sf=sfOf(R,c)*((R.bbF&&R.bbF[c])??1);let h=sf<BB_OUT?Math.ceil(24*(1-sf)-1e-9):0;
  if(dp&&dp.EPO)for(let i=0;i<dp.epK.length;i++)if(dp.epK[i]==='pop'&&dp.epCity[i]===c){const o=epDay(dp,i).out;if(o>h)h=o;}return h;}
function bbSlaTick(d){if(d<45)return 0;const mon=monthIdx(d);let paid=0;
  for(const c in S.pops){const p=S.pops[c];
    if(p.bbOwe>0){const pay=p.bbOwe/Math.max(1,p.bbOweD||1);S.cash-=pay;p.bbOwe-=pay;p.bbOweD=Math.max(0,(p.bbOweD||1)-1);if(!p.bbOweD)p.bbOwe=0;slaPaid(d,pay);paid+=pay;}
    if(!p.bb)continue;if(p.bbDnM!==mon){p.bbDnM=mon;p.bbDn=0;p.bbCl=0;}
    const h=bbOut(c);if(!h)continue;p.bbDn+=h;const over=p.bbDn-bbAllow(d);if(over<=0)continue;
    const share=Math.min(BB_CAP,Math.ceil(over-1e-9)*BB_CL),add=share-(p.bbCl||0);if(add<=0)continue;
    const amt=Math.round(add*(R.cityEye[c]||0)*eyeRate(c));const first=!p.bbCl;p.bbCl=share;if(amt<=0)continue;
    p.bbOwe=(p.bbOwe||0)+amt;p.bbOweD=BB_DAYS;slaLogAdd({d,id:'bb:'+c,name:'',sla:'bb',pay:amt,dn:Math.round(p.bbDn*60)});
    if(first)toast(tr('sla.broadband_outage_in_city_claims',{city:CITY[c].name,p:pct(share),pay:fmt$(amt)}),'bad',[{l:tr('common.show_me'),act:'focusCity',args:{city:c}}]);}
  return paid;}
// The city panel's line: this month's outage hours against the allowance, and claims still coming in.
function bbSlaLine(c){const p=S.pops[c];if(!p||!p.bb)return '';const dn=p.bbDnM===monthIdx(S.day)?p.bbDn||0:0;
  return tr('sla.broadband_line',{dn:slaDur(dn*60),allow:slaDur(bbAllow(S.day)*60)})+(p.bbOwe>0?' · '+tr('sla.claims_still_coming_owe',{owe:fmt$(p.bbOwe)}):'');}
const slaMonth=()=>S.stats.slaM===monthIdx(S.day)?S.stats.slaMv||0:0;
// The recent rebates, newest first.
function slaLogHtml(n){const L=(S.slaLog||[]).slice(-n).reverse();if(!L.length)return '';
  return `<div class="panel2" style="margin-top:12px"><h3>${tr('customers.recent_sla_rebates')}</h3><p class="note" style="margin-top:0">${tr('customers.sla_rebates_this_month_total',{m:fmt$(slaMonth()),t:fmt$(S.stats.slaCr||0)})}</p>${L.map(x=>`<div class="row"><div class="grow"><div class="nm">${x.sla==='bb'?tr('sla.broadband_in_city',{city:CITY[x.id.slice(3)]?CITY[x.id.slice(3)].name:''}):esc(x.name)}</div><div class="meta">${dateStr(x.d)} · ${tr('customers.sla_rebate_row',{lvl:x.sla==='bb'?tr('sla.broadband_99'):SLA[x.sla].l,dn:slaDur(x.dn)})}</div></div><b class="num" style="color:var(--bad)">−${fmt$(x.pay)}</b></div>`).join('')}</div>`;}
// The Accept buttons of an offer: one per level it signs, with its price.
function acceptBtns(o,cls){const ls=slasOf(o.type);if(!ls.length||o.rq)return btn(tr('common.accept'),'accept',{id:o.id},cls);
  const mo=bizMo(o);return ls.map(k=>btn(tr('sla.accept_level',{lvl:SLA[k].l,price:fmt$(Math.round(mo*SLA[k].mul))}),'accept',{id:o.id,sla:k},cls)).join('');}
// What each level promises, one line.
function slaTerms(o){const ls=slasOf(o.type);if(!ls.length||o.rq)return '';
  return `<div class="meta">${tr('sla.terms',{list:ls.map(k=>tr('sla.level_terms',{lvl:SLA[k].l,up:slaUp(k),cap:SLA[k].cap})).join(' · ')})}${ls.includes('strict')?' '+tr('sla.strict_walks_away'):''}</div>`;}
// A signed customer's month so far.
function slaLine(b){const T=BIZ_T[b.type];if(!T||T.event)return '';const k=slaOf(b),dn=b.dnM===monthIdx(S.day)?b.dn||0:0,cr=b.dnM===monthIdx(S.day)?b.cr||0:0;
  return tr('sla.line',{lvl:SLA[k].l,up:slaUp(k),dn:slaDur(dn),allow:slaDur(slaAllow(k,S.day))})+(cr?' · '+tr('sla.rebated_cr',{cr:fmt$(cr)}):'')+((b.brs||[]).length&&k==='strict'?' · '+trn('sla.n_broken_months',b.brs.length):'');}
