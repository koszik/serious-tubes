/* ---------- pipes: every link and port is two of them (docs/specs/network-engine.md §11) ----------
   A link panel shows each direction on its own bar, with its loss, and the day hour by hour; a port shows what comes
   in (rx) and what goes out (tx). Loads are the busiest hour's, as the rest of the game plans by the peak. */
const lossTxt=x=>x>=0.0005?tr('pipes.p_loss',{p:(x*100).toFixed(x>=0.1?0:1)+'%'}):tr('pipes.no_loss');
// One bar: a label, load against capacity, and its loss.
function pipeRow(lab,g,cap,loss){const u=cap?g/cap:0;
  return `<div class="kv"><span>${lab}</span><b>${fmtG(g)} / ${fmtG(cap)} · <span style="color:${loss>=0.001?'var(--bad)':'inherit'}">${lossTxt(loss)}</span></b></div><div class="bar ${loss>=0.001?'bad':barCls(u)}"><i style="width:${Math.min(100,u*100)}%"></i></div>`;}
// A link, both ways, named by its ends.
function linkPipes(l,cap){const d=(R.ldir&&R.ldir[l.id])||[0,0],x=(R.lossD&&R.lossD[l.id])||[0,0],A=CITY[l.a].name,B=CITY[l.b].name;
  return pipeRow(`${esc(A)} → ${esc(B)}`,d[0],cap,x[0])+pipeRow(`${esc(B)} → ${esc(A)}`,d[1],cap,x[1])+graph24(pipeOfLink(l),cap,l.a,l.b);}
// A port's two pipes: rx (into your network) and tx (out).
function portPipes(k,id,cap){const p=pipeOfExit(k,id);if(!p)return '';let rx=0,tx=0,lr=0,lt=0;
  for(let h=0;h<24;h++){const a=pipeAt(p[0],h),b=pipeAt(p[1],h);rx=Math.max(rx,a.dlv);tx=Math.max(tx,b.dlv);lr=Math.max(lr,a.loss);lt=Math.max(lt,b.loss);}
  return pipeRow(tr('pipes.in_rx'),rx,cap,lr)+pipeRow(tr('pipes.out_tx'),tx,cap,lt);}
/* The day as a small chart: one direction as an area, the other as a line, capacity dashed, the hour shown marked.
   Pipes p = [a→b, b→a] (or [rx, tx]); a share scales a city pair's pipes down to one of its links. */
function graph24(p,cap,a,b){if(!p||!R.dp||!(cap>0))return '';const W=240,H=56,f=pairShareOf(p,cap),pts=[[],[]];let mx=cap;
  for(let h=0;h<24;h++)for(let k=0;k<2;k++){const v=pipeAt(p[k],h).dlv*f;pts[k].push(v);if(v>mx)mx=v;}
  const x=h=>(h/23*W).toFixed(1),y=v=>(H-v/mx*H).toFixed(1),line=a=>a.map((v,h)=>`${x(h)},${y(v)}`).join(' '),hr=UI.hour??R.hp??0;
  return `<svg class="g24" viewBox="0 0 ${W} ${H+12}" role="img" aria-label="${tr('pipes.today_hour_by_hour')}">
    <polygon points="0,${H} ${line(pts[0])} ${W},${H}" fill="var(--eye)" opacity=".35"/><polyline points="${line(pts[1])}" fill="none" stroke="var(--ink)" stroke-width="1.6"/>
    <line x1="0" x2="${W}" y1="${y(cap)}" y2="${y(cap)}" stroke="var(--bad)" stroke-dasharray="4 3" stroke-width="1"/><line x1="${x(hr)}" x2="${x(hr)}" y1="0" y2="${H}" stroke="var(--ink)" opacity=".35"/>
    <text x="0" y="${H+11}" font-size="9">0h</text><text x="${W/2-8}" y="${H+11}" font-size="9">12h</text><text x="${W-22}" y="${H+11}" font-size="9">24h UTC</text></svg>
    <p class="meta" style="margin:0 0 6px">${a&&b?tr('pipes.legend_link',{a:esc(CITY[a].name),b:esc(CITY[b].name)}):tr('pipes.legend_port')}</p>`;}
// The chart of a link shows its own share; a port's pipes are its own.
const pairShareOf=(p,cap)=>{const c=R.dp?R.dp.CAP[p[0]]:0;return c>0&&cap<c?cap/c:1;};
// A link's busier direction at its busiest hour, named from and to, with that direction's worst loss.
function hotDir(l){const d=(R.ldir&&R.ldir[l.id])||[R.load[l.id]||0,0],x=(R.lossD&&R.lossD[l.id])||[0,0],f=d[1]>d[0]?1:0;
  return {from:CITY[f?l.b:l.a].name,to:CITY[f?l.a:l.b].name,g:d[f],loss:Math.max(x[f],x[1-f]*(d[1-f]>0?1:0))};}
