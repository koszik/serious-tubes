/* ---------- BGP policy in the Routing modal (docs/specs/network-engine.md §4, §11) ----------
   Routers start with nothing configured: every route has local-pref 100 and BGP takes the shortest AS path, then the
   nearest exit. Here you name communities (tags), attach them to ports, POPs and customers, and write rules, each
   one sentence: routes tagged X, at place Y, do Z. Plus the priority queue and multipath. */
const POL_CLS_L={backup:N_('bgp.cls_backup'),content:N_('bgp.cls_content'),dci:N_('bgp.cls_dci'),enterprise:N_('bgp.cls_enterprise'),gaming:N_('bgp.cls_gaming'),home:N_('bgp.cls_home'),
 live:N_('bgp.cls_live'),office:N_('bgp.cls_office'),special:N_('bgp.cls_special'),stream:N_('bgp.cls_stream'),training:N_('bgp.cls_training')};
const POL_CLS=['home','office','content','stream','gaming','live','training','dci','backup','enterprise','special'];
const polClsName=k=>POL_CLS_L[k]?tr(POL_CLS_L[k]):k;
const POL_FROM_L={cache:N_('bgp.m_from_cache'),ix:N_('bgp.m_from_ix'),pni:N_('bgp.m_from_pni'),transit:N_('bgp.m_from_transit')};
const POL_ACT_L={blackhole:N_('bgp.act_blackhole'),deny:N_('bgp.act_deny'),nocarry:N_('bgp.act_nocarry'),noexp:N_('bgp.act_noexp'),regonly:N_('bgp.act_regonly')};
// A tag or automatic community, in words.
function polMatchTxt(m){if(m==='*')return tr('bgp.m_every_route');const t=(S.pol.tags||[]).find(x=>x.id===m);if(t)return tr('bgp.m_tagged',{tag:esc(t.name)});
  const [k,v]=m.split(':');
  return k==='from'&&POL_FROM_L[v]?tr(POL_FROM_L[v]):m==='cone'?tr('bgp.m_cone'):m==='biz'?tr('bgp.m_biz'):k==='net'&&NET[v]?tr('bgp.m_net',{net:esc(NET[v].name)}):k==='region'?tr('bgp.m_region',{reg:v})
    :k==='at'&&CITY[v]?tr('bgp.m_at',{city:esc(CITY[v].name)}):k==='at-region'?tr('bgp.m_at_region',{reg:v}):k==='pop'&&CITY[v]?tr('bgp.m_pop',{city:esc(CITY[v].name)})
    :k==='pop-region'?tr('bgp.m_pop_region',{reg:v}):k==='class'?tr('bgp.m_class',{cls:polClsName(v)}):k==='cust'?tr('bgp.m_cust',{name:esc((S.biz.find(b=>b.id===v)||{}).name||v)}):esc(m);}
// A thing you can tag or a rule can sit at, in words.
function polRefTxt(ref){const [k,id]=[ref.slice(0,ref.indexOf(':')),ref.slice(ref.indexOf(':')+1)];
  if(k==='t'){const t=S.transit.find(x=>x.id===id);return t?tr('bgp.ref_transit',{net:esc(NET[t.net].name),city:esc(CITY[t.city].name)}):esc(ref);}
  if(k==='p'){const p=S.pni.find(x=>x.id===id);return p?tr('bgp.ref_pni',{net:esc(NET[p.net].name),city:esc(CITY[p.city].name)}):esc(ref);}
  if(k==='ix')return S.ixp[id]!==undefined||S.myIx[id]?tr('bgp.ref_ix',{ix:esc(ixName(id))}):esc(ref);
  if(k==='c'){const c=S.caches.find(x=>x.id===id);return c?tr('common.name_cache',{name:esc(NET[c.net].cache.name)})+' · '+esc(CITY[c.city].name):esc(ref);}
  if(k==='pop')return CITY[id]?tr('bgp.ref_pop',{city:esc(CITY[id].name)}):esc(ref);
  if(k==='b'){const b=S.biz.find(x=>x.id===id);return b?esc(b.name):esc(ref);}return esc(ref);}
