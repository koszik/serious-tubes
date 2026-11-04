/* Traffic classes (docs/specs/network-engine.md §3.3): who a kind of endpoint talks to, which way the bytes go and
   when. in/out are seen from your network per unit offered (the bigger one is 1); `who` says whose local hour drives
   the shape (e: the endpoint, o: the far end); pu is the share of a customer's port it fills at its peak; el: elastic
   (TCP backs off, so congestion shows as slowness); tol: the loss it shrugs off; dst: how far ends are picked (servers
   by DST_W, or the audience of users). */
const SHAPE={
 home:[.45,.35,.25,.18,.15,.15,.20,.30,.40,.45,.50,.55,.60,.60,.60,.62,.68,.75,.85,.95,1,1,.90,.65],
 evening:[.50,.40,.30,.20,.15,.12,.12,.15,.20,.25,.30,.35,.40,.40,.42,.45,.50,.60,.75,.90,1,1,1,.75],
 office:[.10,.08,.08,.08,.08,.10,.15,.35,.70,.90,1,1,.90,.95,1,.95,.85,.60,.35,.25,.20,.15,.12,.10],
 flat:Array(24).fill(1),
 night:[.3,1,1,1,1,1,.3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
 fill:[.6,.8,1,1,1,1,.8,.5,.3,.2,.2,.2,.2,.2,.2,.2,.2,.2,.2,.2,.2,.3,.4,.5],
};
SHAPE.dci=SHAPE.home.map(v=>0.7+0.3*v);SHAPE.market=SHAPE.flat.map((v,h)=>h>=9&&h<=17?1:0.05);
const TRAFFIC={
 home:{in:1,out:0.1,shape:'home',who:'e',pu:1,el:1,tol:0.02,dst:'server'},
 office:{in:1,out:0.33,shape:'office',who:'e',pu:0.6,el:1,tol:0.01,dst:'server'},
 content:{in:0.12,out:1,shape:'evening',who:'o',pu:0.7,el:1,tol:0.02,dst:'audience'},
 stream:{in:0.05,out:1,shape:'evening',who:'o',pu:0.7,el:1,tol:0.02,dst:'audience'},
 gaming:{in:0.67,out:1,shape:'evening',who:'o',pu:0.6,el:0,tol:0.003,dst:'audience'},
 live:{in:0.3,out:1,shape:'evening',who:'e',pu:0.7,el:0,tol:0.005,dst:'audience'},
 training:{in:1,out:0.2,shape:'flat',who:'e',pu:0.9,el:1,tol:0.03,dst:'server'},
 fill:{in:1,out:0.02,shape:'fill',who:'e',pu:1,el:1,tol:0.05,dst:'server'},
 dci:{in:1,out:1,shape:'flat',who:'e',pu:0.9,el:0,tol:0.001,dst:'site'},
 backup:{in:0,out:1,shape:'night',who:'e',pu:0.95,el:1,tol:1,dst:'site',vol:1},
 enterprise:{in:0.5,out:1,shape:'office',who:'e',pu:0.5,el:0,tol:0.005,dst:'site'},
 special:{in:1,out:1,shape:'flat',who:'e',pu:0.5,el:0,tol:0.005,dst:'site'},
 junk:{in:1,out:0,shape:'flat',who:'e',pu:1,el:0,tol:1,dst:'none'},
};
const CLS_IDS=Object.keys(TRAFFIC);
/* Whose servers each class fetches from, by kind of network: users stream from CDNs and clouds and browse sites on
   hosters; little lives on a carrier, and other ISPs' users (calls, games, a little P2P) are a sliver. Offices use SaaS in
   clouds and hosters; training pulls datasets from clouds and hosters, never from a video CDN. */
const DST_W={home:{cdn:1,cloud:1,host:1,t1:.08,t2:.08,eye:.05},office:{cloud:1,host:.8,cdn:.4,t1:.2,t2:.2},training:{cloud:1,host:.6}};
const netRole=n=>n.cloud?'cloud':n.type;
// A class's share of each network under a city's share table, summing to one. China's, Russia's and Korea's own tables
// already say where their users' traffic goes.
const DSTT=new Map();
function dstShares(cls,SH){let m=DSTT.get(SH);if(!m)DSTT.set(SH,m={});let a=m[cls];if(a)return a;const W=cls==='home'&&(SH===NSH_CN||SH===NSH_RU||SH===NSH_KR||SH===NSH_KRX)?null:DST_W[cls]||DST_W.home;
  a=new Float64Array(NETS.length);let t=0;NETS.forEach((n,j)=>{t+=a[j]=(SH[n.id]||0)*(W?W[netRole(n)]||0:1);});if(t>0)for(let j=0;j<a.length;j++)a[j]/=t;return m[cls]=a;}
// Every customer type's class (fiber leases carry no IP traffic and have none). Some types bend their class's shape.
const CLASS_OF={agi:'dci',ai:'dci',aiwan:'dci',bulk:'backup',capsub:'dci',capw:'dci',cgame:'content',dia:'office',edu:'office',esport:'live',event:'live',fabip:'office',
 fabl2:'enterprise',flex:'special',game:'gaming',gpu:'training',hft:'special',host:'content',hyper:'dci',ingest:'training',isp:'home',l2vpn:'enterprise',l3vpn:'enterprise',mars:'special',
 metav:'content',mtrain:'dci',onramp:'enterprise',provedor:'home',scrub:'office',sdwan:'enterprise',slice:'dci',sov:'dci',stream:'stream'};
const SHAPE_OF={hft:'market',hyper:'dci',slice:'dci'};
// A Mars ground station only talks during passes: three hours a day, fixed per station.
const MARS_SH=new Map();
function shapeOf(b){if(b.type==='mars'){const h=hstr(String(b.id))%24;let a=MARS_SH.get(h);if(!a)MARS_SH.set(h,a=SHAPE.flat.map((v,i)=>(i-h+24)%24<3?1:0));return a;}return SHAPE[SHAPE_OF[b.type]||TRAFFIC[CLASS_OF[b.type]].shape];}
