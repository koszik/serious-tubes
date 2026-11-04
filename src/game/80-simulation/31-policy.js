/* Routing policy (docs/specs/network-engine.md §4, §6.2–6.4, §6.8): the player's tags, rules, QoS and router switches
   (S.pol), plus what a live RouteScript compiles to. All of it is plain data: matching never runs player code.
   A rule is {m: a tag id, an automatic community or a list of them (all must hold), at: a place, act, n}. */
const POL_LIM={tags:32,refs:64,rules:512,qos:8};
const POL_ACT={in:['lp','deny'],out:['noexp','prepend','regonly','blackhole'],l:['nocarry'],pop:['lp','deny']};
const polEmpty=()=>({tags:[],on:{},rules:[],qos:[],mp:{}});
// An exit's ref, as tags and places name it.
const exRef=e=>(e.k==='t'?'t:':e.k==='p'?'p:':e.k==='ix'?'ix:':'c:')+e.id;
// A place: x:<ref>:in|out (ref may be *), l:<a|b>, pop:<city>, pop:*.
function polPlace(at){if(typeof at!=='string')return null;let m;
  if(m=at.match(/^x:(\*|(?:t|p|ix|c):[^:]+):(in|out)$/))return {k:m[2],ref:m[1]};
  if(m=at.match(/^l:([a-z0-9]+\|[a-z0-9]+)$/))return {k:'l',key:m[1]};
  if(m=at.match(/^pop:(\*|[a-z0-9]+)$/))return {k:'pop',city:m[1]};
  return null;}
// Automatic communities, from the kind of exit a route was learned on.
const FROM_K={t:'from:transit',p:'from:pni',ix:'from:ix',c:'from:cache'};
const K_FROM={p:'p',pni:'p',ix:'ix',t:'t',transit:'t'};
/* Today's rules, compiled once per change: RouteScript first (a deployed controller has the last word), then S.pol.
   imp/exp: exit ref (or *) -> rules there; link: edge key -> rules; pop: city (or *) -> rules. */
let POL_C={key:null,c:null};
function polKey(){const TR=teRules();return JSON.stringify(S.pol||null)+'|'+(TR?S.te.script:'');}
function polCompile(){const k=polKey();if(POL_C.key===k)return POL_C.c;
  const pol=S.pol||polEmpty(),TR=teRules(),L=[];
  if(TR){for(const n in TR.net){const o=TR.net[n];if(o.prefer)L.push({m:[FROM_K[o.prefer],'net:'+n],at:'x:*:in',act:'lp',n:400});if(o.avoid)L.push({m:[FROM_K[o.avoid],'net:'+n],at:'x:*:in',act:'lp',n:10});}
    for(const t of S.transit){const u=TR.up[t.net],p=TR.prep[t.net];if(u)L.push({m:'*',at:'x:t:'+t.id+':in',act:'lp',n:u==='prefer'?150:60});if(p)L.push({m:'*',at:'x:t:'+t.id+':out',act:'prepend',n:p});}
    // Draining a POP: nothing leaves through its exits, and nothing is announced there (caches still serve).
    for(const c of TR.drain){const refs=S.transit.filter(t=>t.city===c).map(t=>'t:'+t.id).concat(S.pni.filter(p=>p.city===c).map(p=>'p:'+p.id),Object.keys(S.ixp).filter(x=>ixCity(x)===c).map(x=>'ix:'+x));
      for(const r of refs){L.push({m:'*',at:'x:'+r+':in',act:'lp',n:1});L.push({m:'*',at:'x:'+r+':out',act:'noexp'});}}}
  for(const r of pol.rules)L.push(r);
  const c={imp:new Map(),exp:new Map(),link:new Map(),pop:new Map(),any:L.length>0,reg:false,expAny:false,popAny:false,linkAny:false,
    tagOn:new Map(),qos:(pol.qos||[]).map(q=>q.m).concat(TR&&TR.protect?['biz']:[]),mp:pol.mp||{}};
  const add=(M,k,r)=>{const a=M.get(k);if(a)a.push(r);else M.set(k,[r]);};
  for(const r of L){const P=polPlace(r.at);if(!P||!POL_ACT[P.k].includes(r.act))continue;const x={m:[].concat(r.m),act:r.act,n:+r.n||0};
    if(x.m.some(m=>m.startsWith('region:')))c.reg=true;
    if(P.k==='in')add(c.imp,P.ref,x);else if(P.k==='out'){add(c.exp,P.ref,x);c.expAny=true;}else if(P.k==='l'){add(c.link,P.key,x);c.linkAny=true;}else{add(c.pop,P.city,x);c.popAny=true;}}
  for(const t of pol.tags||[])for(const ref of (pol.on||{})[t.id]||[])add(c.tagOn,ref,t.id);
  POL_C={key:k,c};return c;}
