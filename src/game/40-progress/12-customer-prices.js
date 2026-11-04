/* ---------- what customers pay ----------
   A circuit customer pays a markup (T.mk) on what the capacity would lease for on its route: the wave price for
   its size, which gets much cheaper per Gbps as waves grow, times the route's market. So a hyperscaler's 6.4T across
   Europe pays about a 6.4T wave, while a trading firm's 10G pays many times a 10G wave for the fastest path.
   IP customers pay a list rate per Gbps at their smallest size and less per Gbps the more they buy. */
// The wave-size multiplier for any capacity: LT[].m interpolated on log g, below 10G a fraction of a 10G wave.
function ltM(g){if(g<=LT[0].g)return Math.max(0.3,Math.sqrt(g/LT[0].g));const L=LT[LT.length-1];if(g>=L.g)return L.m*Math.pow(g/L.g,0.8);
  for(let i=1;i<LT.length;i++){const a=LT[i-1],b=LT[i];if(g<=b.g){const f=Math.log(g/a.g)/Math.log(b.g/a.g);return a.m+(b.m-a.m)*f;}}return L.m;}
// What g of capacity between a and b leases for a month.
function capMo(a,b,g){const sub=isSub(a,b),k=waveMarket(a,b,sub).m*(sub?1:landMult(a,b));return (300+kmBetween(a,b)*1.2)*ltM(g)*(sub?1.8:1)*k;}
// Per Gbps, in cents, so bw × rate stays a customer's monthly bill everywhere (a 6.4T circuit pays a few dollars a Gbps).
const cents=x=>Math.round(x*100)/100,perG=(mo,bw)=>Math.max(0.01,cents(mo/bw));
const l2Rate=(T,a,b,bw)=>perG(capMo(a,b,bw)*(T.mk||1),bw);
const IP_VOL=0.25;
const ipRate=(T,bw)=>Math.max(1,Math.round(T.rate*Math.pow(bw/T.opts[0],-IP_VOL)));
// One-off events: a fee for the days they run, cheaper per Gbps the bigger they are.
const eventFee=(bw,dur,k)=>Math.round(Math.pow(bw,0.75)*k*dur);
// Multi-site circuits: per site, more per site for more bandwidth but less per Gbps.
const siteMo=(T,bw)=>Math.round((T.siteRate||700)*Math.pow(bw,0.6));
