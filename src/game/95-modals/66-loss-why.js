/* ---------- where a customer's loss comes from ----------
   At its worst hour: every pipe and router its traffic crosses, weighted by how much of it crosses there and what each
   drops (first order, scaled to the loss it really sees), the Great Firewall, sessions lost with their other half, and
   while it is attacked what the scrubbing costs on top. */
function lossWhy(b){const dp=R.dp,D=dp&&dp.LBH?custDay(b):null;if(!D||!D.its.length)return null;
  const {NP,NE,LP,LS,LB,LOFF,LN,LNOFF,LBH,LQH,NLH,FG,FQ,IF,IV,CV,FCV,FI,FO,FIN,FOUT,EPO,EPD}=dp,NEP=dp.epK.length,NPOP=dp.POPC.length,{eps}=custItems(dp,b);
  // Its worst hour, as custDay reads it: the endpoint hour that delivers the smallest share of what was asked.
  let h=0,worst=0;for(const ep of eps)for(let k=0;k<24;k++){const o=EPO[k*NEP+ep];if(o>0){const l=1-EPD[k*NEP+ep]/o;if(l>worst){worst=l;h=k;}}}
  const by=new Map(),add=(key,v,l)=>{if(!(v>0))return;let r=by.get(key);if(!r)by.set(key,r={key,v:0,lost:0,l});r.v+=v;r.lost+=v*l;if(l>r.l)r.l=l;};
  const list=(id,v,q)=>{if(id<0||!(v>0))return;const Lh=q?LQH:LBH;let s=1;
    for(let k=LOFF[id],e=LOFF[id+1];k<e;k++){if(LB[k]===1)s=LS[k];const p=LP[k];add('p'+p,v*s,Lh[h*NP+p]);}
    for(let k=LNOFF[id],e=LNOFF[id+1];k<e;k++)add('n'+LN[k],v,NLH[h*NPOP+LN[k]]);};
  let T=0,gfw=0;const gn=new Map();
  for(const t of D.its){const f=IF[t],v=IV[t]*CV[FCV[f]+h];if(!(v>0))continue;const vi=v*FI[f],vo=v*FO[f];T+=vi+vo;list(FIN[f*3],vi,FQ[f]);list(FOUT[f],vo,FQ[f]);
    if(FG[f]>0){gfw+=(vi+vo)*FG[f];const j=dp.IJ[t];if(j>=0)gn.set(j,(gn.get(j)||0)+(vi+vo)*FG[f]);}}
  if(!(T>0))return {h,loss:0,rows:[],tf:(R.tgtF&&R.tgtF[b.id])??1};
  const rows=[...by.values()].filter(r=>r.lost>T*1e-4);if(gfw>T*1e-4)rows.push({key:'gfw',v:T,lost:gfw,l:gfw/T,nets:[...gn].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([j])=>NETS[j].name)});
  // Each pipe is counted as if it were alone; together they lose a little less, so scale them to what it really lost.
  const A=worst*T,sum=rows.reduce((a,r)=>a+r.lost,0),k=sum>A&&sum>0?A/sum:1;for(const r of rows)r.lost*=k;
  if(A-sum>T*5e-4)rows.push({key:'sess',v:T,lost:A-sum,l:0});
  for(const r of rows){r.share=r.v/T;r.part=r.lost/T;}rows.sort((a,b)=>b.part-a.part);
  return {h,loss:worst,rows,tf:(R.tgtF&&R.tgtF[b.id])??1,NE};}
// A row's name: a link one way, a port one way, a city's routers, or a cause that is not a pipe.
function lossName(key,NE){const dp=R.dp;if(key==='gfw')return tr('loss_why.great_firewall');if(key==='sess')return tr('loss_why.sessions_lost_with_their_other_half');
  const n=+key.slice(1);if(key[0]==='n')return tr('loss_why.routers_in_city',{city:CITY[dp.POPC[n]].name});
  if(n<2*NE){const e=dp.edges.find(x=>x[2]===n>>1);if(!e)return '?';const [a,b]=String(e[0]).split('|'),[x,y]=n&1?[b,a]:[a,b];return tr('loss_why.link_a_to_b',{a:CITY[x].name,b:CITY[y].name});}
  const ex=dp.ex[(n-2*NE)>>1];return `${(R.egDesc[ex.ek]||{}).lab||ex.ek} · ${CITY[ex.city].name} · ${(n-2*NE)&1?tr('pipes.out_tx'):tr('pipes.in_rx')}`;}
// Small losses matter here: one decimal under 10%.
const lossPc=x=>(x*100).toFixed(x>=0.1?0:1)+'%';
function lossWhyModal(id){const b=S.biz.find(x=>x.id===id);if(!b||!R.dp)return;const W=lossWhy(b);
  let o=`<div style="display:flex;align-items:center"><div><div class="eyebrow">${tr('loss_why.where_the_loss_comes_from')}</div><h2 style="font-size:22px">${esc(b.name)}</h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>`;
  if(!W){openModal(o+`<p class="empty">${tr('loss_why.no_traffic_to_explain')}</p>`);return;}
  o+=`<p class="meta">${tr('loss_why.at_its_worst_hour',{h:String(W.h).padStart(2,'0'),p:lossPc(W.loss)})}</p>`;
  for(const r of W.rows.slice(0,8))o+=`<div class="row"><div class="grow"><div class="nm">${esc(lossName(r.key,W.NE))}</div><div class="meta">${r.key==='gfw'?tr('loss_why.gfw_note_nets',{nets:esc((r.nets||[]).join(', '))}):r.key==='sess'?tr('loss_why.sess_note'):tr('loss_why.drops_l_of_what_crosses',{l:lossPc(r.l),x:pct(Math.min(1,r.share))})}</div></div><b class="num" style="text-align:right">${lossPc(r.part)}</b></div>`;
  if(!W.rows.length)o+=`<p class="empty">${tr('loss_why.nothing_lost_on_the_way')}</p>`;
  if(W.tf<0.999)o+=`<div class="row"><div class="grow"><div class="nm">${tr('loss_why.under_attack')}</div><div class="meta">${tr('loss_why.under_attack_note',{p:pct(1-W.tf)})}</div></div><b class="num" style="text-align:right">${pct(1-W.tf)}</b></div>`;
  openModal(o);}
