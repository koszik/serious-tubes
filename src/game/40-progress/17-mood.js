/* ---------- a customer's daily mood ----------
   The one place the day's happiness change is worked out (88-days/10-day-tick.js applies it, 95-modals/67-mood-why.js
   explains it): every test passes and it gains 2; otherwise each failing test costs its points, eased by FRR during a
   cut and by the patient-moods rule, and nothing moves while it is still being provisioned. */
const moodEase=()=>(coreFrr()&&S.links.some(l=>l.cut)?.5:1)*(rule('moods')==='patient'?.5:1);
function moodParts(b,d=S.day,ids=linkIds(),ease=moodEase()){const T=BIZ_T[b.type],sf=bizSf(b,ids),tol=latTol(b.type),lag=rtqPain(b);
  const parts=[
    {k:'sf',ok:sf>=0.95,pen:Math.max(0,0.95-sf)*45,sf},
    {k:'reach',ok:T.l2||T.fiber||R.reach>0.99||scnRule('local'),pen:3},
    {k:'scrub',ok:b.type!=='scrub'||(hasScrub()&&!scrubFar(b.city)),pen:4,on:b.type==='scrub'},
    {k:'reqs',ok:reqOk(b)||b.rqG>d,pen:3,on:!!(b.reqs&&b.reqs.length)},
    {k:'lag',ok:!rtqBad(b),pen:tol?Math.min(3,lag/tol):0,on:tol>0,lag,tol,slow:rtqSlow(b)}];
  const ok=parts.every(p=>p.ok),grace=!ok&&inGrace(b),pen=parts.reduce((a,p)=>a+(p.ok?0:p.pen),0)*ease;
  return {parts,ok,grace,ease,delta:ok?Math.min(2,100-b.mood):grace?0:-pen};}