const polTags=(c,ref)=>c.tagOn.get(ref)||null;
// Does rule r match? has(key) answers for one community.
const polHit=(r,has)=>{for(const k of r.m)if(k!=='*'&&!has(k))return false;return true;};
// The rules at one place, specific ones and then the * ones, in list order.
const polAt=(M,ref)=>{const a=M.get(ref),b=M.get('*');return a&&b?a.concat(b):a||b||null;};
// A route learned at exit e toward origin o: does it carry community k?
function routeHas(c,e,o,cone){const tg=polTags(c,exRef(e)),fk=FROM_K[e.k],nk=o.netK||(o.netK='net:'+o.net),rk=o.regK||(o.regK='region:'+o.reg),ak=e.atK||(e.atK='at:'+e.city),ark=e.atrK||(e.atrK='at-region:'+CITY[e.city].rg);
  return k=>k===fk||(cone&&k==='cone')||k===nk||k===rk||k===ak||k===ark||(!!tg&&tg.includes(k));}
// Your prefixes at an endpoint: its POP, class and customers, and the tags on them.
function prefixHas(c,P){const tg=[...(polTags(c,'pop:'+P.city)||[])];for(const id of P.members||[])for(const t of polTags(c,'b:'+id)||[])tg.push(t);
  return k=>k==='pop:'+P.city||k==='pop-region:'+CITY[P.city].rg||k==='class:'+P.cls||(k==='biz'&&P.cls!=='home')||(k.startsWith('cust:')&&(P.members||[]).includes(k.slice(5)))||tg.includes(k);}
// Import at exit e: local-pref (base from the exit's own preference) or null when denied.
function polImport(c,e,has){let lp=e.pref==='high'?150:e.pref==='low'?20:100;const rs=polAt(c.imp,exRef(e));
  if(rs)for(const r of rs)if(polHit(r,has)){if(r.act==='deny')return null;lp=r.n;break;}return lp;}
// Export of a prefix at exit e: {no, prep, reg, bh}. A port set to Backup only is announced with a long AS path too.
function polExport(c,e,has){const o={no:false,prep:e.pref==='low'?3:0,reg:false,bh:false},rs=polAt(c.exp,exRef(e));
  if(rs)for(const r of rs)if(polHit(r,has)){if(r.act==='noexp')o.no=true;else if(r.act==='prepend')o.prep=Math.min(3,o.prep+r.n);else if(r.act==='regonly')o.reg=true;else o.bh=true;}return o;}
// QoS: does an endpoint's traffic ride the priority queue?
const polQos=(c,has)=>c.qos.some(m=>polHit({m:[].concat(m)},has));
// The links a route may not cross (sorted edge keys), from `nocarry` rules.
function polNoCarry(c,has){if(!c.linkAny)return '';const out=[];for(const [k,rs] of c.link)for(const r of rs)if(r.act==='nocarry'&&polHit(r,has)){out.push(k);break;}return out.sort().join(',');}
/* A port's own preference is a rule like any other (docs/specs/network-engine.md §6.2): local-pref for everything at
   x:<ref>:in, and for Backup also three prepends at x:<ref>:out. The panels' Prefer / Normal / Backup buttons write
   those rules and read them back, so they and the Routing window are one setting: above 100 is preferred, below is
   backup, and the panels show the number. */
