import {trialProfile,profileSummary} from './trialProfiles.mjs';
// Twenty user-facing choices reuse the existing nineteen synthetic scheduling profiles.
// Storage and powered high-temperature operation share equipment limits, not test intent.
export const testOptions = ['高溫試驗','低溫試驗','高溫高濕','溫度循環','熱衝擊','振動試驗','機械衝擊試驗','IPX6 防水','鹽霧試驗','ESD 靜電','EMC 電磁相容','日照試驗','溫濕度試驗','防塵試驗','拉力試驗','量測觀察','跌落試驗','插拔試驗','電壓變動試驗','高溫運作試驗'];
const methodNotes={
 '高溫試驗':'確認儲存或不通電狀態、樣品放置及試前／試後功能檢查。',
 '低溫試驗':'確認啟動或儲存狀態、恢復條件及試前／試後檢查。',
 '高溫高濕':'連續曝露；僅使用具濕控資料的環境試驗箱或恆溫恆濕機，記錄中斷及恢復。',
 '溫度循環':'高低溫停留、轉換時間與循環次數須依核准規範補齊；總工時不代表循環證據。',
 '熱衝擊':'轉移時間、停留時間及循環次數須依核准規範補齊；總工時不代表循環證據。',
 '振動試驗':'確認軸向、振幅／加速度、固定方式及檢查要求；單台一次 1 顆，每顆 20 小時，每工作日處理 1 顆，週末不作業。',
 '機械衝擊試驗':'依核准規範補齊波形、峰值加速度、脈衝時間、方向與次數。',
 'IPX6 防水':'依核准版本補齊噴嘴、流量、距離及檢查方式；示範工時不等同防護等級合格證明。',
 '鹽霧試驗':'依核准規範確認試驗液、濃度、pH、放置方式與試後評價。',
 'ESD 靜電':'依核准規範補齊接觸／空氣放電、測試點、電壓等級、次數及運作狀態。',
 'EMC 電磁相容':'依核准規範補齊發射／抗擾度項目、頻率範圍、等級、佈置及性能準則。',
 '日照試驗':'依核准規範確認光源、輻照度、照射方式及外觀／功能檢查。',
 '溫濕度試驗':'依核准規範補齊溫濕度轉換、停留與循環次數，記錄凝露及恢復條件。',
 '防塵試驗':'依核准規範補齊粉塵種類、濃度、壓差、樣品狀態與試後檢查。',
 '拉力試驗':'依核准規範補齊荷重、拉伸速度、治具、方向及破壞判定。',
 '量測觀察':'確認觀察位置、量測項目、方法、解析度及儀器校驗狀態。',
 '跌落試驗':'依核准規範補齊高度、方向、次數、落下面與試後檢查。',
 '插拔試驗':'依核准規範補齊插拔力、速度、次數與檢查；連續自動運轉須有設備及執行證據。',
 '電壓變動試驗':'依核准規範補齊電壓範圍、變化速率、負載與性能檢查。',
 '高溫運作試驗':'須確認通電電壓、負載、運作模式與功能監測；不得以不通電儲存結果代替運作結果。'
};
const range=(a,b,unit)=>a===b?`${a}${unit}`:`${a}～${b}${unit}`;
export function getTestReference(name){
 if(!testOptions.includes(name))return null;
 const profile=trialProfile(name),c=profile.conditions,conditions=[];
 for(const [key,label,unit] of [['temperature','溫度','°C'],['humidity','濕度','%RH'],['frequency','頻率','Hz']]){
  if(c[key+'Min']!==undefined)conditions.push(`${label} ${range(c[key+'Min'],c[key+'Max'],unit)}`);
 }
 const equipment=profile.id==='HIGH_HUMIDITY'?'恆溫恆濕機／具濕控資料的環境試驗箱':profile.equipment_pattern.split('|').join('／');
 const duration=profile.id==='VIBRATION_DURABILITY'?`每顆 ${profile.hours} 小時（固定）`:`${profile.hours} 小時${profile.fixed_duration?'（固定）':'（合成示範，可依原始試驗資料調整）'}`;
 const calendar=profile.calendar==='weekdays'?'操作型試驗，僅週一至週五作業，跳過週末':'可連續跨週末；需保留自動運轉及安全條件';
 const specification=['合成 Demo 參考內容，非核准正式規範。',`適用設備：${equipment}。`,`試驗條件：${conditions.length?conditions.join('；'):'依核准規範補齊，未假設未知數值'}。`,`試驗時間：${duration}。`,`作業日：${calendar}。`,`試驗手法：${methodNotes[name]}`].join('\n');
 return {name,profileId:profile.id,equipment,conditions:conditions.join('；')||'依核准規範補齊',duration,calendar,summary:profileSummary(profile),specification,acceptance:buildAcceptanceCriteria(name),synthetic:true,officialStandard:false};
}
export function buildSpecification(items){return (items||[]).map(name=>`${name}：${testSpecificationCatalog[name]||'請依核准試驗規範填寫條件與判定要求。'}`).join('\n\n');}
// 示範判定基準目錄：正式環境應由 LMS 核准的試驗項目資料庫/API 取得。
export const testAcceptanceCriteriaCatalog = {
  '高溫試驗': '參考判定基準：試驗後產品外觀、功能與電氣特性符合產品規格及核准驗證計畫，無異常損壞。',
  '低溫試驗': '參考判定基準：試驗後產品外觀、功能與電氣特性符合產品規格及核准驗證計畫，無異常損壞。',
  '高溫高濕': '參考判定基準：試驗後產品外觀、功能與電氣特性符合產品規格及核准驗證計畫；無凝露造成的異常、腐蝕或功能失效。',
  '溫度循環': '參考判定基準：完成規定循環後，產品外觀、功能及電氣特性符合核准規格，無裂痕、鬆脫或功能異常。',
  '熱衝擊': '參考判定基準：完成規定熱衝擊循環後，產品無可見損傷，功能及電氣特性符合核准規格。',
  '振動試驗': '參考判定基準：試驗後產品結構無破損或鬆脫，連接器及固定件正常，功能與電氣特性符合核准規格。',
  '機械衝擊試驗': '參考判定基準：試驗後產品無破裂、脫落或結構損傷，功能與電氣特性符合核准規格。',
  'IPX6 防水': '參考判定基準：試驗後產品內部無不允許之進水，功能與電氣特性符合核准規格及客戶要求。',
  '鹽霧試驗': '參考判定基準：試驗後腐蝕程度及外觀符合核准規格，產品功能與電氣特性符合要求。',
  'ESD 靜電': '參考判定基準：依核准性能判定準則，試驗中及試驗後產品功能符合指定性能等級，無不可恢復故障或資料遺失。',
  'EMC 電磁相容': '參考判定基準：依核准 EMC 規範，發射與抗擾度結果符合限值及性能判定準則。',
  '日照試驗': '參考判定基準：試驗後產品外觀、顏色、材料及功能變化符合核准規格，無不可接受之劣化。',
  '溫濕度試驗': '參考判定基準：依核准規格檢查外觀、功能及電氣特性，記錄凝露與材料變化。',
  '防塵試驗': '參考判定基準：記錄粉塵侵入位置與程度，依核准防護等級確認功能。',
  '拉力試驗': '參考判定基準：如實記錄荷重與位移，依核准的強度及破壞模式要求判定。',
  '量測觀察': '參考判定基準：記錄量測方法、儀器與觀察結果，依核准尺寸及外觀要求判定。',
  '跌落試驗': '參考判定基準：記錄跌落後結構、外觀及功能，依核准允收條件判定。',
  '插拔試驗': '參考判定基準：記錄接點、結構及功能變化，依核准插拔力與電氣要求判定。',
  '電壓變動試驗': '參考判定基準：記錄各電壓條件下的運作及恢復情形，依核准性能準則判定。',
  '高溫運作試驗': '參考判定基準：如實記錄通電運作及試後功能，依核准性能與電氣要求判定。'
};
export function buildAcceptanceCriteria(item) { return testAcceptanceCriteriaCatalog[item==='機械衝擊'?'機械衝擊試驗':item] || ''; }

export const testSpecificationCatalog=Object.fromEntries(testOptions.map(name=>[name,getTestReference(name).specification]));
