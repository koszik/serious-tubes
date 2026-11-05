/* ---------- the internet's latency between cities ----------
   Outside your network traffic follows the real cables, not a straight line: every cable landing pair at 1.25x its
   length (landing stations, backhaul, routes that are never quite direct) and land routes between near neighbours at
   1.6x (fiber at 200 km/ms either way); long routes land within 10% of measured RTTs. Other
   networks' international traffic does not cross Russia or mainland China (it may reach their cities, not go through),
   which is why London-Tokyo goes by sea or
   by way of the US. The map is the catalog's, not today's cuts: the internet routes round one, and a fixed map keeps
   routing deterministic. Rows are worked out on first use, one Dijkstra per source city, and kept. */
const WL_K=4,WL_KM=600,WL_CAB=1.25,WL_LAND=1.6,WL_FIBER=200;
// Your own best build (for latency promises): your own fiber over land, the cables as they are.
const WL_OWN=1.1,WL_OWN_CAB=1;
const WLG={},WLR={};
function wlGraph(landF){if(WLG[landF])return WLG[landF];const cabF=landF===WL_OWN?WL_OWN_CAB:WL_CAB;const n=CITIES.length,adj=Array.from({length:n},()=>[]);
  const add=(a,b,ms)=>{if(a===b||!(ms>0))return;adj[a].push(b,ms);adj[b].push(a,ms);};
  for(const c of CABLE_PAIRS){const a=CIDX[c.a],b=CIDX[c.b];if(a===undefined||b===undefined)continue;add(a,b,c.km*cabF*((CAB[c.cid]&&CAB[c.cid].lat)||1)/WL_FIBER);}
  for(let i=0;i<n;i++){const A=CITIES[i],la=lands(A),near=[];
    for(let j=0;j<n;j++)if(j!==i&&lands(CITIES[j]).some(x=>la.includes(x)))near.push([j,kmI(i,j)]);
    near.sort((x,y)=>x[1]-y[1]);for(let k=0;k<near.length;k++){const [j,km]=near[k];if(k>=WL_K&&km>WL_KM)break;add(i,j,km*landF/WL_FIBER);}
    // Every country is joined up inside: the two nearest cities of its own on the same land, however far.
    let dom=0;for(const [j,km] of near)if(CITIES[j].cc===A.cc){add(i,j,km*landF/WL_FIBER);if(++dom>=2)break;}}
  return WLG[landF]=adj;}
// International transit avoids these countries; a path may still start or end in one, or stay inside it.
const wlClosed=i=>!!(CITIES[i].ru||CITIES[i].cn);
function wlRow(s,landF){const key=landF+'|'+s;let d=WLR[key];if(d)return d;const adj=wlGraph(landF),n=CITIES.length,done=new Uint8Array(n),cc=CITIES[s].cc;d=new Float64Array(n).fill(Infinity);d[s]=0;
  for(;;){let u=-1,best=Infinity;for(let i=0;i<n;i++)if(!done[i]&&d[i]<best){best=d[i];u=i;}if(u<0)break;done[u]=1;
    // Inside a closed country a path may go on within it (to its own cities), never out the other side.
    const shut=u!==s&&wlClosed(u)&&CITIES[u].cc!==cc,ucc=CITIES[u].cc;
    const A=adj[u];for(let k=0;k<A.length;k+=2){const v=A[k];if(shut&&CITIES[v].cc!==ucc)continue;const w=best+A[k+1];if(w<d[v])d[v]=w;}}
  return WLR[key]=d;}
// One-way ms between city indexes over the internet (or a straight 1.3x line if the map has no way).
function worldMs(a,b){if(a===b)return 0;const v=wlRow(a,WL_LAND)[b];return v<Infinity?v:kmI(a,b)*WL_LAND/WL_FIBER;}
// The fastest one-way path you could build between two cities: the latency a trading firm knows is possible.
function bestBuildMs(a,b){const A=CIDX[a],B=CIDX[b];if(A===B)return 0;const v=wlRow(A,WL_OWN)[B];return v<Infinity?v:kmI(A,B)*WL_OWN/WL_FIBER;}
