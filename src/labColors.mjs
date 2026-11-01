export const STATUS_COLORS={'待核准':'#8e76bd','未排程':'#5484df','已排程':'#d6a44e','試驗中':'#3ca58d','暫停中':'#a08bc5','已完成':'#92a4bb','有衝突':'#d47987','取消':'#c5cdd9','待審查':'#8673c5','完成':'#75a490','退回':'#cd9773'};

const CATEGORY_COLORS=['#7c69cf','#4093b4','#d08c4b','#56a18c','#c57191','#6682bf'];
export const categoryName=value=>String(value||'').trim()||'未分類';
// Use the complete catalog order so filtering and schedule sorting never change a category's color.
export function categoryColorMap(rows){
 return new Map([...new Set(rows.map(row=>categoryName(row.category)))].map((name,index)=>[name,CATEGORY_COLORS[index%CATEGORY_COLORS.length]]));
}
