import {canEditAdmin} from './adminCenterStore.mjs';
export const PORTS_KEY='dqa-equipment-port-drafts-v1',PORTS_EVENT='dqa:equipment-port-drafts';
export const PORT_PROTOCOLS=[['modbus-tcp','Modbus TCP'],['modbus-rtu','Modbus RTU · RS-485／RS-232'],['http-json','HTTP／HTTPS JSON']];
export const PORT_TYPES=[['uint16','無號整數 16-bit'],['int16','有號整數 16-bit'],['uint32','無號整數 32-bit'],['int32','有號整數 32-bit'],['float32','浮點數 32-bit']];
export const emptyChannel=()=>({name:'',address:null,pointer:'',dataType:'uint16',wordOrder:'high-first',scale:1,offset:0,unit:''});
export const newPort=()=>({id:crypto.randomUUID(),revision:0,equipmentId:'',protocol:'modbus-tcp',host:'',port:502,scheme:'https',path:'',serialPort:'',baudRate:9600,parity:'N',stopBits:1,unitId:1,functionCode:3,timeoutMs:3000,channels:[emptyChannel()]});
const text=(v,max)=>typeof v==='string'&&v.length<=max&&![...v].some(c=>c.charCodeAt(0)<32);
const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
function ip(value){if(value.includes(':')){try{new URL('http://['+value+']/');return true;}catch{return false;}}const parts=value.split('.');return parts.length===4&&parts.every(p=>/^(0|[1-9][0-9]{0,2})$/.test(p)&&Number(p)<=255);}
export function portIssues(p){
 const issues=[];if(!p.equipmentId)issues.push('請選擇對應設備。');
 if(p.protocol==='modbus-rtu'){if(!p.serialPort)issues.push('請填寫現場閘道上的串列端口。');}
 else if(!p.host)issues.push('請填寫設備 IP 位址。');
 if(p.protocol==='http-json'&&!p.path)issues.push('請依手冊填寫唯讀 JSON 路徑。');
 for(const [i,c]of p.channels.entries()){if(!c.name)issues.push(`資料點 ${i+1}：請填寫名稱。`);if(p.protocol==='http-json'?!c.pointer:c.address===null)issues.push(`資料點 ${i+1}：${p.protocol==='http-json'?'請填寫 JSON Pointer。':'請依手冊填寫零起算暫存器位址。'}`);}
 return issues;
}
export function normalizePort(p){
 if(!p||!PORT_PROTOCOLS.some(([v])=>v===p.protocol)||!text(p.id,80)||!p.id||!integer(p.revision,0,1e9)||!text(p.equipmentId,100))throw Error('端口識別或協定格式無效。');
 if(!text(p.host,64)||p.host&&!ip(p.host)||!integer(p.port,1,65535)||!['http','https'].includes(p.scheme)||!text(p.path,300)||p.path&&(!p.path.startsWith('/')||p.path.startsWith('//')||/[#?\\]/.test(p.path)))throw Error('請使用設備 IP、有效 TCP 埠號及不含查詢字串的唯讀路徑。');
 if(!text(p.serialPort,120)||p.serialPort&&!/^(?:COM[1-9][0-9]*|\/dev\/[A-Za-z0-9_./-]+)$/.test(p.serialPort)||!integer(p.baudRate,1200,230400)||!['N','E','O'].includes(p.parity)||![1,2].includes(p.stopBits)||![3,4].includes(p.functionCode)||!integer(p.unitId,1,255)||p.unitId>247&&p.unitId!==255||!integer(p.timeoutMs,500,5000))throw Error('Modbus／串列通訊參數格式無效。');
 if(!Array.isArray(p.channels)||p.channels.length<1||p.channels.length>8)throw Error('每個端口需有 1～8 個資料點。');
 const names=p.channels.map(c=>c?.name).filter(Boolean);if(new Set(names).size!==names.length)throw Error('資料點名稱不可重複。');
 if(p.protocol==='modbus-rtu'&&p.unitId>247)throw Error('RTU 站號需為 1～247。');
 const channels=p.channels.map(c=>{if(!c||!text(c.name,60)||!text(c.unit,20)||!text(c.pointer,300)||c.pointer&&!/^\/(?:[^~]|~[01])*$/.test(c.pointer)||c.address!==null&&!integer(c.address,0,65535)||!PORT_TYPES.some(([v])=>v===c.dataType)||!['high-first','low-first'].includes(c.wordOrder)||!Number.isFinite(c.scale)||!Number.isFinite(c.offset))throw Error('資料點名稱、位址、格式或換算值無效。');if(c.address===65535&&['uint32','int32','float32'].includes(c.dataType))throw Error('32-bit 資料需要兩個暫存器，起始位址不可超界。');return Object.fromEntries(['name','address','pointer','dataType','wordOrder','scale','offset','unit'].map(k=>[k,c[k]]));});
 return {...Object.fromEntries(['id','revision','equipmentId','protocol','host','port','scheme','path','serialPort','baudRate','parity','stopBits','unitId','functionCode','timeoutMs'].map(k=>[k,p[k]])),channels};
}
export function readPortDrafts(storage=localStorage){try{const raw=storage.getItem(PORTS_KEY);if(!raw)return [];const data=JSON.parse(raw);if(data.version!==1||!Array.isArray(data.ports)||data.ports.length>100)throw Error();const ports=data.ports.map(normalizePort);if(new Set(ports.map(p=>p.id)).size!==ports.length)throw Error();return ports;}catch{throw Error('設備端口草稿無法讀取；原資料未覆寫。');}}
export function savePortDraft(p,account,equipment,storage=localStorage){
 if(!canEditAdmin(account,storage))throw Error('目前帳號沒有端口設定權限。');const next=normalizePort(p),ports=readPortDrafts(storage),old=ports.find(v=>v.id===p.id);
 if(!equipment.some(e=>e.id===p.equipmentId))throw Error('請選擇目前設備台帳中的設備。');if((old?.revision??0)!==p.revision)throw Error('端口已在其他視窗更新，請重新開啟。');if(!old&&ports.length>=100)throw Error('最多保存 100 個端口草稿。');next.revision++;
 storage.setItem(PORTS_KEY,JSON.stringify({version:1,ports:old?ports.map(v=>v.id===next.id?next:v):[...ports,next]}));window.dispatchEvent(new Event(PORTS_EVENT));return next;
}
export function gatewayAddress(value,local= ['localhost','127.0.0.1','[::1]'].includes(location.hostname)){
 let url;try{url=new URL(value);}catch{throw Error('請填寫完整的閘道 HTTPS 網址。');}
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.protocol!=='https:'&&!(local&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('閘道需使用 HTTPS 根網址；本機開發才可使用 loopback HTTP。');return url.origin;
}
export async function gatewayRequest(base,token,path,body,signal){
 const response=await fetch(gatewayAddress(base)+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...body?{'Content-Type':'application/json'}:{}},...(body?{body:JSON.stringify(body)}:{}),credentials:'omit',redirect:'error',cache:'no-store',signal});
 let data;try{data=await response.json();}catch{throw Error('閘道未回傳有效 JSON。');}if(!response.ok)throw Error(`設備閘道：${data.error?.code||'REQUEST_REJECTED'}${data.traceId?' · '+data.traceId:''}`);return data;
}
