const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const keyed=value=>Array.isArray(value)&&value.every(row=>object(row)&&typeof row.id==='string')&&new Set(value.map(row=>row.id)).size===value.length;
export function storageDelta(before,after){
 if(JSON.stringify(before)===JSON.stringify(after))return null;
 if(keyed(before)&&keyed(after)){
  const previous=new Map(before.map(row=>[row.id,row])),changes=Object.create(null);
  for(const row of after){const patch=storageDelta(previous.get(row.id),row);if(patch)changes[row.id]=patch;}
  return {type:'rows',order:after.map(row=>row.id),changes};
 }
 if(object(before)&&object(after)){
  const changes=Object.create(null),remove=Object.keys(before).filter(key=>!Object.hasOwn(after,key));
  for(const key of Object.keys(after)){const patch=storageDelta(before[key],after[key]);if(patch)changes[key]=patch;}
  return {type:'object',changes,remove};
 }
 return {type:'value',value:after};
}
export function applyStorageDelta(before,patch){
 if(patch.type==='value')return patch.value;
 if(patch.type==='rows'){
  const previous=new Map((Array.isArray(before)?before:[]).map(row=>[row.id,row]));
  return patch.order.map(id=>Object.hasOwn(patch.changes,id)?applyStorageDelta(previous.get(id),patch.changes[id]):previous.get(id));
 }
 if(patch.type==='object'){
  const result=object(before)?{...before}:{};
  for(const key of patch.remove)delete result[key];
  for(const [key,value]of Object.entries(patch.changes))Object.defineProperty(result,key,{value:applyStorageDelta(result[key],value),enumerable:true,writable:true,configurable:true});
  return result;
 }
 throw Error('無法恢復儲存交易，請保留目前資料。');
}
