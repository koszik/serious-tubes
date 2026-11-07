/* ---------- pipes: every link and port is two of them (docs/specs/network-engine.md §11) ----------
   A link panel shows each direction on its own bar, with its loss, and the day hour by hour; a port shows what comes
   in (rx) and what goes out (tx). Loads are the busiest hour's, as the rest of the game plans by the peak. */
const lossTxt=x=>x>=0.0005?tr('pipes.p_loss',{p:(x*100).toFixed(x>=0.1?0:1)+'%'}):tr('pipes.no_loss');
// One bar: a label, load against capacity, and its loss.
function pipeRow(lab,g,cap,loss){const u=cap?g/cap:0;
  return `<div class="kv"><span>${lab}</span><b>${fmtG(g)} / ${fmtG(cap)} · <span style="color:${loss>=0.001?'var(--bad)':'inherit'}">${lossTxt(loss)}</span></b></div><div class="bar ${loss>=0.001?'bad':barCls(u)}"><i style="width:${Math.min(100,u*100)}%"></i></div>`;}
// A link, both ways, named by its ends.
function linkPipes(l,cap){const d=(R.ldir&&R.ldir[l.id])||[0,0],x=(R.lossD&&R.lossD[l.id])||[0,0],A=CITY[l.a].name,B=CITY[l.b].name;
  return pipeRow(`${esc(A)} → ${esc(B)}`,d[0],cap,x[0])+pipeRow(`${esc(B)} → ${esc(A)}`,d[1],cap,x[1])+graph24(pipeOfLink(l),cap,l.a,l.b)+(R.dp&&pipeOfLink(l)?`<div class="btns">${flowsBtn('link',l.id)}</div>`:'');}
// A port's two pipes at their busiest: rx (into your network) and tx (out), and each one's worst loss of the day.
function pipePeak(p){let rx=0,tx=0,lr=0,lt=0;for(let h=0;h<24;h++){const a=pipeAt(p[0],h),b=pipeAt(p[1],h);rx=Math.max(rx,a.dlv);tx=Math.max(tx,b.dlv);lr=Math.max(lr,a.loss);lt=Math.max(lt,b.loss);}return {rx,tx,lr,lt};}
/* A port in a list (transit, exchange, PNI, cache, customer): both directions on one line with two thin bars, and the
   day and every flow folded away until asked for, so a POP with twenty ports still reads at a glance. */
function pipePair(q,cap){const l=Math.max(q.lr,q.lt),c=(g,x)=>x>=0.001?'bad':barCls(cap?g/cap:0),w=g=>Math.min(100,cap?g/cap*100:0);
  return `<div class="kv"><span>↓ ${fmtG(q.rx)} · ↑ ${fmtG(q.tx)} <small class="meta">/ ${fmtG(cap)}</small></span><b style="color:${l>=0.001?'var(--bad)':'inherit'}">${lossTxt(l)}</b></div>
  <div class="bar2" title="${tr('pipes.in_rx')} · ${tr('pipes.out_tx')}"><div class="bar ${c(q.rx,q.lr)}"><i style="width:${w(q.rx)}%"></i></div><div class="bar ${c(q.tx,q.lt)}"><i style="width:${w(q.tx)}%"></i></div></div>`;}
const pipeFold=(key,body)=>{const on=!!(UI.pOpen&&UI.pOpen[key]);return `<div class="btns">${btn((on?'▾ ':'▸ ')+tr('pipes.day_and_flows'),'pipeFold',{key},'ghost sm')}</div>${on?body():''}`;};
function portPipes(k,id,cap){const p=pipeOfExit(k,id);if(!p)return '';
  return pipePair(pipePeak(p),cap)+pipeFold(k+':'+id,()=>graph24(p,cap)+`<div class="btns">${flowsBtn(k,id)}</div>`);}
// Several ports as one (a network's cache boxes in a city): their pipes added hour by hour.
function portsDay(k,ids){const dp=R.dp;if(!dp)return null;const ps=ids.map(id=>pipeOfExit(k,id)).filter(Boolean);if(!ps.length)return null;
  const s=[new Array(24).fill(0),new Array(24).fill(0)],L=[0,0],{OFFH,LOSSH,NP}=dp;
  for(const p of ps)for(let d=0;d<2;d++){const q=p[d],a=s[d];for(let h=0;h<24;h++){const i=h*NP+q,l=LOSSH[i];a[h]+=OFFH[i]*(1-l);if(l>L[d])L[d]=l;}}
  return {s,q:{rx:Math.max(...s[0]),tx:Math.max(...s[1]),lr:L[0],lt:L[1]}};}