const portRule=(pol,ref,dir,act)=>(pol.rules||[]).find(r=>r.m==='*'&&r.at==='x:'+ref+':'+dir&&r.act===act);
function portPref(ref,pol=S.pol){const r=pol?portRule(pol,ref,'in','lp'):null,lp=r?r.n:100,prep=pol?portRule(pol,ref,'out','prepend'):null;
  return {lp,v:lp>100?'high':lp<100?'low':'normal',prep:prep?prep.n:0,set:!!r};}
const exPref=(k,id)=>portPref((k==='t'?'t:':k==='p'?'p:':k==='ix'?'ix:':'c:')+id).v;
// Prefer lands above, Backup below, what the network's own rules for every port give, so it wins whatever they say.
function portPrefN(pol,v){let hi=100,lo=100;for(const r of pol.rules||[])if(r.act==='lp'&&r.at==='x:*:in'){if(r.n>hi)hi=r.n;if(r.n<lo)lo=r.n;}
  return v==='high'?Math.min(1000,Math.max(150,hi+50)):Math.max(0,Math.min(20,lo-10));}
function polSetPort(pol,ref,v,n){const rid=()=>{let i=1;while(pol.rules.some(r=>r.id==='r'+i))i++;return 'r'+i;};
  const put=(dir,act,val)=>{let r=portRule(pol,ref,dir,act);if(val===null){if(r)pol.rules=pol.rules.filter(x=>x!==r);return;}
    if(r)r.n=val;else pol.rules.push({id:rid(),m:'*',at:'x:'+ref+':'+dir,act,n:val});};
  if(v==='normal'){put('in','lp',null);put('out','prepend',null);return;}
  put('in','lp',Number.isFinite(n)?Math.max(0,Math.min(1000,Math.round(n))):portPrefN(pol,v));put('out','prepend',v==='low'?3:null);}
// Untrusted: keep only what the engine understands, within its limits.
function polSanitize(p){const o=polEmpty();if(!p||typeof p!=='object')return o;
  const nm=s=>typeof s==='string'&&/^[a-z0-9-]{1,20}$/.test(s);
  if(Array.isArray(p.tags))for(const t of p.tags)if(o.tags.length<POL_LIM.tags&&t&&typeof t.id==='string'&&/^t\d{1,4}$/.test(t.id)&&nm(t.name)&&!o.tags.some(x=>x.id===t.id))o.tags.push({id:t.id,name:t.name,v:int(t.v,1,65535,100)});
  const ids=new Set(o.tags.map(t=>t.id)),refOk=r=>typeof r==='string'&&/^(t|p|ix|c|pop|b):[A-Za-z0-9_~-]{1,40}$/.test(r);
  if(p.on&&typeof p.on==='object')for(const id of ids){const a=p.on[id];if(Array.isArray(a))o.on[id]=[...new Set(a.filter(refOk))].slice(0,POL_LIM.refs);}
  const mOk=m=>typeof m==='string'&&(ids.has(m)||m==='*'||m==='cone'||m==='biz'||/^(from:(transit|pni|ix|cache)|net:[a-z0-9]+|region:[a-z-]+|at:[a-z0-9]+|at-region:[a-z-]+|pop:[a-z0-9]+|pop-region:[a-z-]+|class:[a-z]+|cust:[A-Za-z0-9_-]{1,40})$/.test(m));
  if(Array.isArray(p.rules))for(const r of p.rules){if(o.rules.length>=POL_LIM.rules)break;if(!r||!mOk(r.m))continue;const P=polPlace(r.at);if(!P||!POL_ACT[P.k].includes(r.act))continue;
    o.rules.push({id:typeof r.id==='string'&&/^r\d{1,5}$/.test(r.id)?r.id:'r'+(o.rules.length+1),m:r.m,at:r.at,act:r.act,n:r.act==='lp'?int(r.n,0,1000,100):r.act==='prepend'?int(r.n,1,3,1):0});}
  if(Array.isArray(p.qos))for(const q of p.qos)if(o.qos.length<POL_LIM.qos&&q&&mOk(q.m))o.qos.push({m:q.m});
  if(p.mp&&typeof p.mp==='object')for(const c of Object.keys(p.mp))if(isCity(c)&&p.mp[c])o.mp[c]=1;
  return o;}
