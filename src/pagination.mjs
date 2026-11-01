export const PAGE_SIZE=20;
export function pageSlice(items,page=1,size=PAGE_SIZE) {
  size=Number.isSafeInteger(Number(size))&&Number(size)>0?Number(size):PAGE_SIZE;
  const pages=Math.max(1,Math.ceil(items.length/size));
  const current=Math.max(1,Math.min(pages,Math.floor(Number(page)||1)));
  const offset=(current-1)*size;
  return {items:items.slice(offset,offset+size),page:current,pages,offset,total:items.length,size};
}
export function pageNumbers(page,pages) {
  if(pages<=7)return Array.from({length:pages},(_,index)=>index+1);
  const numbers=[...new Set([1,pages,page-2,page-1,page,page+1,page+2])].filter(value=>value>=1&&value<=pages).sort((a,b)=>a-b);
  return numbers.flatMap((value,index)=>index&&value-numbers[index-1]>1?['…',value]:[value]);
}
export function listIdentity(items) {
  return JSON.stringify(items.map((item,index)=>typeof item==='object'&&item!==null?item.id??item.key??item.requestId??item.name??item.date??index:item));
}