function cachePipes(city,net,cap){const ids=S.caches.filter(x=>x.city===city&&x.net===net).map(x=>x.id),D=portsDay('c',ids);if(!D)return '';
  return pipePair(D.q,cap)+pipeFold('cg:'+city+'|'+net,()=>graph24s(D.s,cap,tr('pipes.legend_port'))+`<div class="btns">${flowsBtn('cg',city+'|'+net)}</div>`);}
// A customer's own port: what it sends you (rx) and what you deliver to it (tx), against its port size.
function custPipes(b){const T=BIZ_T[b.type];if(T.fiber||!R.dp)return '';const D=custDay(b);if(!D||!D.its.length)return '';const cap=b.bw;
  const q={rx:Math.max(...D.rx),tx:Math.max(...D.tx),lr:D.loss,lt:D.loss};
  const tf=(R.tgtF&&R.tgtF[b.id])??1,why=D.loss>=0.0005||tf<0.999?`<div class="btns">${btn(tr('loss_why.why_the_loss'),'lossWhy',{id:b.id},'ghost sm')}</div>`:'';
  return pipePair(q,cap)+why+pipeFold('b:'+b.id,()=>graph24s([[...D.rx],[...D.tx]],cap,tr('pipes.legend_port'))+`<div class="btns">${flowsBtn('b',b.id)}</div>`);}
/* The day as a small chart: one direction as an area, the other as a line, capacity dashed, the hour shown marked.
   Pipes p = [a→b, b→a] (or [rx, tx]); a share scales a city pair's pipes down to one of its links. */
function graph24(p,cap,a,b){if(!p||!R.dp||!(cap>0))return '';const f=pairShareOf(p,cap),pts=[[],[]];
  for(let h=0;h<24;h++)for(let k=0;k<2;k++)pts[k].push(pipeAt(p[k],h).dlv*f);
  return graph24s(pts,cap,a&&b?tr('pipes.legend_link',{a:esc(CITY[a].name),b:esc(CITY[b].name)}):tr('pipes.legend_port'));}
// Two 24-hour series (area, line) against a capacity.
function graph24s(pts,cap,legend){if(!(cap>0))return '';const W=240,H=56;let mx=cap;for(const s of pts)for(const v of s)if(v>mx)mx=v;
  const x=h=>(h/23*W).toFixed(1),y=v=>(H-v/mx*H).toFixed(1),line=a=>a.map((v,h)=>`${x(h)},${y(v)}`).join(' '),hr=UI.hour??R.hp??0;
  return `<svg class="g24" viewBox="0 0 ${W} ${H+12}" role="img" aria-label="${tr('pipes.today_hour_by_hour')}">
    <polygon points="0,${H} ${line(pts[0])} ${W},${H}" fill="var(--eye)" opacity=".35"/><polyline points="${line(pts[1])}" fill="none" stroke="var(--ink)" stroke-width="1.6"/>
    <line x1="0" x2="${W}" y1="${y(cap)}" y2="${y(cap)}" stroke="var(--bad)" stroke-dasharray="4 3" stroke-width="1"/><line x1="${x(hr)}" x2="${x(hr)}" y1="0" y2="${H}" stroke="var(--ink)" opacity=".35"/>
    <text x="0" y="${H+11}" font-size="9">0h</text><text x="${W/2-8}" y="${H+11}" font-size="9">12h</text><text x="${W-22}" y="${H+11}" font-size="9">24h UTC</text></svg>
    <p class="meta" style="margin:0 0 6px">${legend}</p>`;}
// The chart of a link shows its own share; a port's pipes are its own.
const pairShareOf=(p,cap)=>{const c=R.dp?R.dp.CAP[p[0]]:0;return c>0&&cap<c?cap/c:1;};
// A link's busier direction at its busiest hour, named from and to, with that direction's worst loss.
function hotDir(l){const d=(R.ldir&&R.ldir[l.id])||[R.load[l.id]||0,0],x=(R.lossD&&R.lossD[l.id])||[0,0],f=d[1]>d[0]?1:0;
  return {from:CITY[f?l.b:l.a].name,to:CITY[f?l.a:l.b].name,g:d[f],loss:Math.max(x[f],x[1-f]*(d[1-f]>0?1:0))};}