function polPlaceTxt(at){const P=polPlace(at);if(!P)return esc(at);
  if(P.k==='l'){const [a,b]=P.key.split('|');return tr('bgp.at_link',{a:esc(CITY[a].name),b:esc(CITY[b].name)});}
  if(P.k==='pop')return P.city==='*'?tr('bgp.at_every_pop'):tr('bgp.at_pop',{city:esc(CITY[P.city].name)});
  const w=P.ref==='*'?tr('bgp.at_every_exit'):polRefTxt(P.ref);return P.k==='in'?tr('bgp.at_in',{where:w}):tr('bgp.at_out',{where:w});}
function polActTxt(r){return r.act==='lp'?tr('bgp.act_lp',{n:r.n}):r.act==='prepend'?tr('bgp.act_prepend',{n:r.n}):POL_ACT_L[r.act]?tr(POL_ACT_L[r.act]):esc(r.act);}
// What can be tagged: ports, caches, POPs, customers.
const polRefs=()=>S.transit.map(t=>'t:'+t.id).concat(S.pni.map(p=>'p:'+p.id),Object.keys(S.ixp).map(x=>'ix:'+x),S.caches.map(c=>'c:'+c.id),Object.keys(S.pops).map(c=>'pop:'+c),S.biz.filter(b=>!BIZ_T[b.type].fiber).map(b=>'b:'+b.id));
// The automatic communities worth offering: kinds of exit, the cone, the networks you send most to, regions, classes.
function polAutoMs(){const nets=NETS.filter(n=>R.demTo[n.id]>0).sort((a,b)=>(R.demTo[b.id]||0)-(R.demTo[a.id]||0)).slice(0,24).map(n=>'net:'+n.id);
  return ['*','from:transit','from:pni','from:ix','from:cache','cone','biz',...nets,...REGIONS.map(r=>'region:'+r),...Object.keys(S.pops).map(c=>'pop:'+c),...POL_CLS.map(k=>'class:'+k)];}
function polPlaces(){const ex=S.transit.map(t=>'t:'+t.id).concat(S.pni.map(p=>'p:'+p.id),Object.keys(S.ixp).map(x=>'ix:'+x));
  return ['x:*:in','x:*:out',...ex.flatMap(r=>['x:'+r+':in','x:'+r+':out']),...[...new Set(S.links.map(edgeKey))].map(k=>'l:'+k),'pop:*',...Object.keys(S.pops).map(c=>'pop:'+c)];}
