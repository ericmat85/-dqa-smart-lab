export const ASSISTANT_DEMOS=[
 {id:'overview',category:'總覽',question:'目前實驗室的試驗狀況如何？',keywords:['總覽','狀況','概況'],answer:'overview'},
 {id:'pending',category:'排程',question:'目前有多少試驗還沒排程？',keywords:['還沒排程','待排程','未排程'],answer:'pending'},
 {id:'running',category:'排程',question:'目前有多少試驗正在進行？',keywords:['正在進行','試驗中','進行中'],answer:'running'},
 {id:'schedule',category:'排程',question:'如何安排新的試驗日程？',keywords:['安排','新增排程'],answer:'前往「排程管理」，選擇委託並開啟「編輯排程」。在設備與排程安排中選擇待機設備、執行人、開始與完成日期，按下儲存排程。'},
 {id:'automatic',category:'排程',question:'AI自動化排程怎麼使用？',keywords:['自動','推薦','ai排程'],answer:'開啟編輯排程，在「設備與排程安排」按下 AI 自動化排程。Demo 會顯示約 3 秒分析進度並提出安排建議，確認內容後再儲存。'},
 {id:'conflict',category:'排程',question:'發生排程衝突時怎麼辦？',keywords:['衝突','重疊'],answer:'查看排程的衝突說明，改選可用設備或調整試驗時段，再儲存安排。助理只提供操作說明，不會直接更動排程。'},
 {id:'progress',category:'排程',question:'試驗日程的進度條如何計算？',keywords:['進度','百分比','日程'],answer:'儲存開始與預計完成日期後，開始前顯示已排程；開始時間到達後轉為試驗中，進度條依實際時間推進。缺少任一日期時不顯示進度條。'},
 {id:'finish',category:'排程',question:'試驗完成後設備會自動釋放嗎？',keywords:['釋放','試驗完成','已完成'],answer:'已儲存的試驗日程走完後會轉為已完成。若設備沒有其他進行中的試驗，會恢復待機；維護中或校驗中的設備不會被強制改回待機。'},
 {id:'stop',category:'排程',question:'如何中止試驗排程？',keywords:['中止','取消排程'],answer:'在編輯排程最下方按「中止排程」，確認視窗會說明取消範圍。確認後會取消整張委託與相關排程，並依設備占用情況釋放設備。'},
 {id:'standby',category:'設備',question:'現在有多少設備可以安排試驗？',keywords:['待機','可用設備','多少設備'],answer:'standby'},
 {id:'breakdown',category:'設備',question:'試驗中設備故障要怎麼處理？',keywords:['故障','壞了'],answer:'先確認受影響試驗的處置，再到設備管理變更設備為維護中並填寫原因。維護完成後改回待機，系統會在結束維護時記錄這段維護的起訖與歷時。'},
 {id:'calibration',category:'設備',question:'使用中的設備可以校驗嗎？',keywords:['校驗','校正'],answer:'使用中的設備不能直接變更為校驗中。請先確認試驗已結束或妥善處理現有排程，再變更設備狀態；維護中與校驗中的設備不能加入試驗排程。'},
 {id:'history',category:'設備',question:'在哪裡查看設備維護紀錄？',keywords:['維護紀錄','設備紀錄','保養'],answer:'前往設備管理，點選設備資訊並切換至操作紀錄或校驗保養分頁。維護與校驗服務完成後，紀錄會保留起訖時間、原因與處理人員。'},
 {id:'materials',category:'物料',question:'物料會占用試驗排程嗎？',keywords:['占用','物料排程'],answer:'物料使用獨立台帳管理，不占用設備排程。可在物料管理查看耗材、完檢機、工具與治具，也可依實際狀況變更物料狀態。'},
 {id:'stock',category:'物料',question:'目前有哪些物料低於安全庫存？',keywords:['庫存','缺料','補貨'],answer:'stock'},
 {id:'signature',category:'簽核',question:'電子簽名可以上傳或使用預設簽名嗎？',keywords:['簽名','上傳','預設簽名'],answer:'簽名區支援手寫與上傳簽名檔，也可儲存並使用帳號的預設簽名。已提交的簽名可在對應委託資訊與簽名歷程中查看。'},
 {id:'return',category:'簽核',question:'主管退件時需要簽名嗎？',keywords:['退件','退回','補件'],answer:'退回補正時需要填寫原因，可不簽名；核准則需要簽名。重新送出後依流程重新審查，既有簽名與退件歷程會保留。'},
 {id:'report',category:'報表',question:'如何匯出試驗排程報表？',keywords:['報表','匯出','csv'],answer:'前往報表分析，選擇試驗排程、設備概況、物料庫存或委託審查。設定搜尋、狀態與日期條件後按「匯出 CSV」，會匯出全部符合條件的資料。'},
 {id:'role',category:'權限',question:'如何新增帳號並設定角色權限？',keywords:['帳號','權限','角色'],answer:'具有帳號管理權限的人員可在帳號管理新增或編輯帳號。使用右上角「權限設定」建立角色、選擇功能頁面與審查階級，再將角色指派給帳號。'},
 {id:'sync',category:'系統',question:'資料會自動同步嗎？重新整理會不會不見？',keywords:['同步','儲存','重新整理','資料'],answer:'目前 Demo 使用同一網站、同一瀏覽器的本機儲存，管理頁面的變更會同步到儀錶板。重新整理通常會保留已儲存資料；清除網站資料、使用不同瀏覽器或不同裝置不會共用這些資料。'},
];
export function assistantReply(question,snapshot,metrics){
 const normalized=question.trim().toLowerCase().replace(/\s/g,'');
 const item=ASSISTANT_DEMOS.find(item=>item.question.toLowerCase().replace(/\s/g,'')===normalized)||ASSISTANT_DEMOS.find(item=>item.keywords.some(word=>normalized.includes(word)));
 if(!item)return '這是 Demo 示範助理，目前提供 20 組實驗室常見問答。請展開「常見問題」選擇題目，或詢問排程、設備、物料、簽名、報表與權限相關問題。';
 const counts=metrics.counts;
 if(item.answer==='overview')return `依目前資料：待排程 ${counts['未排程']||0} 筆、已排程 ${counts['已排程']||0} 筆、試驗中 ${counts['試驗中']||0} 筆、已完成 ${counts['已完成']||0} 筆；設備共 ${snapshot.equipment.length} 台。`;
 if(item.answer==='pending')return `目前有 ${counts['未排程']||0} 筆待排程，另有 ${counts['有衝突']||0} 筆排程衝突待確認。可前往排程管理查看明細。`;
 if(item.answer==='running')return `目前有 ${counts['試驗中']||0} 筆試驗正在進行，另有 ${counts['已排程']||0} 筆已安排但尚未開始。`;
 if(item.answer==='standby')return `目前設備共 ${snapshot.equipment.length} 台，其中 ${snapshot.equipment.filter(row=>row.status==='待機中').length} 台為待機中。實際安排前仍需確認時段、規格與排程衝突。`;
 if(item.answer==='stock')return metrics.lowStock.length?`低於安全庫存的物料共 ${metrics.lowStock.length} 項：${metrics.lowStock.slice(0,20).map(row=>`${row.name}（可用 ${row.available} ${row.unit}／安全庫存 ${row.minStock} ${row.unit}）`).join('、')}。請至物料管理查看完整清單。`:'目前台帳沒有低於安全庫存的物料。可前往物料管理查看各項可用數量。';
 return item.answer;
}
