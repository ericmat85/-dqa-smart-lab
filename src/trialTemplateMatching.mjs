// Explicit historical names only. Never infer a method from a partial match,
// equipment name, a broad scheduling profile or a similar temperature label.
const LEGACY={
 'TRIAL-001':['高溫儲存試驗','高溫儲存'],
 'TRIAL-002':['低溫儲存試驗','低溫儲存','低溫啟動試驗','低溫啟動'],
 'TRIAL-003':['高溫高濕試驗','高溫高濕儲存試驗'],
 'TRIAL-004':['溫度循環試驗','高低溫循環試驗','高低溫循環'],
 'TRIAL-005':['熱衝擊試驗','冷熱衝擊試驗','冷熱衝擊'],
 'TRIAL-006':['振動耐久試驗','耐久振動試驗','振動耐久'],
 'TRIAL-007':['機械衝擊'],
 'TRIAL-008':['IPX6 防水試驗','防水 IPX6 試驗','防水 IPX6'],
 'TRIAL-009':['鹽霧腐蝕試驗','鹽霧腐蝕'],
 'TRIAL-010':['ESD 靜電試驗','ESD 靜電放電試驗','ESD 靜電放電','靜電放電試驗'],
 'TRIAL-011':['EMC 電磁相容試驗','EMC 試驗','電磁相容試驗'],
 'TRIAL-012':['日照耐候試驗','日照耐候'],
 'TRIAL-013':['溫濕度循環試驗','溫濕度循環','溫濕度儲存試驗'],
 'TRIAL-014':['防塵'],
 'TRIAL-015':['拉力'],
 'TRIAL-016':['尺寸量測試驗','量測觀察試驗'],
 'TRIAL-017':['跌落'],
 'TRIAL-018':['接插件插拔試驗','連接器插拔試驗','接插件插拔'],
 'TRIAL-019':['電壓變動','電壓變化試驗'],
 'TRIAL-020':['高溫運作','高溫運轉試驗'],
};
export const trialNameKey=value=>typeof value==='string'?value.normalize('NFKC').replace(/\s+/gu,'').toUpperCase():'';
export const historicalTrialNames=row=>row?.builtin?[...(LEGACY[row.id]||[])]:[];
export const isGeneralTrialName=name=>['一般性能試驗','一般性能試驗報告','一般性能','GENERALPERFORMANCETEST'].map(trialNameKey).includes(trialNameKey(name));
export function matchTrialDefinition(name,rows){
 const key=trialNameKey(name);if(!key)return null;
 const explicit=rows.filter(r=>[r.name,...r.aliases].some(n=>trialNameKey(n)===key));
 const matches=explicit.length?explicit:rows.filter(r=>historicalTrialNames(r).some(n=>trialNameKey(n)===key));
 if(matches.length>1)throw Error('試驗名稱對應多個範本，請先在試驗與設備參數確認名稱及別名。');
 return matches[0]||null;
}
export function correspondingTrialNames(row,rows){
 return [...new Set([...row.aliases,...historicalTrialNames(row)])].filter(name=>{
  try{return matchTrialDefinition(name,rows)?.id===row.id;}catch{return false;}
 });
}
