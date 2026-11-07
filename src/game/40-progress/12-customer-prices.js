/* ---------- what customers pay ----------
   A circuit customer pays a markup (T.mk) on what the capacity would lease for on its route: the wave price for
   its size, which gets much cheaper per Gbps as waves grow, times the route's market. So a hyperscaler's 6.4T across
   Europe pays about a 6.4T wave, while a trading firm's 10G pays many times a 10G wave for the fastest path.
   IP customers pay a list rate per Gbps at their smallest size and less per Gbps the more they buy, times the city's
   transit market: IP is bought locally, so where the cheapest transit costs more than Frankfurt's, so does what you sell. */
// The wave-size multiplier for any capacity: LT[].m interpolated on log g, below 10G a fraction of a 10G wave.
function ltM(g){if(g<=LT[0].g)return Math.max(0.3,Math.sqrt(g/LT[0].g));const L=LT[LT.length-1];if(g>=L.g)return L.m*Math.pow(g/L.g,0.8);
  for(let i=1;i<LT.length;i++){const a=LT[i-1],b=LT[i];if(g<=b.g){const f=Math.log(g/a.g)/Math.log(b.g/a.g);return a.m+(b.m-a.m)*f;}}return L.m;}
// What g of capacity between a and b leases for a month: overland, or subsea where that is cheaper (the market sells
// Paris–Seoul around the coast, not across a dozen borders; LAND_X is only what building it yourself costs).
function capMo(a,b,g){const base=(300+kmBetween(a,b)*1.2)*ltM(g),sea=base*1.8*waveMarket(a,b,true).m;
  return isSub(a,b)?sea:Math.min(sea,base*waveMarket(a,b,false).m*landMult(a,b));}
// Per Gbps, in cents, so bw × rate stays a customer's monthly bill everywhere (a 6.4T circuit pays a few dollars a Gbps).
const cents=x=>Math.round(x*100)/100,perG=(mo,bw)=>Math.max(0.01,cents(mo/bw));
const l2Rate=(T,a,b,bw)=>perG(capMo(a,b,bw)*(T.mk||1),bw);
const IP_VOL=0.25;
// Korea's markup is what senders pay to reach Korean users (sender pays), not what customers in Korea pay: Asia's level.
const IP_REF=30,IPM={};
function ipMkt(c){if(!c||!CITY[c])return 1;let v=IPM[c];if(v===undefined){let m=Infinity;for(const n of NETS)if(sellsAt(n,c))m=Math.min(m,n.price*netMult(n,c));
  v=m<Infinity?Math.max(1,m/IP_REF):regionMult(c);IPM[c]=v=CITY[c].kr?v*2.5/KR_TRANSIT:v;}return v;}
const ipRate=(T,bw,c)=>Math.max(1,Math.round(T.rate*Math.pow(bw/T.opts[0],-IP_VOL)*ipMkt(c)));
/* Large IP customers could buy transit from anyone, so they pay the local market, haggled: somewhere between 0.9× the
   cheapest transit and the median (China's networks aside), drawn per customer from a bell curve when it first asks (b.hg). On top
   comes only what their destinations cost beyond ordinary transit: China at its own carriers' price, Korea's sender fee.
   Up to IP_S they pay the list rate and their wishes' extras; from IP_L only the market; on a log scale in between. */
const IP_S=40,IP_L=400;
function ipBand(c){const ps=NETS.filter(n=>!n.cn&&sellsAt(n,c)).map(n=>transitPerG(n,c,false)).sort((a,b)=>a-b);
  const k=CITY[c].kr?2.5/KR_TRANSIT:1;if(!ps.length){const v=IP_REF*regionMult(c)*k;return [v,v];}
  const m=ps.length%2?ps[ps.length>>1]:(ps[ps.length/2-1]+ps[ps.length/2])/2;return [0.9*ps[0]*k,Math.max(0.9*ps[0],m)*k];}
// A bell curve (four hashed uniforms) around 0.5, sd 0.2: most land mid-band, a few haggle hard or barely. Hashed from
// who is asking, so it takes nothing from the game's random numbers. Only types that come in sizes that blend get one.
const hmix=h=>{h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;return (h>>>0)/4294967296;};
function ipHaggle(key){let s=0;for(let i=0;i<4;i++)s+=hmix(hstr(key+'|hg'+i));return cents(clamp(0.5+(s-2)*0.2*Math.sqrt(3),0,1));}
const ipHg=(T,key)=>!T.l2&&!T.fiber&&T.opts&&T.opts[T.opts.length-1]>IP_S?ipHaggle(key):undefined;
// The share of a class's traffic that goes to China's networks (from outside China) and to Korea's, per city.
const DSTX=new Map();
function dstExp(cls,c){const key=cls+'|'+c;let r=DSTX.get(key);if(r)return r;const a=[0,0];
  const add=(j,w)=>{const n=NETS[j];if(!n)return;if(n.cn&&!cnCity(c))a[0]+=w;else if(n.kr&&!CITY[c].kr)a[1]+=w;};
  if(TRAFFIC[cls].dst==='audience'){const A=audStatic(CIDX[c]),t=A.reduce((s,x)=>s+x[1],0);if(t>0)for(const [o,w] of A)add(ORIGINS[o].nj,w/t);}
  else{const A=dstShares(cls,cityShTab(c));for(let j=0;j<A.length;j++)if(A[j])add(j,A[j]);}
  DSTX.set(key,r=a);return r;}
// What a Gbps to those destinations costs beyond the band's middle: a Chinese carrier's transit, the sender fee.
const BTK=new Map(),typeOf=T=>{let k=BTK.get(T);if(k===undefined)BTK.set(T,k=Object.keys(BIZ_T).find(x=>BIZ_T[x]===T)||'');return k;};
function dstCost(T,c,mid){const cls=CLASS_OF[typeOf(T)];if(!cls||!TRAFFIC[cls])return 1;const [cn,kr]=dstExp(cls,c);let x=0;
  if(cn>0){let p=Infinity;for(const n of NETS)if(n.cn&&n.price)p=Math.min(p,sellsAt(n,c)?transitPerG(n,c,false):n.price*transitEro());if(p<Infinity)x+=cn*Math.max(0,p-mid);}
  if(kr>0&&scnRule('sender'))x+=kr*KR_FEE;return 1+x/mid;}
const ipW=bw=>clamp(Math.log(bw/IP_S)/Math.log(IP_L/IP_S),0,1);
function ipLarge(T,c,h){const [lo,hi]=ipBand(c);return (lo+(hi-lo)*(h??0.5))*dstCost(T,c,(lo+hi)/2);}
function ipPrice(T,bw,c,h){const w=ipW(bw),s=ipRate(T,bw,c);return w<=0?s:cents(s*(1-w)+ipLarge(T,c,h)*w);}
// Wishes add their extras in full to small customers and nothing to large IP ones.
const reqMul=(T,bw,rs)=>1+(T.l2?1:1-ipW(bw))*(rs||[]).reduce((a,k)=>a+(REQS[k]?REQS[k].bonus:0),0);
// One-off events: a fee for the days they run, cheaper per Gbps the bigger they are.
const eventFee=(bw,dur,k)=>Math.round(Math.pow(bw,0.75)*k*dur);
// Multi-site circuits: per site, more per site for more bandwidth but less per Gbps.
const siteMo=(T,bw)=>Math.round((T.siteRate||700)*Math.pow(bw,0.6));
