/* ---------- cross-connects ----------
   Every physical connection to another network is a fiber patch in a data centre, and the building charges for it:
   a one-off install and a monthly fee, the same for 10G or 3.2T. Transit, exchange, PNI and fabric ports pay one per
   port (a LAG one per member); a wave or a dark fiber pair pays one at each end; the ring to a second site one in each
   building. The fee is set by the city's market: by region, half as much again at the big hubs (50+ data centres),
   and nothing monthly in cheaper markets, where the patch is a one-off install. Remote ports, VXCs, caches in your
   cage and the capacity you sell (the buyer orders its own patch) pay none. Unlike transit, it never gets cheaper. */
const XC_REG={AF:120,AM:250,AS:200,EU:120,OC:200,SA:80},XC_NRC={AF:200,AM:500,AS:300,EU:250,OC:300,SA:200},XC_HUB=50,XC_HUB_M=1.5;
// Exceptions to the rule, by city id: {mo, nrc}.
const XC_CITY={};
let XC_CHEAP=null;
// A cheaper market: a country where homes pay less for broadband, or where exchanges are nearly free.
function xcCheapCC(cc){if(!XC_CHEAP){XC_CHEAP=new Set();for(const c of Object.values(CITY))if((c.arpu&&c.arpu<1)||c.ixCheap)XC_CHEAP.add(c.cc);}return XC_CHEAP.has(cc);}
const xcHub=c=>((CITY_PDB[c]||[])[0]||0)>=XC_HUB;
function xcMo(c){const C=CITY[c];if(!C)return 0;const o=XC_CITY[c];if(o)return o.mo;if(xcCheapCC(C.cc))return 0;return Math.round((XC_REG[C.reg]||150)*(xcHub(c)?XC_HUB_M:1));}
function xcNrc(c){const C=CITY[c];if(!C)return 0;const o=XC_CITY[c];if(o)return o.nrc;return XC_NRC[C.reg]||250;}
// Patches a link pays at each end: a wave one, a dark fiber one per lit pair; a VXC none.
const linkXc=l=>l.kind==='wave'?1:l.kind==='df'?(l.own?Math.max(1,l.pairs|0):1):0;
// Every patch the network pays for this month.
function xcTotal(){if(pzOn()||S.ar)return 0;let a=0;
  for(const t of S.transit)if(!t.pz)a+=(t.n||1)*xcMo(t.city);
  for(const x in S.ixp)if(!S.myIx[x]&&S.pops[ixCity(x)])a+=((S.ixn||{})[x]||1)*xcMo(ixCity(x));
  for(const p of S.pni)if(pniOn(p))a+=(p.n||1)*xcMo(p.city);
  for(const x of S.nni||[])a+=xcMo(x.city);
  for(const l of S.links){const n=linkXc(l);if(n)a+=n*(xcMo(l.a)+xcMo(l.b));}
  for(const c in S.pops)if(S.pops[c].site2)a+=2*xcMo(c);
  return a;}
// A link's own patches, monthly and to install.
const linkXcMo=(a,b,n=1)=>n*(xcMo(a)+xcMo(b)),linkXcNrc=(a,b,n=1)=>n*(xcNrc(a)+xcNrc(b));
// A second site: the building, and the ring's patch in each building.
const site2Cost=c=>SITE2_COST+2*xcNrc(c),site2Mo=c=>SITE2_MO+2*xcMo(c);
// An exchange port's patch: only in a building you are in, and not on your own exchange.
const ixXcMo=x=>S.pops[ixCity(x)]&&!S.myIx[x]?xcMo(ixCity(x)):0,ixXcNrc=x=>S.pops[ixCity(x)]&&!S.myIx[x]?xcNrc(ixCity(x)):0;
// One line under every place you buy a port or link: what the city's patches cost (included in the prices above).
const xcNote=c=>`<p class="meta">${xcMo(c)?tr('xc.prices_include_cross_connects_in_city',{city:CITY[c].name,nrc:fmt$(xcNrc(c)),mo:fmt$(xcMo(c))}):tr('xc.cross_connects_in_city_are_free_monthly',{city:CITY[c].name,nrc:fmt$(xcNrc(c))})}</p>`;
