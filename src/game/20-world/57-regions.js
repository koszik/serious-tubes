/* Regions and timezones (docs/specs/network-engine.md §3.1). A network's origins are one per region, and every
   flow's daily shape runs on the initiator's local hour. Timezones follow longitude, except where a country keeps
   one civil time (China) or sits far from its meridian (Spain, India). */
const REGIONS=['af-north','af-south','ap-east','ap-southeast','ca','cn','eu-central','eu-east','eu-north','eu-west','in','jp-kr','latam-north','latam-south','me','oceania','us-central','us-east','us-west'];
const REG_CC={
 AE:'me',AG:'latam-north',AO:'af-south',AR:'latam-south',AS:'oceania',AT:'eu-central',AU:'oceania',BB:'latam-north',BD:'in',BE:'eu-west',
 BG:'eu-east',BM:'latam-north',BO:'latam-south',BR:'latam-south',BS:'latam-north',BW:'af-south',BZ:'latam-north',CA:'ca',CD:'af-south',CH:'eu-central',
 CI:'af-south',CL:'latam-south',CM:'af-south',CN:'cn',CO:'latam-south',CR:'latam-north',CU:'latam-north',CV:'af-south',CW:'latam-north',CZ:'eu-central',
 DE:'eu-central',DJ:'af-south',DK:'eu-north',DM:'latam-north',DO:'latam-north',DZ:'af-north',EC:'latam-south',EE:'eu-north',EG:'af-north',ES:'eu-west',
 ET:'af-south',FI:'eu-north',FJ:'oceania',FR:'eu-west',GB:'eu-west',GD:'latam-north',GH:'af-south',GL:'eu-north',GR:'eu-east',GT:'latam-north',
 GU:'oceania',GY:'latam-south',HK:'ap-east',HN:'latam-north',HT:'latam-north',HU:'eu-central',ID:'ap-southeast',IE:'eu-west',IN:'in',IS:'eu-north',
 IT:'eu-central',JM:'latam-north',JP:'jp-kr',KE:'af-south',KN:'latam-north',KR:'jp-kr',LC:'latam-north',LK:'in',LU:'eu-west',LV:'eu-north',
 MA:'af-north',MG:'af-south',MH:'oceania',MQ:'latam-north',MU:'af-south',MV:'in',MX:'latam-north',MY:'ap-southeast',MZ:'af-south',NA:'af-south',
 NC:'oceania',NG:'af-south',NI:'latam-north',NL:'eu-west',NO:'eu-north',NZ:'oceania',OM:'me',PA:'latam-north',PE:'latam-south',PF:'oceania',
 PG:'oceania',PH:'ap-southeast',PK:'in',PL:'eu-central',PN:'oceania',PR:'latam-north',PT:'eu-west',PW:'oceania',PY:'latam-south',QA:'me',
 RE:'af-south',RO:'eu-east',RS:'eu-east',RU:'eu-east',RW:'af-south',SA:'me',SB:'oceania',SC:'af-south',SE:'eu-north',SG:'ap-southeast',
 SH:'af-south',SN:'af-south',SR:'latam-south',SV:'latam-north',TH:'ap-southeast',TN:'af-north',TO:'oceania',TR:'eu-east',TT:'latam-north',TW:'ap-east',
 TZ:'af-south',UA:'eu-east',UG:'af-south',UY:'latam-south',VC:'latam-north',VE:'latam-south',VN:'ap-southeast',WS:'oceania',ZA:'af-south',ZM:'af-south',
 ZW:'af-south',
};
const TZ_CC={AR:-3,BE:1,CN:8,ES:1,FR:1,HK:8,IN:5.5,KR:9,LU:1,MA:1,MY:8,NL:1,PT:0,SG:8,TW:8};
// The US splits at the Rockies and the Mississippi; Alaska and Hawaii count as the west.
const usReg=lon=>lon<-104?'us-west':lon<-87?'us-central':'us-east';
for(const c of CITIES){c.rg=c.cc==='US'?usReg(c.lon):REG_CC[c.cc]||'eu-east';c.tz=TZ_CC[c.cc]??Math.round(c.lon/15);}
const regionOf=c=>CITY[c].rg,tzOf=c=>CITY[c].tz;
// Local hour index (0..23) of UTC hour h in timezone tz; half-hour zones round down.
const locH=(h,tz)=>Math.floor((h+tz+48)%24);
