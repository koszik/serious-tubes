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
function slaTick(d){const ids=linkIds(),down=new Set(S.links.filter(linkDown).map(l=>edgeKey(l))),path=new Map();
  for(const id in R.l2path||{})path.set(id,new Set(R.l2path[id]));
  const prev=SLA_PREV,fresh=prev?new Set([...down].filter(k=>!prev.down.has(k))):new Set();
  const mon=monthIdx(d),paid=[];
  for(const b of S.biz.slice()){const T=BIZ_T[b.type];if(!T||T.event||capPend(b)||inGrace(b))continue;const k=slaOf(b),L=SLA[k];
    if(b.dnM!==mon){b.dnM=mon;b.dn=0;b.cr=0;}
    const m=slaDown(b,ids,fresh,prev?prev.path:path);if(!m)continue;
    const before=b.dn>slaAllow(k,d);b.dn+=m;const over=b.dn-slaAllow(k,d);if(over<=0)continue;
    const mo=bizMo(b),owe=Math.round(Math.min(L.cap,Math.ceil(over/60)*L.cr)*mo),pay=owe-(b.cr||0);
    if(!before){b.brs=(b.brs||[]).filter(x=>x>mon-12).concat(mon);if(k==='strict')b.mood=Math.max(0,b.mood-10);}
    if(pay>0){S.cash-=pay;b.cr=(b.cr||0)+pay;slaBook(d,b,k,pay);paid.push([b,pay]);}
    if(L.quit&&b.brs.length>=L.quit){S.biz=S.biz.filter(x=>x!==b);toast(tr('sla.name_walked_away_n_broken',{name:esc(b.name),n:b.brs.length}),'bad');sfx('err');}}
  SLA_PREV={down,path};
  const H=S.hist&&S.hist[S.hist.length-1];if(H&&H.d===d&&paid.length)H.sla=Math.round(paid.reduce((a,x)=>a+x[1],0));
  if(paid.length===1){const [b,pay]=paid[0],k=slaOf(b);toast(tr('sla.rebate_pay_to_name',{pay:fmt$(pay),name:esc(b.name),dn:slaDur(b.dn),up:slaUp(k)}),'bad',[{l:tr('common.show_me'),act:'custGo',args:{id:b.id}}]);sfx('err');}
  else if(paid.length)toast(trn('sla.rebates_pay_to_n_customers',paid.length,{pay:fmt$(paid.reduce((a,x)=>a+x[1],0))}),'bad',[{l:tr('common.show_me'),act:'custOpen',args:{sad:0}}]);}
// Every rebate is kept: a running total, this month's, and the last SLA_LOG of them for the Customers tab.
const SLA_LOG=50;
function slaBook(d,b,k,pay){const st=S.stats,mon=monthIdx(d);st.slaCr=(st.slaCr||0)+pay;if(st.slaM!==mon){st.slaM=mon;st.slaMv=0;}st.slaMv+=pay;
  (S.slaLog||(S.slaLog=[])).push({d,id:b.id,name:b.name,sla:k,pay:Math.round(pay),dn:Math.round(b.dn)});if(S.slaLog.length>SLA_LOG)S.slaLog.splice(0,S.slaLog.length-SLA_LOG);}
const slaMonth=()=>S.stats.slaM===monthIdx(S.day)?S.stats.slaMv||0:0;
// The recent rebates, newest first.
function slaLogHtml(n){const L=(S.slaLog||[]).slice(-n).reverse();if(!L.length)return '';
  return `<div class="panel2" style="margin-top:12px"><h3>${tr('customers.recent_sla_rebates')}</h3><p class="note" style="margin-top:0">${tr('customers.sla_rebates_this_month_total',{m:fmt$(slaMonth()),t:fmt$(S.stats.slaCr||0)})}</p>${L.map(x=>`<div class="row"><div class="grow"><div class="nm">${esc(x.name)}</div><div class="meta">${dateStr(x.d)} · ${tr('customers.sla_rebate_row',{lvl:SLA[x.sla].l,dn:slaDur(x.dn)})}</div></div><b class="num" style="color:var(--bad)">−${fmt$(x.pay)}</b></div>`).join('')}</div>`;}
// The Accept buttons of an offer: one per level it signs, with its price.
function acceptBtns(o,cls){const ls=slasOf(o.type);if(!ls.length)return btn(tr('common.accept'),'accept',{id:o.id},cls);
  const mo=bizMo(o);return ls.map(k=>btn(tr('sla.accept_level',{lvl:SLA[k].l,price:fmt$(Math.round(mo*SLA[k].mul))}),'accept',{id:o.id,sla:k},cls)).join('');}
// What each level promises, one line.
function slaTerms(o){const ls=slasOf(o.type);if(!ls.length)return '';
  return `<div class="meta">${tr('sla.terms',{list:ls.map(k=>tr('sla.level_terms',{lvl:SLA[k].l,up:slaUp(k),cap:SLA[k].cap})).join(' · ')})}${ls.includes('strict')?' '+tr('sla.strict_walks_away'):''}</div>`;}
// A signed customer's month so far.
function slaLine(b){const T=BIZ_T[b.type];if(!T||T.event)return '';const k=slaOf(b),dn=b.dnM===monthIdx(S.day)?b.dn||0:0,cr=b.dnM===monthIdx(S.day)?b.cr||0:0;
  return tr('sla.line',{lvl:SLA[k].l,up:slaUp(k),dn:slaDur(dn),allow:slaDur(slaAllow(k,S.day))})+(cr?' · '+tr('sla.rebated_cr',{cr:fmt$(cr)}):'')+((b.brs||[]).length&&k==='strict'?' · '+trn('sla.n_broken_months',b.brs.length):'');}
