/* ---------- supplier contract terms ----------
   What you lease month by month (waves, fabric circuits, transit ports, exchange ports) is bought on a term, as it is
   for real: a rolling month costs three times as much plus a bigger install, a year is the list price, three years a
   quarter off with the install waived. A term buys a discount on whatever the market charges that day (transit and
   exchange ports keep getting cheaper); leaving before its end pays out the months left. After the end it carries on
   month to month at the same price, free to leave, until you sign again.
   A purchase from before terms existed has none: its old price, free to leave. Dark fiber is an IRU, a long lease of
   its own (and your own glass is yours), so it has none either. */
const TERMS={m:{n:1,mul:3,nrc:3},y1:{n:12,mul:1,nrc:1},y3:{n:36,mul:0.75,nrc:0}},TERM_DAYS=30;
// Links you lease on a term, and what a term action names: a link, a transit port, an exchange port.
const leased=l=>!!l&&(l.kind==='wave'||l.kind==='vxc');
const supItem=(kind,id)=>kind==='link'?S.links.find(l=>l.id===id&&leased(l)):kind==='t'?S.transit.find(t=>t.id===id):kind==='ix'&&S.ixp[id]!==undefined&&!S.myIx[id]?((S.ixTerm||(S.ixTerm={}))[id]||(S.ixTerm[id]={})):null;
// The term a purchase is on (null: from before terms), and the one the buy screens use.
const supK=x=>x&&own(TERMS,x.term)?x.term:null;
const supPick=t=>own(TERMS,t)?t:own(TERMS,UI.term)?UI.term:'y1';
// Its price multiplier and install multiplier.
const supMul=x=>{const k=supK(x);return k?TERMS[k].mul:1;},supNrc=k=>TERMS[supPick(k)].nrc;
// A saved term checked: a known one and a whole end day, or none (an old purchase).
function supOk(x){if(x.term!==undefined||x.tEnd!==undefined){if(!own(TERMS,x.term)){delete x.term;delete x.tEnd;}else{const e=Math.floor(+x.tEnd);x.tEnd=Number.isFinite(e)?Math.max(0,e):0;}}return x;}
// Put a purchase on a term starting today.
function supSet(x,k){k=supPick(k);x.term=k;x.tEnd=S.day+TERMS[k].n*TERM_DAYS;return x;}
// Months left to pay if it is cancelled today (a rolling month and an ended term owe nothing).
const supLeft=x=>{const k=supK(x);return k&&k!=='m'&&x.tEnd>S.day?Math.ceil((x.tEnd-S.day)/TERM_DAYS):0;};
const supFee=(x,mo)=>Math.round(supLeft(x)*Math.max(0,mo||0));
// Charge the early-exit fee, with a word. True when there was nothing to pay or it was paid.
function supPay(x,mo){const f=supFee(x,mo);if(!f)return true;S.cash-=f;S.stats.exitFees=(S.stats.exitFees||0)+f;toast(tr('supplier_terms.early_exit_paid',{fee:fmt$(f),n:supLeft(x)}),'bad');return true;}
// One line for a product's panel: its term, its end, what leaving costs now.
function supLine(x,mo){const k=supK(x);if(!k)return tr('supplier_terms.line_old');
  if(k==='m')return tr('supplier_terms.line_rolling');
  if(!(x.tEnd>S.day))return tr('supplier_terms.line_ended');
  return tr('supplier_terms.line_term',{term:supName(k),date:dateStr(x.tEnd),fee:fmt$(supFee(x,mo))});}
const supName=k=>k==='m'?tr('supplier_terms.rolling'):k==='y1'?tr('supplier_terms.one_year'):tr('supplier_terms.three_years');
// Sign a longer term: buttons for every term that ends no sooner than the current one, priced from the base monthly.
function supRenewBtns(kind,id,x,base){const left=supLeft(x),cur=supK(x);
  return ['y1','y3'].filter(k=>TERMS[k].n>=left&&!(cur===k&&left>0)).map(k=>btn(tr('supplier_terms.sign_term_price',{term:supName(k),price:fmt$(Math.round(base*TERMS[k].mul))}),'supTerm',{kind,id,term:k},'ghost sm')).join('');}
// The confirm button's words: what leaving costs now, if anything.
const supConfirm=(x,mo)=>{const f=supFee(x,mo);return f?tr('supplier_terms.really_cancel_fee',{fee:fmt$(f)}):tr('common.really_cancel');};
// The term picker above the buy buttons.
function supPicker(re){const cur=supPick();return `<div class="seg term">${['m','y1','y3'].map(k=>btn(supName(k)+(k==='y1'?'':` <small>${k==='m'?'×3':'−25%'}</small>`),'supUse',{term:k,re},cur===k?'pink sm':'ghost sm')).join('')}</div><p class="meta" style="margin:2px 0 6px">${cur==='m'?tr('supplier_terms.picker_note_m'):cur==='y1'?tr('supplier_terms.picker_note_y1'):tr('supplier_terms.picker_note_y3')}</p>`;}
