/* ---------- traffic grows, prices fall ----------
   Every home uses a bit more internet each year (busy-hour traffic per subscriber grows about 15% a year) while what
   it pays stays the same, so a Gbps of broadband pays less every year. Transit and exchange ports get about 15%
   cheaper a year too, so carrying the growth stays affordable; the work is in the capacity. One clock drives both,
   started at 0 in a new game and on the loading day for a save from before it (S.trafD0). */
const TRAF_Y=1.15,TRANSIT_ERO=0.85,TRANSIT_FLOOR=0.2,ACCESS=0.55;
const trafY=()=>S?Math.max(0,(S.day-(S.trafD0||0))/365):0;
const trafG=()=>Math.pow(TRAF_Y,trafY());
const transitEro=()=>Math.max(TRANSIT_FLOOR,Math.pow(TRANSIT_ERO,trafY()));
// What a Gbps of broadband pays in city c today.
const eyeRate=c=>EYE_RATE*arpuOf(c)/trafG();
// The access network (last mile, home routers, support, billing) costs a share of what subscribers pay, served or not;
// Australia's homes run on the wholesale network, which charges for the same thing.
// Korea's homes are mostly apartment blocks wired from the basement, the cheapest access network to run anywhere.
const KR_ACCESS=0.2,accessOf=c=>CITY[c].au?0:CITY[c].kr?KR_ACCESS:ACCESS;
const accessMo=(R2)=>{let a=0;for(const c in S.pops)a+=(R2.cityEye[c]||0)*eyeRate(c)*accessOf(c);return a;};
// A transit port's monthly fee today.
const tmoOf=i=>Math.round(PORT[i].tmo*transitEro());
