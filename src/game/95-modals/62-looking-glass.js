/* ---------- looking glass: show route (36-engine-explain.js) ----------
   Every route a POP has to a network, best first, with local-pref, AS path, IGP cost and communities, and the step of
   the BGP decision that put each one where it is; then how that network sends its traffic back to you. */
const LG_REL={0:N_('lg.rel_cache'),1:N_('lg.rel_peer'),2:N_('lg.rel_provider')};
const lgExit=e=>`${esc(e.lab)} · ${esc(CITY[e.city].name)}`;
function lgModal(src,net){if(!S)return;const pops=Object.keys(S.pops).sort((a,b)=>CITY[a].name.localeCompare(CITY[b].name));
  src=src&&S.pops[src]?src:UI.lgFrom&&S.pops[UI.lgFrom]?UI.lgFrom:S.home&&S.pops[S.home]?S.home:pops[0];net=net&&NET[net]?net:UI.lgTo&&NET[UI.lgTo]?UI.lgTo:'ggl';UI.lgFrom=src;UI.lgTo=net;
  const nets=NETS.slice().sort((a,b)=>b.share-a.share),L=engLookingGlass(src,net),N=NET[net];
  let h=`<div style="display:flex;align-items:center"><div><div class="eyebrow">${tr('common.looking_glass')}</div><h2 style="font-size:26px">${tr('lg.show_route')}</h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>
  <div class="trsel"><label>${tr('common.from')} <select id="lgFrom">${pops.map(c=>`<option value="${c}"${c===src?' selected':''}>${esc(CITY[c].name)}</option>`).join('')}</select></label>
  <label>${tr('common.to')} <select id="lgTo">${nets.map(n=>`<option value="${n.id}"${n.id===net?' selected':''}>${esc(n.name)} (AS${n.asn})</option>`).join('')}</select></label>${btn(tr('common.run'),'lgRun',{},'pink sm')}${btn(tr('common.traceroute'),'trace',{city:src},'ghost sm')}</div>`;
  if(!L){openModal(h);return;}const O=L.origin;
  h+=`<p class="meta">${tr('lg.origin_line',{net:esc(N.name),asn:N.asn,reg:O.reg,city:esc(CITY[L.sv].name)})}</p>`;
  h+=`<h3 style="font-size:15px;margin:8px 0 4px">${tr('lg.routes_out',{city:esc(CITY[src].name)})}</h3>`;
  if(!L.out.length)h+=`<p class="empty">${tr('lg.no_route')}</p>`;
  for(const r of L.out){const ok=r.why==='best'||r.why==='mp';
    h+=`<div class="row lgr${ok?' on':''}"><div class="grow"><div class="nm">${r.why==='best'?'✓ ':r.why==='mp'?'= ':''}${lgExit(r.e)}</div>
      <div class="meta">${tr('lg.attrs',{lp:r.lp,path:r.path.join(' '),igp:Number.isFinite(r.D)?Math.round(r.D):'—'})} · ${r.ebgp?'eBGP':'iBGP'}</div>
      <div class="meta lgc">${r.comms.map(c=>`<span class="tag">${esc(c)}</span>`).join(' ')}</div><div class="${ok?'meta':'why'}">${tr(LG_WHY[r.why])}</div></div></div>`;}
  if(L.used)h+=`<p class="note">${tr('lg.routing_uses',{exit:lgExit(L.out.find(r=>r.e.k===L.used.k&&String(r.e.id)===String(L.used.id))?.e||{lab:L.used.id,city:L.used.city})})}</p>`;
  h+=`<h3 style="font-size:15px;margin:8px 0 4px">${tr('lg.routes_in',{net:esc(N.name),city:esc(CITY[src].name)})}</h3>`;
  if(!L.inb.length)h+=`<p class="empty">${tr('lg.no_way_in')}</p>`;
  for(const r of L.inb){const ok=r.why==='inbest'||r.why==='cache';
    h+=`<div class="row lgr${ok?' on':''}"><div class="grow"><div class="nm">${r.why==='inbest'?'✓ ':''}${lgExit(r.e)}</div>
      <div class="meta">${tr(LG_REL[r.rel])} · ${tr('lg.as_hops',{n:r.as})}${r.prep?' · '+tr('lg.prepended',{n:r.prep}):''}${r.e.k==='c'?'':' · '+Math.round(r.km).toLocaleString()+' km'}</div><div class="${ok?'meta':'why'}">${tr(LG_WHY[r.why])}</div></div></div>`;}
  h+=`<p class="note">${tr('lg.how_bgp_decides')}</p>`;
  openModal(h);}
