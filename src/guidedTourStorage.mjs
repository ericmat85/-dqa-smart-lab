export function memoryStorage(initial={},changed=()=>{}){
 const data=new Map(Object.entries(initial).map(([key,value])=>[key,String(value)]));
 const methods={getItem:key=>data.get(String(key))??null,setItem:(key,value)=>{key=String(key);value=String(value);if(data.get(key)===value)return;data.set(key,value);changed();},removeItem:key=>{if(data.delete(String(key)))changed();},clear:()=>{data.clear();changed();},key:index=>[...data.keys()][index]??null};
 return new Proxy({}, {get:(_,key)=>key==='length'?data.size:methods[key]??data.get(key),set:(_,key,value)=>{methods.setItem(key,value);return true;},ownKeys:()=>[...data.keys()],getOwnPropertyDescriptor:(_,key)=>data.has(key)?{enumerable:true,configurable:true,value:data.get(key)}:undefined});
}
export const tourDatabaseName=token=>/^dqa-guided-tour-[a-f0-9-]+$/.test(token)?`dqa-tour-reports-${token.slice(16)}`:null;
