// BGP policy (47-bgp-panel.js): tags, rules, the priority queue, multipath and session switches. Every change goes
// through polSanitize(), the same gate a save does, so a click can never store what a save could not.
const polSet=f=>{if(!S||pzOn())return;const p=JSON.parse(JSON.stringify(S.pol||polEmpty()));if(f(p)===false)return;S.pol=polSanitize(p);after();routingRefresh();};
const polVal=(id,v)=>v!==undefined?v:$(id)?$(id).value:undefined;
Object.assign(ACT,{
 polTagAdd:({name}={})=>polSet(p=>{const nm=String(polVal('polTagName',name)||'').trim().toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,20);
   if(!nm||p.tags.some(t=>t.name===nm)){toast(tr('bgp.pick_a_new_tag_name'),'bad');return false;}let n=1;while(p.tags.some(t=>t.id==='t'+n))n++;p.tags.push({id:'t'+n,name:nm,v:100+n});}),
 polTagDel:({id})=>polSet(p=>{p.tags=p.tags.filter(t=>t.id!==id);delete p.on[id];p.rules=p.rules.filter(r=>r.m!==id);p.qos=p.qos.filter(q=>q.m!==id);}),
 polTagOn:({id,ref}={})=>polSet(p=>{ref=polVal('polOn_'+id,ref);if(!ref||!p.tags.some(t=>t.id===id))return false;const a=p.on[id]||(p.on[id]=[]);if(!a.includes(ref))a.push(ref);}),
 polTagOff:({id,ref})=>polSet(p=>{if(p.on[id])p.on[id]=p.on[id].filter(r=>r!==ref);}),
 polRuleAdd:({m,at,act,n}={})=>polSet(p=>{m=polVal('polM',m);at=polVal('polAt',at);act=polVal('polAct',act);n=+polVal('polN',n);const P=polPlace(at);
   if(!P||!POL_ACT[P.k].includes(act)){toast(tr('bgp.that_action_does_not_fit_there'),'bad');return false;}
   let k=1;while(p.rules.some(r=>r.id==='r'+k))k++;p.rules.push({id:'r'+k,m,at,act,n:act==='lp'?(Number.isFinite(n)?n:200):act==='prepend'?(Number.isFinite(n)?n:1):0});}),
 polRuleMove:({id,by})=>polSet(p=>{const i=p.rules.findIndex(r=>r.id===id),j=i+(by<0?-1:1);if(i<0||j<0||j>=p.rules.length)return false;const [r]=p.rules.splice(i,1);p.rules.splice(j,0,r);}),
 polRuleDel:({id})=>polSet(p=>{p.rules=p.rules.filter(r=>r.id!==id);}),
 polQosAdd:({m}={})=>polSet(p=>{m=polVal('polQ',m);if(!m||p.qos.some(q=>q.m===m))return false;p.qos.push({m});}),
 polQosDel:({i})=>polSet(p=>{p.qos.splice(i,1);}),
 polMp:({city,on})=>polSet(p=>{const cs=city==='*'?Object.keys(S.pops):[city];for(const c of cs)if(on)p.mp[c]=1;else delete p.mp[c];}),
});
