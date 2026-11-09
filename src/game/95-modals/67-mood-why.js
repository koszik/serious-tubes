/* ---------- why a customer is (un)happy ----------
   The day's mood update, test by test (moodParts, 40-progress/17-mood.js): what passes, what fails, what each failure
   costs a day and where to look next. */
function moodWhyModal(id){const b=S.biz.find(x=>x.id===id);if(!b||!R)return;const M=moodParts(b),T=BIZ_T[b.type];
  const pts=x=>(x>=0?'+':'−')+Math.abs(x).toFixed(Math.abs(x)>=1||x===0?0:2);
  let o=`<div style="display:flex;align-items:center"><div><div class="eyebrow">${tr('mood_why.why_this_mood')}</div><h2 style="font-size:22px">${esc(b.name)}</h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>`;
  const bh=ddosAll().some(a=>a.bh&&a.tgt===b.id);
  o+=`<p class="meta">${tr('common.happiness_p',{p:Math.round(b.mood)})} · ${bh?tr('mood_why.blackholed_no_change'):M.ok?tr('mood_why.all_good_per_day',{pts:pts(M.delta)}):M.grace?tr('mood_why.provisioning_no_change'):tr('mood_why.per_day',{pts:pts(M.delta)})}</p>`;
  if(!M.ok&&!M.grace&&M.ease<1)o+=`<p class="meta">${tr('mood_why.eased',{p:pct(1-M.ease)})}</p>`;
  const row=(p,name,detail,extra='')=>`<div class="row"><div class="grow"><div class="nm">${p.ok?'✅':'❌'} ${name}</div><div class="meta">${detail}</div>${extra}</div><b class="num" style="text-align:right">${p.ok?'':pts(-p.pen*M.ease)}</b></div>`;
  for(const p of M.parts){if(p.on===false)continue;
    if(p.k==='sf')o+=row(p,tr('mood_why.service'),T.fiber?(p.ok?tr('mood_why.fiber_up'):tr('customers.their_fiber_is_down')):tr('mood_why.service_detail',{p:pct(p.sf)}),!p.ok&&!T.fiber?`<div class="btns">${btn(tr('loss_why.why_the_loss'),'lossWhy',{id:b.id},'ghost sm')}</div>`:'');
    else if(p.k==='reach')o+=row(p,tr('mood_why.reach'),p.ok?tr('mood_why.reach_ok'):tr('customers.you_cannot_reach_the_whole_internet',{p:pct(R.reach)}));
    else if(p.k==='scrub'){const q=scrubFar(b.city);o+=row(p,tr('mood_why.scrubbing'),p.ok?tr('mood_why.scrub_ok'):!hasScrub()?tr('common.needs_a_scrubbing_center'):tr('customers.attacks_on_city_are_hauled_to',{city:CITY[b.city].name,to:CITY[q.to].name,ms:Math.round(q.ms)}));}
    else if(p.k==='reqs'){const bad=(b.reqs||[]).filter(k=>REQS[k]&&!REQS[k].ok(b)).map(k=>typeof REQS[k].l==='function'?REQS[k].l(b):REQS[k].l);
      o+=row(p,tr('mood_why.requirements'),bad.length?esc(bad.join(' · '))+(p.ok?' · '+tr('mood_why.reqs_grace'):''):tr('mood_why.reqs_ok'));}
    else if(p.k==='lag'){const q=rtqTop(b);o+=row(p,tr('mood_why.latency'),tr('mood_why.latency_share_detail',{p:pct(Math.min(1,p.slow)),tol:p.tol,lim:pct(RQ_BAD)})+(!p.ok&&q?`<br>${rtqWhy(q,esc(b.name))}`:''));}}
  openModal(o);}
