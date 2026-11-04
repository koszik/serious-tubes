/* Origins (docs/specs/network-engine.md §3.2): every network as one endpoint per region it serves from or has
   users in, e.g. NetChill / eu-west. Content sits where the network has PoPs; users live in its home countries.
   Built from the catalog at load, never saved, so indices stay stable from one load to the next. */
const ORIG_CW={cdn:1,host:1,t1:0.5,t2:0.5,eye:0.1},ORIG_UW={eye:1,t2:0.3,t1:0.1,cdn:0,host:0};
const ORIGINS=[],ORIG_BY_NET={};
(()=>{const byCc={};for(const c of CITIES)(byCc[c.cc]||(byCc[c.cc]=[])).push(c);
  // Weight w spread over regions in proportion to the population of the cities given.
  const spread=(cs,w,into,k)=>{const t=cs.reduce((a,c)=>a+c.P,0)||1;for(const c of cs){const o=into[c.rg]||(into[c.rg]={content:0,users:0,cs:[]});o[k]+=w*c.P/t;o.cs.push(c);}};
  NETS.forEach((n,nj)=>{const pops=(n.pops||[]).filter(c=>CITY[c]).map(c=>CITY[c]),ccs=n.cc?[].concat(n.cc):[...new Set(pops.map(c=>c.cc))];
    const home=ccs.flatMap(cc=>byCc[cc]||[]),sh=n.share||0,rg={};
    spread(pops.length?pops:home,sh*ORIG_CW[n.type],rg,'content');spread(home.length?home:pops,sh*ORIG_UW[n.type],rg,'users');
    let L=Object.keys(rg).sort().map(r=>({r,...rg[r]}));const tot=L.reduce((a,o)=>a+o.content+o.users,0);
    // Small presences fold into the network's largest one: they would add routes and flows for a sliver of traffic.
    if(L.length>1&&tot>0){const big=L.reduce((a,o)=>o.content+o.users>a.content+a.users?o:a);
      for(const o of L)if(o!==big&&o.content+o.users<0.03*tot){big.content+=o.content;big.users+=o.users;(big.rs||(big.rs=[])).push(o.r);o.gone=1;}L=L.filter(o=>!o.gone);}
    if(!L.length){const c=pops[0]||home[0]||CITIES[0];L=[{r:c.rg,content:0,users:0,cs:[c]}];}
    ORIG_BY_NET[n.id]=L.map(o=>{const a=(pops.filter(c=>c.rg===o.r).sort((x,y)=>y.P-x.P)[0])||o.cs.sort((x,y)=>y.P-x.P)[0],rs=[o.r,...(o.rs||[])];
      // Where it serves from: its PoPs in the regions it stands for (srvOf() picks the one nearest each user).
      const sv=pops.filter(c=>rs.includes(c.rg)).map(c=>CIDX[c.id]);
      const x={i:ORIGINS.length,net:n.id,nj,reg:o.r,anchor:a.id,ci:CIDX[a.id],tz:a.tz,content:o.content,users:o.users,sv:sv.length?sv:[CIDX[a.id]]};ORIGINS.push(x);return x;});});})();
