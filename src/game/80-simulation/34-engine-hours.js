/* The data plane (docs/specs/network-engine.md §7): 24 hours, each offered to the pipes. A pipe that is offered more
   than it holds drops the excess (and a little more above 85%: an hour's average hides its bursts). The priority queue,
   when QoS names a class, is served first. A CDN moves what does not fit onto its next way in. Floods ride the same
   pipes: their junk is offered at your ports and hauled to the target like any traffic. */
function engHours(X){const {E,NX,NE,R2,EP,F,L,FLAT}=X,NP=2*NE+2*NX,NF=F.v.length,NPOP=X.POPC.length;X.NP=NP;X.NF=NF;
  // Floods (25-ddos-flood.js): junk offered at the ports, then hauled to the target over the backbone.
  const J=new Float64Array(NX),hauls=[];
  const haul=(A,B,g,ek,from,clean)=>{if(!(g>0))return 0;const Ai=CIDX[A],Bi=CIDX[B];if(!X.SPD[B]||!(X.SPD[B][Ai]<Infinity))return 0;
    if(!R2.egDesc[ek])R2.egDesc[ek]={lab:clean?labOf(N_('compute.scrubbed_traffic_from_city'),'city',CITY[A].name):labOf(N_('compute.attack_entering_in_city'),'city',CITY[from].name),city:B,k:'l2'};
    hauls.push([X.pathList(walkI(X.SPP[B],Bi,Ai),false),g,clean?0:1,ek]);return g;};
  const msOf=(A,B)=>{const Bi=CIDX[B],Ai=CIDX[A];return X.SPD[B]&&X.SPD[B][Ai]<Infinity?walkI(X.SPP[B],Bi,Ai).path.reduce((n,e)=>n+e.lat,0):0;};
  X.DD=ddosLoad({E,okBy:X.okBy,R2,autoBh:!!(X.TRX&&X.TRX.blackhole),haul,ms:msOf});
  for(let x=0;x<NX;x++)J[x]=E[x].J||0;
  // Pipe capacities: an edge holds the sum of its links both ways, a port its size each way.
  const CAP=new Float64Array(NP);for(const e of X.EA){CAP[2*e.i]=e.cap;CAP[2*e.i+1]=e.cap;}for(let x=0;x<NX;x++){CAP[2*NE+2*x]=E[x].cap;CAP[2*NE+2*x+1]=E[x].cap;}
  const NCAP=new Float64Array(NPOP);for(let k=0;k<NPOP;k++)NCAP[k]=nodeCap(X.POPC[k]);
  const LP=Int32Array.from(L.LP),LS=Float64Array.from(L.LS),LB=Uint8Array.from(L.LB),LOFF=Int32Array.from(L.LOFF),LN=Int32Array.from(L.LN),LW=Float64Array.from(L.LW),LNOFF=Int32Array.from(L.LNOFF),LX=Int32Array.from(L.LX);
  // Flow columns.
  const FV=Float64Array.from(F.v),FI=Float64Array.from(F.fi),FO=Float64Array.from(F.fo),FTZ=Float64Array.from(F.tz),FG=Float64Array.from(F.g);
  const FSH=Int32Array.from(F.sh),FQ=Uint8Array.from(F.q),FCD=Uint8Array.from(F.cdn),FIN=new Int32Array(NF*3),FOUT=Int32Array.from(F.out);
  for(let f=0;f<NF;f++)for(let k=0;k<3;k++)FIN[f*3+k]=F.in[f][k];
  // Auto-TE: second paths per list (moved onto when a link on the first runs over the spill mark), and each capped
  // upstream's flows with the route they fall back to.
  const NL0=LOFF.length-1,LALT=new Int32Array(NL0).fill(-1);for(let id=0;id<NL0;id++)if(X.LALT&&X.LALT[id]!==undefined)LALT[id]=X.LALT[id];
  const TEON=!!(S.te&&S.te.on)&&coreTE()||FLAT,SPILL=TEON?(X.TRX&&X.TRX.spill||1):0,LM=new Float64Array(NL0);
  const CAPS=TEON&&X.TRX?Object.keys(X.TRX.cap):[],CAPI=new Map(CAPS.map((n,i)=>[n,i])),FCAP=new Int32Array(NF).fill(-1),FOA=new Int32Array(NF).fill(-1);
  for(let f=0;f<NF;f++){const c=F.cap[f];if(c!==null&&CAPI.has(c)){FCAP[f]=CAPI.get(c);FOA[f]=F.oalt[f];}}
  const CAPG=Float64Array.from(CAPS.map(n=>X.TRX.cap[n])),CAPT=new Float64Array(CAPS.length),WO=new Float64Array(NF).fill(1),WA=new Float64Array(NF);let moved=0;
  const HN=hauls.length,HL=new Int32Array(HN),HV=new Float64Array(HN);for(let i=0;i<HN;i++){HL[i]=hauls[i][0];HV[i]=hauls[i][1];}
  const SHL=X.SHL,NEP=EP.length;
  // What the day keeps: per pipe and hour offered and loss, per router and hour offered, per endpoint and hour offered and
  // delivered (both directions added), and the network's traffic (the bigger direction of each flow, IP endpoints only).
  const OFFH=new Float64Array(24*NP),LOSSH=new Float64Array(24*NP),NOH=new Float64Array(24*NPOP),EPO=new Float64Array(24*NEP),EPR=new Float64Array(24*NEP),EPD=new Float64Array(24*NEP),EPN=new Float64Array(24*NEP),TD=new Float64Array(24),TS=new Float64Array(24),TL2=new Float64Array(24);
  const EPK=new Uint8Array(NEP);for(let i=0;i<NEP;i++)EPK[i]=EP[i].k==='pop'||EP[i].k==='grp'?1:EP[i].k==='l2'?2:0;
  const FEP=Int32Array.from(F.ep);
  const VI=new Float64Array(NF),VO=new Float64Array(NF),WC=new Float64Array(NF*3),DI=new Float64Array(NF),DO=new Float64Array(NF);
  const NL_=LOFF.length-1,LVT=new Float64Array(NL_),LVQ=new Float64Array(NL_),LV0=new Float64Array(NL_),LQ0=new Float64Array(NL_),MV=new Float64Array(2*NE+2*NX),RB=new Float64Array(NL_),RQ=new Float64Array(NL_);
  const OF=new Float64Array(NP),OQ=new Float64Array(NP),L1=new Float64Array(2*NP),OJ=new Float64Array(NP),LJ=new Float64Array(NP),NO=new Float64Array(NPOP),NOQ=new Float64Array(NPOP),NOJ=new Float64Array(NPOP),NL=new Float64Array(NPOP),NLQ=new Float64Array(NPOP),RX=new Float64Array(NX),RC=new Float64Array(NX),KEEP=new Float64Array(NX);
  // Each flow's day as one of a few curves (a shape seen from one timezone), hour by hour.
  const CK=new Map(),CV0=[],FCV=new Int32Array(NF);for(let f=0;f<NF;f++){const k=FSH[f]*100+FTZ[f];let c=CK.get(k);if(c===undefined){c=CK.size;CK.set(k,c);const a=SHL[FSH[f]];for(let h=0;h<24;h++)CV0.push(a[locH(h,FTZ[f])]);}FCV[f]=c*24;}
  const CV=Float64Array.from(CV0);
  // Each list carries the volume of every flow on it; the pipes see the lists, not the flows.
  /* Three queues: a flood's junk takes what it can first (it does not back off, so it starves the traffic that does),
     then the priority queue QoS names, then best effort. */
  const offerAll=att=>{OF.fill(0);OQ.fill(0);OJ.fill(0);NO.fill(0);NOQ.fill(0);NOJ.fill(0);
    for(let x=0;x<NX;x++)OJ[2*NE+2*x]=J[x];
    for(let i=0;i<HN;i++){const id=HL[i];let a=HV[i];for(let k=LOFF[id],e=LOFF[id+1];k<e;k++){const p=LP[k];OJ[p]+=a;if(att)a*=1-LJ[p];}for(let k=LNOFF[id],e=LNOFF[id+1];k<e;k++)NOJ[LN[k]]+=HV[i];}
    for(let id=0;id<NL_;id++){const vt=LVT[id];if(!(vt>0))continue;const vq=LVQ[id],vb=vt-vq;let ab=vb,aq=vq;const s0=LOFF[id],s1=LOFF[id+1];
      // A router forwards what reaches it: on the second pass, what is left of the list's traffic after its pipes.
      let sb=1,sq=1;
      if(att){let tb=0,tq=0,on=false;for(let k=s0;k<s1;k++){if(LB[k]===1){if(on){tb+=ab;tq+=aq;}ab=vb*LS[k];aq=vq*LS[k];on=true;}const p=LP[k],p2=p*2;OF[p]+=ab+aq;OQ[p]+=aq;ab*=1-L1[p2];aq*=1-L1[p2+1];}
        if(on){tb+=ab;tq+=aq;}else{tb=vb;tq=vq;}sb=vb>0?tb/vb:1;sq=vq>0?tq/vq:1;}
      else for(let k=s0;k<s1;k++){if(LB[k]===1){ab=vb*LS[k];aq=vq*LS[k];}const p=LP[k];OF[p]+=ab+aq;OQ[p]+=aq;}
      for(let k=LNOFF[id],e=LNOFF[id+1];k<e;k++){NO[LN[k]]+=(vb*sb+vq*sq)*LW[k];NOQ[LN[k]]+=vq*sq*LW[k];}}
    for(let p=0;p<NP;p++)OF[p]+=OJ[p];
    let lossy=false;
    for(let p=0;p<NP;p++){const O=OF[p],p2=2*p;if(O<=0){L1[p2]=0;L1[p2+1]=0;LJ[p]=0;continue;}const C=CAP[p];if(!(C>0)){L1[p2]=1;L1[p2+1]=1;LJ[p]=1;lossy=true;continue;}
      // Bursts cost a little before a pipe is full; once it is, it drops the excess and still carries all it holds.
      const u=O/C;if(u<=0.85){L1[p2]=0;L1[p2+1]=0;LJ[p]=0;continue;}const Oj=OJ[p],lj=Oj>C?1-C/Oj:0,Cr=C-Oj*(1-lj),Q=OQ[p],b=u<1&&!FLAT?0.002*(u-0.85)**2/0.0225:0;
      const lq=Q>Cr?1-(Cr>0?Cr:0)/Q:0,cb=Cr-Q*(1-lq),ob=O-Oj-Q,lb=ob>cb?1-(cb>0?cb:0)/ob:0;
      L1[p2]=lb>b?lb:b;L1[p2+1]=lq>b?lq:b;LJ[p]=lj>b?lj:b;lossy=true;}
    // Routers too serve the junk, then the priority queue, first.
    for(let k=0;k<NPOP;k++){const Oj=NOJ[k],O=NO[k]+Oj,Q=NOQ[k],C=NCAP[k];if(!(O>C&&C>0)){NL[k]=0;NLQ[k]=0;continue;}const Cr=Math.max(0,C-Math.min(Oj,C)),lq=Q>Cr?1-Cr/Q:0,cb=Cr-Q*(1-lq),ob=O-Oj-Q;NLQ[k]=lq;NL[k]=ob>cb?1-(cb>0?cb:0)/ob:0;lossy=true;}return lossy;};
  // What share of a list's volume arrives, best effort and priority: branch by branch, then through its routers.
  const ratios=()=>{for(let id=0;id<NL_;id++){if(!(LVT[id]>0))continue;let tb=0,tq=0,ab=0,aq=0;
      for(let k=LOFF[id],e=LOFF[id+1];k<e;k++){if(LB[k]===1){tb+=ab;tq+=aq;ab=LS[k];aq=ab;}const p2=LP[k]*2;ab*=1-L1[p2];aq*=1-L1[p2+1];}
      tb+=ab;tq+=aq;let nf=1,nq=1;for(let k=LNOFF[id],e=LNOFF[id+1];k<e;k++){nf*=1-NL[LN[k]];nq*=1-NLQ[LN[k]];}RB[id]=tb*nf;RQ[id]=tq*nq;}};
  const hour=h=>{
    for(let f=0;f<NF;f++){const s=CV[FCV[f]+h];VI[f]=FV[f]*FI[f]*s;VO[f]=FV[f]*FO[f]*s;WC[f*3]=1;WC[f*3+1]=0;WC[f*3+2]=0;}
    // CDN egress engineering: fill your port to 95%, the rest takes its next way in (two rounds).
    for(let r=0;r<2;r++){RX.fill(0);RC.fill(0);
      for(let f=0;f<NF;f++){const v=VI[f];if(!(v>0))continue;for(let k=0;k<3;k++){const id=FIN[f*3+k];if(id<0||WC[f*3+k]<=0)continue;const x=LX[id];if(x<0)continue;if(FCD[f])RC[x]+=v*WC[f*3+k];else RX[x]+=v*WC[f*3+k];}}
      let any=false;for(let x=0;x<NX;x++){const C=E[x].cap*SPILL_CDN,o=RX[x]+RC[x]+J[x];KEEP[x]=1;if(RC[x]>0&&o>C){KEEP[x]=Math.max(0,C-RX[x]-J[x])/RC[x];any=true;}}
      if(!any)break;
      for(let f=0;f<NF;f++){if(!FCD[f])continue;for(let k=r;k<2;k++){const id=FIN[f*3+k],nx=FIN[f*3+k+1];if(id<0||nx<0||WC[f*3+k]<=0)continue;const kp=KEEP[LX[id]];if(kp<1){const m=WC[f*3+k]*(1-kp);WC[f*3+k]-=m;WC[f*3+k+1]+=m;}break;}}}
    // A capped upstream takes up to its cap; the rest falls back to the route without it (or is not sent).
    if(CAPS.length){CAPT.fill(0);for(let f=0;f<NF;f++)if(FCAP[f]>=0)CAPT[FCAP[f]]+=VO[f];
      for(let f=0;f<NF;f++){const k=FCAP[f];if(k<0)continue;const t=CAPT[k],fr=t>CAPG[k]?1-CAPG[k]/t:0;WO[f]=1-fr;WA[f]=FOA[f]>=0?fr:0;}}
    LVT.fill(0);LVQ.fill(0);LM.fill(0);moved=0;
    for(let f=0;f<NF;f++){const q=FQ[f],vi=VI[f],vo=VO[f];if(vi>0)for(let k=0;k<3;k++){const id=FIN[f*3+k],w=WC[f*3+k];if(id>=0&&w>0){LVT[id]+=vi*w;if(q)LVQ[id]+=vi*w;}}
      const o=FOUT[f];if(vo>0&&o>=0){LVT[o]+=vo*WO[f];if(q)LVQ[o]+=vo*WO[f];const a=FOA[f];if(a>=0&&WA[f]>0){LVT[a]+=vo*WA[f];if(q)LVQ[a]+=vo*WA[f];}}}
    // Two passes when anything is lost: the second offers each pipe only what survived the pipes before it.
    let lossy=offerAll(false);
    // Auto-TE: a path with a link over the spill mark moves what is over it onto its second path; a few rounds, so the
    // paths that can move take up what those that cannot leave behind.
    if(SPILL&&lossy||SPILL&&SPILL<1){LV0.set(LVT);LQ0.set(LVQ);
      for(let r=0;r<3;r++){let any=false;MV.fill(0);
        // What could move off each link: the traffic on it of every path that has a second one.
        for(let id=0;id<NL0;id++){if(LALT[id]<0||!(LVT[id]>0)||LM[id]>=1)continue;for(let k=LOFF[id],e=LOFF[id+1];k<e;k++){const p=LP[k];if(p<2*NE)MV[p]+=LVT[id]*LS[k];}}
        for(let id=0;id<NL0;id++){const a=LALT[id],v0=LV0[id];if(a<0||!(v0>0)||LM[id]>=1)continue;let f=0;
          for(let k=LOFF[id],e=LOFF[id+1];k<e;k++){const p=LP[k];if(p<2*NE&&MV[p]>0){const x=(OF[p]-SPILL*CAP[p])/MV[p];if(x>f)f=x;}}
          if(f>1e-9){const dm=Math.min(1,f)*(1-LM[id]);LM[id]+=dm;LVT[a]+=v0*dm;LVQ[a]+=LQ0[id]*dm;LVT[id]=v0*(1-LM[id]);LVQ[id]=LQ0[id]*(1-LM[id]);moved+=v0*dm;any=true;}}
        if(!any)break;lossy=offerAll(false);}}
    if(lossy)offerAll(true);
    if(!lossy){RB.fill(1);RQ.fill(1);}else ratios();
    // A list's share that arrives, counting what Auto-TE moved onto its second path.
    const rr=(R_,id)=>{const m=LM[id];return m>0?(1-m)*R_[id]+m*R_[LALT[id]]:R_[id];};
    for(let f=0;f<NF;f++){const R_=FQ[f]?RQ:RB;let di=0;const vi=VI[f],vo=VO[f];if(vi>0)for(let k=0;k<3;k++){const id=FIN[f*3+k],w=WC[f*3+k];if(id>=0&&w>0)di+=vi*w*rr(R_,id);}
      const o=FOUT[f],g=1-FG[f];let dO=0;if(vo>0&&o>=0){dO=vo*WO[f]*rr(R_,o);const a=FOA[f];if(a>=0&&WA[f]>0)dO+=vo*WA[f]*rr(R_,a);}
      // Both ways or not at all: a session that loses its requests (or its replies) loses the rest with them.
      if(vi>0&&vo>0){const r=Math.min(di/vi,dO/vo);di=vi*r;dO=vo*r;}
      DI[f]=di*g;DO[f]=dO*g;}};
  const record=h=>{const b=h*NP;for(let p=0;p<NP;p++){const O=OF[p];OFFH[b+p]=O;LOSSH[b+p]=O>0?((O-OQ[p]-OJ[p])*L1[2*p]+OQ[p]*L1[2*p+1]+OJ[p]*LJ[p])/O:0;}
    for(let k=0;k<NPOP;k++)NOH[h*NPOP+k]=NO[k]+NOJ[k];let td=0,ts=0,tl=0;const eb=h*NEP;
    for(let f=0;f<NF;f++){const i=FEP[f],vi=VI[f],vo=VO[f],di=DI[f],dO=DO[f];EPO[eb+i]+=vi+vo;EPD[eb+i]+=di+dO;if(FIN[f*3]>=0||FOUT[f]>=0){EPR[eb+i]+=(FIN[f*3]>=0?vi:0)+(FOUT[f]>=0?vo:0);EPN[eb+i]+=(di+dO)/(1-FG[f]);}const t=EPK[i];if(t===1){td+=vi>vo?vi:vo;ts+=di>dO?di:dO;}else if(t===2)tl+=di>dO?di:dO;}
    TD[h]=td;TS[h]=ts;TL2[h]=tl;};
  for(let h=0;h<24;h++){hour(h);record(h);}
  // The day's peak hour (most asked for); its flows are worked out again for the reports.
  let hp=0;for(let h=1;h<24;h++)if(TD[h]>TD[hp]+1e-9||TD[hp]<=1e-9&&TL2[h]>TL2[hp])hp=h;hour(hp);X.teMoved=moved;
  X.hauls=hauls;Object.assign(X,{CV,FCV,hp,CAP,NCAP,OFFH,LOSSH,NOH,EPO,EPR,EPD,EPN,TD,TS,TL2,J,FV,FI,FO,FTZ,FSH,FIN,FOUT,FEP,VI:VI.slice(),VO:VO.slice(),DI:DI.slice(),DO:DO.slice(),WC:WC.slice(),L1:L1.slice(),NL:NL.slice()});}