const POL_ACTS=['lp','deny','nocarry','noexp','prepend','regonly','blackhole'];
const polOpt=(v,t,sel)=>`<option value="${esc(v)}"${sel?' selected':''}>${t}</option>`;
function bgpPanel(){const P=S.pol||polEmpty(),pops=Object.keys(S.pops),mp=pops.filter(c=>P.mp[c]).length;
  let h=`<h3 style="font-size:15px;margin:8px 0 4px">${tr('bgp.bgp_policy')}</h3><p class="meta" style="margin:2px 0 6px">${tr('bgp.routers_start_with_nothing_configured')}</p>`;
  h+=`<div class="kv"><span>${tr('bgp.multipath')}</span><b>${tr('bgp.n_of_m_pops',{n:mp,m:pops.length})}</b></div><p class="meta" style="margin:0 0 4px">${tr('bgp.multipath_shares_equal_routes')}</p><div class="btns">${btn(mp<pops.length?tr('bgp.multipath_everywhere'):tr('bgp.multipath_nowhere'),'polMp',{city:'*',on:mp<pops.length?1:0},'sm')}</div>`;
  // Tags
  h+=`<h4 class="sub4">${tr('bgp.tags')}</h4><p class="meta" style="margin:0 0 4px">${tr('bgp.a_tag_is_a_community')}</p>`;
  for(const t of P.tags){const on=P.on[t.id]||[];h+=`<div class="row"><div class="grow"><div class="nm">${esc(t.name)} <span class="meta">${S.asn}:${t.v}</span></div><div class="meta">${on.length?on.map(r=>`${polRefTxt(r)} ${btn('×','polTagOff',{id:t.id,ref:r},'ghost sm')}`).join(' · '):tr('bgp.on_nothing_yet')}</div>
    <div class="btns"><select id="polOn_${t.id}" aria-label="${tr('bgp.attach_to')}">${polRefs().filter(r=>!on.includes(r)).map(r=>polOpt(r,polRefTxt(r))).join('')}</select>${btn(tr('bgp.attach'),'polTagOn',{id:t.id},'sm')}</div></div>${btn('×','polTagDel',{id:t.id},'ghost sm')}</div>`;}
  h+=`<div class="btns"><input id="polTagName" maxlength="20" placeholder="${tr('bgp.tag_name_eg')}" aria-label="${tr('bgp.tag_name')}" autocapitalize="off">${btn(tr('bgp.add_tag'),'polTagAdd',{},'sm',P.tags.length>=POL_LIM.tags)}</div>`;
  // Rules
  h+=`<h4 class="sub4">${tr('bgp.rules')}</h4><p class="meta" style="margin:0 0 4px">${tr('bgp.rules_apply_in_order')}</p>`;
  P.rules.forEach((r,i)=>{h+=`<div class="row"><div class="grow"><div class="nm">${polMatchTxt(r.m)} · ${polPlaceTxt(r.at)} · <b>${polActTxt(r)}</b></div></div>${btn('↑','polRuleMove',{id:r.id,by:-1},'ghost sm',i===0)}${btn('↓','polRuleMove',{id:r.id,by:1},'ghost sm',i===P.rules.length-1)}${btn('×','polRuleDel',{id:r.id},'ghost sm')}</div>`;});
  if(!P.rules.length)h+=`<p class="empty">${tr('bgp.no_rules_yet')}</p>`;
  const ms=P.tags.map(t=>t.id).concat(polAutoMs());
  h+=`<div class="polnew"><label>${tr('bgp.routes')} <select id="polM">${ms.map(m=>polOpt(m,polMatchTxt(m))).join('')}</select></label>
    <label>${tr('bgp.where')} <select id="polAt">${polPlaces().map(a=>polOpt(a,polPlaceTxt(a))).join('')}</select></label>
    <label>${tr('bgp.do')} <select id="polAct">${POL_ACTS.map(a=>polOpt(a,polActTxt({act:a,n:a==='lp'?200:1}))).join('')}</select></label>
    <label>${tr('bgp.number')} <input id="polN" type="number" min="0" max="1000" value="200" inputmode="numeric"></label>
    <div class="btns">${btn(tr('bgp.add_rule'),'polRuleAdd',{},'pink sm',P.rules.length>=POL_LIM.rules)}</div><p class="meta">${tr('bgp.which_actions_go_where')}</p></div>`;
  // QoS
  h+=`<h4 class="sub4">${tr('bgp.priority_queue')}</h4><p class="meta" style="margin:0 0 4px">${tr('bgp.priority_traffic_is_served_first')}</p>`;
  P.qos.forEach((q,i)=>{h+=`<div class="row"><div class="grow"><div class="nm">${polMatchTxt(q.m)}</div></div>${btn('×','polQosDel',{i},'ghost sm')}</div>`;});
  h+=`<div class="btns"><select id="polQ" aria-label="${tr('bgp.priority_queue')}">${P.tags.map(t=>t.id).concat(['biz',...POL_CLS.map(k=>'class:'+k)]).map(m=>polOpt(m,polMatchTxt(m))).join('')}</select>${btn(tr('bgp.add'),'polQosAdd',{},'sm',P.qos.length>=POL_LIM.qos)}</div>`;
  return h;}
// The multipath switch on a POP's routers.
function mpCtl(c){if(!S.pol)return '';const on=!!S.pol.mp[c];return `<div class="btns"><span class="meta" style="align-self:center">${tr('bgp.multipath')}</span>${btn(on?tr('common.on'):tr('common.off'),'polMp',{city:c,on:on?0:1},on?'pink sm':'ghost sm',false,tr('bgp.multipath_shares_equal_routes'))}</div>`;}
