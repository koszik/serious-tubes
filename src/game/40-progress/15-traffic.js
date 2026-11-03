/* Traffic classes (docs/specs/network-engine.md §3.3): who a kind of endpoint talks to, which way the bytes go and
   when. in/out are seen from your network per unit offered (the bigger one is 1); `who` says whose local hour drives
   the shape (e: the endpoint, o: the far end); pu is the share of a customer's port it fills at its peak; el: elastic
   (TCP backs off, so congestion shows as slowness); tol: the loss it shrugs off; dst: how far ends are picked. */
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
 home:{in:1,out:0.1,shape:'home',who:'e',pu:1,el:1,tol:0.02,dst:'server',nets:'all'},
 office:{in:1,out:0.33,shape:'office',who:'e',pu:0.6,el:1,tol:0.01,dst:'server',nets:'nonEye'},
 content:{in:0.12,out:1,shape:'evening',who:'o',pu:0.7,el:1,tol:0.02,dst:'audience'},
 stream:{in:0.05,out:1,shape:'evening',who:'o',pu:0.7,el:1,tol:0.02,dst:'audience'},
 gaming:{in:0.67,out:1,shape:'evening',who:'o',pu:0.6,el:0,tol:0.003,dst:'audience'},
 live:{in:0.3,out:1,shape:'evening',who:'e',pu:0.7,el:0,tol:0.005,dst:'audience'},
 training:{in:1,out:0.2,shape:'flat',who:'e',pu:0.9,el:1,tol:0.03,dst:'server',nets:'cdn'},
 fill:{in:1,out:0.02,shape:'fill',who:'e',pu:1,el:1,tol:0.05,dst:'server',nets:'own'},
 dci:{in:1,out:1,shape:'flat',who:'e',pu:0.9,el:0,tol:0.001,dst:'site'},
 backup:{in:0,out:1,shape:'night',who:'e',pu:0.95,el:1,tol:1,dst:'site',vol:1},
 enterprise:{in:0.5,out:1,shape:'office',who:'e',pu:0.5,el:0,tol:0.005,dst:'site'},
 special:{in:1,out:1,shape:'flat',who:'e',pu:0.5,el:0,tol:0.005,dst:'site'},
 junk:{in:1,out:0,shape:'flat',who:'e',pu:1,el:0,tol:1,dst:'none'},
};
const CLS_IDS=Object.keys(TRAFFIC);
// Every customer type's class (fiber leases carry no IP traffic and have none). Some types bend their class's shape.
const CLASS_OF={agi:'dci',ai:'dci',aiwan:'dci',bulk:'backup',capsub:'dci',capw:'dci',cgame:'content',dia:'office',edu:'office',esport:'live',event:'live',fabip:'office',
 fabl2:'enterprise',flex:'special',game:'gaming',gpu:'training',hft:'special',host:'content',hyper:'dci',ingest:'training',isp:'home',l2vpn:'enterprise',l3vpn:'enterprise',mars:'special',
 metav:'content',mtrain:'dci',onramp:'enterprise',provedor:'home',scrub:'office',sdwan:'enterprise',slice:'dci',sov:'dci',stream:'stream'};
const SHAPE_OF={hft:'market',hyper:'dci',slice:'dci'};
// A Mars ground station only talks during passes: three hours a day, fixed per station.
const MARS_SH=new Map();
function shapeOf(b){if(b.type==='mars'){const h=hstr(String(b.id))%24;let a=MARS_SH.get(h);if(!a)MARS_SH.set(h,a=SHAPE.flat.map((v,i)=>(i-h+24)%24<3?1:0));return a;}return SHAPE[SHAPE_OF[b.type]||TRAFFIC[CLASS_OF[b.type]].shape];}
