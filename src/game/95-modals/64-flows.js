/* ---------- every flow on a link or a port (engFlowRows(), 35-engine-results.js) ----------
   One screen for links, transit, PNIs, exchanges, caches and customers' ports: each flow with where it comes from, the port it enters or
   leaves by, the endpoint it serves and which way it goes, at the pipes' busiest hour or the hour shown. */
const FLOWS_N=50;
// What a flows screen shows: its two directions' names, a title and its rows at an hour, for a link or a port.
function flowsWhat(k,id){
  if(k==='link'){const l=S.links.find(x=>x.id===id);if(!l)return null;const p=pipeOfLink(l);if(!p)return null;const A=CITY[l.a].name,B=CITY[l.b].name;
    return {names:[`${A} → ${B}`,`${B} → ${A}`],title:`${A} ⇄ ${B}`,rows:h=>engFlowRows(R.dp,p,h)};}
  if(k==='cg'){const [c,n]=String(id).split('|'),ps=S.caches.filter(x=>x.city===c&&x.net===n).map(x=>pipeOfExit('c',x.id)).filter(Boolean);if(!ps.length||!NET[n])return null;
    return {names:[tr('pipes.in_rx'),tr('pipes.out_tx')],title:`${NET[n].cache.name} · ${CITY[c].name}`,rows:h=>{const r=engFlowRows(R.dp,ps.flat(),h);for(const x of r.rows)x.p%=2;return r;}};}
  if(k==='b'){const b=S.biz.find(x=>x.id===id);if(!b)return null;return {names:[tr('pipes.in_rx'),tr('pipes.out_tx')],title:`${b.name} · ${CITY[b.city].name}`,rows:h=>custFlowRows(b,h)};}
  const p=pipeOfExit(k,id);if(!p)return null;const x=R.dp.ex.find(e=>e.k===k&&String(e.id)===String(id));
  return {names:[tr('pipes.in_rx'),tr('pipes.out_tx')],title:x?`${(R.egDesc[x.ek]||{}).lab||x.ek} · ${CITY[x.city].name}`:id,rows:h=>engFlowRows(R.dp,p,h)};}
// A far end, an exit and an endpoint in words.
function flowFar(o,sv){if(o===null||o===undefined)return tr('flows.other_site');if(o<0)return tr('flows.your_pop',{city:CITIES[-1-o].name});const O=ORIGINS[o];
  return `${NET[O.net].name} · ${O.reg} (${CITIES[sv>=0?sv:O.ci].name})`;}
function flowExit(x){if(x<0)return tr('flows.on_net');const e=R.dp.ex[x];return `${(R.egDesc[e.ek]||{}).lab||e.ek} · ${CITY[e.city].name}`;}
function flowEnd(ep){const dp=R.dp;if(ep<0)return tr('flows.flood');const c=CITY[dp.epCity[ep]].name,k=dp.epK[ep];
  if(k==='l2'){const b=S.biz.find(x=>x.id===dp.epB[ep]);return b?b.name:c;}return `${c} · ${polClsName(dp.epCls[ep])}`;}
function flowsModal(k,id){if(!S||!R.dp)return;const w=flowsWhat(k,id);if(!w)return;
  const F=UI.flowsF&&UI.flowsF.k===k&&UI.flowsF.id===id?UI.flowsF:(UI.flowsF={k,id,p:-1,now:false,n:FLOWS_N});
  const {h,rows}=w.rows(F.now?UI.hour:null),sel=rows.filter(r=>F.p<0||r.p===F.p),tot=[0,0];for(const r of rows)tot[r.p]+=r.g;
  let o=`<div style="display:flex;align-items:center"><div><div class="eyebrow">${tr('flows.every_flow')}</div><h2 style="font-size:22px">${esc(w.title)}</h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>
  <p class="meta">${tr('flows.at_hour',{h:String(h).padStart(2,'0')})} · ${w.names.map((n,i)=>`${esc(n)}: ${fmtG(tot[i])}`).join(' · ')}</p>
  <div class="btns">${btn(tr('flows.both_ways'),'flowsSet',{p:-1},F.p<0?'pink sm':'ghost sm')}${w.names.map((n,i)=>btn(esc(n),'flowsSet',{p:i},F.p===i?'pink sm':'ghost sm')).join('')}
  ${btn(F.now?tr('flows.busiest_hour'):tr('flows.hour_shown'),'flowsSet',{now:F.now?0:1},'ghost sm')}</div>`;
  if(!sel.length)o+=`<p class="empty">${tr('flows.nothing_crosses')}</p>`;
  for(const r of sel.slice(0,F.n)){const far=r.junk?tr('flows.flood'):flowFar(r.o,r.sv),via=flowExit(r.x),end=r.junk?esc((R.egDesc[r.junk]||{}).lab||''):flowEnd(r.ep),t=tot[r.p]||1;
    const path=r.dir==='in'?`${esc(far)} → ${esc(via)} → ${esc(end)}`:`${esc(end)} → ${esc(via)} → ${esc(far)}`;
    o+=`<div class="row"><div class="grow"><div class="nm">${path}</div><div class="meta">${esc(w.names[r.p])} · ${r.dir==='in'?tr('flows.towards_you'):tr('flows.away_from_you')}</div></div><b class="num" style="text-align:right">${fmtG(r.g)}<br><small>${pct(r.g/t)}</small></b></div>`;}
  if(sel.length>F.n)o+=`<div class="btns">${btn(tr('flows.show_more',{n:Math.min(FLOWS_N,sel.length-F.n)}),'flowsSet',{more:1},'ghost sm')}</div><p class="meta">${tr('flows.n_flows',{n:sel.length})}</p>`;
  openModal(o);}
// A button that opens it, for any panel showing a link or a port.
const flowsBtn=(k,id)=>btn(tr('flows.see_every_flow'),'flowsOpen',{k,id},'ghost sm');
