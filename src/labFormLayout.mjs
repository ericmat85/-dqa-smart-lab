// PDF-reference layout. Template signatures and measured results start empty.
import {getTestReference} from './trialCatalogData.mjs';
export const LAB_FORM_VERSION='lab-reference-20261116-v1';
export const LAB_SIGNATURE_CELLS=Object.freeze({level3:'C55',level2:'F55',executor:'I55'});
export const LAB_REPORT_SHEETS=['報告首頁','試驗過程','結果與照片'];
const ink='FF172B42',line='FF617180',tint='FFEAF5F6';
export async function formAssets(fetchImpl=globalThis.fetch,{photos=true}={}){
 const base=import.meta.env?.BASE_URL||'/';
 const paths={logo:'branding/colong-ie-transparent.png',footer:'branding/colong-intellienergy-logo.jpg',sample:'demo-report-images/synthetic-sample.png',placement:'demo-report-images/synthetic-placement.png'};
 const entries=await Promise.all(Object.entries(paths).filter(([key])=>photos||key==='logo'||key==='footer').map(async([key,path])=>{const r=await fetchImpl(base+path);if(!r.ok)throw Error('範本圖片載入失敗，請稍後再試。');return [key,new Uint8Array(await r.arrayBuffer())];}));return Object.fromEntries(entries);
}
function area(s,range,value='',{fill=false,bold=false,size=9,center=false}={}){
 s.mergeCells(range);const c=s.getCell(range.split(':')[0]);c.value=String(value??'');c.font={name:'Microsoft JhengHei',size,bold,color:{argb:ink}};c.alignment={vertical:'middle',horizontal:center?'center':'left',wrapText:true};
 if(fill)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:tint}};
 c.border={top:{style:'thin',color:{argb:line}},bottom:{style:'thin',color:{argb:line}},left:{style:'thin',color:{argb:line}},right:{style:'thin',color:{argb:line}}};return c;
}
const pictureIds=new WeakMap();
function picture(book,s,bytes,{col,row,width,height,extension='png',naturalWidth,naturalHeight}){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),v=new DataView(b.buffer,b.byteOffset,b.byteLength),w=naturalWidth||v.getUint32(16),h=naturalHeight||v.getUint32(20),ratio=Math.min(width/w,height/h),actualWidth=w*ratio,actualHeight=h*ratio;
 let cache=pictureIds.get(book);if(!cache){cache=new WeakMap();pictureIds.set(book,cache);}let id=cache.get(b);if(id===undefined){id=book.addImage({buffer:b,extension});cache.set(b,id);}
 const cw=(s.getColumn(Math.floor(col)+1).width||7.8)*7+5,rh=(s.getRow(Math.floor(row)+1).height||11.5)*4/3;
 s.addImage(id,{tl:{col:col+(width-actualWidth)/2/cw,row:row+(height-actualHeight)/2/rh},ext:{width:actualWidth,height:actualHeight},editAs:'oneCell'});return id;
}
function sheet(book,name,title,assets,orderNo){
 const s=book.addWorksheet(name);s.orderNo=orderNo;s.columns=Array.from({length:12},()=>({width:7.8}));for(let r=1;r<=64;r++)s.getRow(r).height=11.5;s.getRow(61).height=20;s.getRow(62).height=20;
 s.pageSetup={paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:1,printArea:'A1:L64',horizontalCentered:true,margins:{left:.23,right:.23,top:.22,bottom:.22,header:.1,footer:.1}};
 area(s,'C1:L4',title,{bold:true,size:title.length>65?9:13,center:true});
 if(assets?.logo){picture(book,s,assets.logo,{col:0,row:0,width:115,height:38});if(assets.footer)picture(book,s,assets.footer,{col:4,row:60,width:250,height:48,extension:'jpeg',naturalWidth:800,naturalHeight:191});else picture(book,s,assets.logo,{col:4,row:60,width:220,height:30});}
 area(s,'A63:I64','合成 Demo 範本｜非核准正式規範｜照片非實拍；量測、判定與簽名均須另行填寫。',{size:7});area(s,'J63:L64',LAB_FORM_VERSION,{size:6,center:true});return s;
}
const list=value=>Array.isArray(value)?value.join('、'):value||'';
export function addRequestForm(book,request={},row=null,assets){
 const s=sheet(book,'委託單','電子委託信賴性評價單\nElectronic Reliability Evaluation Request Form',assets,1);
 const pairs=[['產品代碼',request.productCode||request.product,'產品類型',request.productType],['客戶名稱',request.customer,'客戶品番',request.customerPartNo||request.customerPart],['需求日期',request.dueDate||request.requestedDate,'測試數量',request.quantity]];
 pairs.forEach(([a,b,c,d],i)=>{const n=5+i;area(s,`A${n}:B${n}`,a,{fill:true});area(s,`C${n}:F${n}`,b);area(s,`G${n}:H${n}`,c,{fill:true});area(s,`I${n}:L${n}`,d);s.getRow(n).height=19;});
 area(s,'A8:B11','試驗目的\nTest intention',{fill:true,center:true});area(s,'C8:L11',list(request.purpose||request.intent)||'□ 新產品 New Product    □ 設計變更 Design Change    □ 量產品 Mass Product\n□ 手工品 EV    □ 型物品 DV    □ 本型本工程 PV\n□ 再現試驗    □ 定期抽測    □ 其他：');
 area(s,'A12:B14','樣品來源\nSample source',{fill:true,center:true});area(s,'C12:L14',list(request.sampleSource)||'□ 社內 In-house    □ 海外廠 Overseas    □ 客戶 Customer\n□ 廠商 Supplier    □ 競品 Competing products');
 area(s,'A15:B18','樣品資訊\nSample info',{fill:true,center:true});area(s,'C15:L18',`製品版次 Product version：${request.productVersion||''}       PCBA 版次：${request.pcbaVersion||''}\n軟體版次 Software version：${request.softwareVersion||''}\n製造日期 Date of manufacture：${request.manufactureDate||''}    每件樣品空間 U：${request.sampleSpaceUnits||''}\n其他說明：${request.sampleNote||''}`);
 area(s,'A19:B34','試驗規範／\n試驗手法\nTest Specification\n/ Test Method',{fill:true,center:true});area(s,'C19:L21',`試驗項目 Test item：${list(request.testItems)||row?.name||''}`,{bold:true});area(s,'C22:L34',addEvidenceContinuations(book,request.specification||row?.specification||'',assets));
 area(s,'A35:B40','判定基準\nJudgment criteria',{fill:true,center:true});area(s,'C35:D40','□ 需作判定\n□ 不作判定',{center:true});area(s,'E35:L40',addEvidenceContinuations(book,request.judgementCriteria||request.judgment||row?.acceptance||'',assets,'判定續頁',250));
 area(s,'A41:B43','備註 Note',{fill:true});area(s,'C41:L43',request.notes||request.remarks||'');
 area(s,'A44:B50','簽核\nApproval',{fill:true,center:true});area(s,'C44:E50','');area(s,'F44:G50','委託者\nRequester',{fill:true,center:true});area(s,'H44:J50',request.requester||'');area(s,'K44:L50',request.requesterSignatureAt?`日期\n${String(request.requesterSignatureAt).slice(0,10)}`:'日期：');
 area(s,'A52:L54',`委託編號：${request.id||''}    範本：${row?.name||'空白委託單'}    規範版本：${row?.version||'待填'}`,{size:8});
 return s;
}
const procedures={
 HIGH_TEMPERATURE:['核對儲存／不通電狀態、樣品識別與試前功能','依來源規範設定高溫條件，記錄穩定時間及擺放','記錄曝露與中斷；依規範恢復後進行外觀／功能檢查'],
 LOW_TEMPERATURE:['確認低溫啟動或儲存狀態與試前檢查','依來源規範設定低溫及停留，保留實際溫度紀錄','恢復至規範條件後確認啟動、外觀與功能'],
 HIGH_HUMIDITY:['核對具濕控資料的環境試驗箱／恆溫恆濕機','依規範設定溫濕度，連續 250H；可跨週末','記錄中斷、凝露、恢復及試後外觀／功能，不自動判定合格'],
 THERMAL_CYCLE:['補齊上下限、停留、轉換與循環數來源','依核准條件執行循環並記錄實際曲線','恢復後檢查外觀與功能，總工時不代替循環證據'],
 THERMAL_SHOCK:['確認冷熱區條件、轉移與停留時間','使用冷熱衝擊設備，逐循環記錄轉移及中斷','恢復後檢查連接、外觀與功能'],
 VIBRATION_DURABILITY:['核對軸向、頻率、加速度／振幅與治具','單台每次 1 顆、每顆 20H；每工作日處理 1 顆，週末不作業','逐顆保存振動及功能紀錄；3 顆至少 3 個工作日'],
 MECHANICAL_SHOCK:['核對波形、峰值、脈衝時間、方向與次數','確認治具及量測配置，依規範執行各方向衝擊','保存波形與實際次數，完成外觀／功能檢查'],
 WATER_INGRESS:['核對 IPX6 來源版本、噴嘴、流量、距離與時間','依規範設定姿態與噴淋，記錄中斷及觀察','依規範檢查進水及功能；示範不構成等級認證'],
 SALT_SPRAY:['核對試驗液、濃度、pH、角度及前處理','依規範執行鹽霧曝露並記錄實際條件','依核准方式清潔／恢復，記錄腐蝕及功能觀察'],
 ESD:['核對接觸／空氣放電、點位、電壓及次數','確認接地、擺放與運作模式，逐點記錄放電','記錄功能恢復及異常，不補填未量測數值'],
 EMC:['核對發射／抗擾度項目、頻段、等級及性能準則','確認佈置、線束與設備校驗，依核准程序測試','保存掃描／量測紀錄與判定依據'],
 WEATHERING:['核對光源、輻照度、距離及曝露條件','確認樣品表面與遮蔽，記錄曝光及中斷','記錄褪色、龜裂、外觀及功能比較'],
 HUMIDITY_CYCLE:['補齊溫濕度停留、轉換與循環數','依核准規範記錄循環、凝露及恢復條件','保存實際曲線與試後功能／外觀紀錄'],
 DUST:['核對粉塵種類、濃度、壓差及樣品狀態','依規範安排粉塵曝露，保留實際條件與中斷','檢查侵入及功能，待工程師依證據判定'],
 TENSILE:['核對拉伸速度、荷重、方向及治具','確認量測設備校驗及固定，執行受控拉伸','保留曲線、峰值與破壞位置；不得預填實測值'],
 INSPECTION:['定義觀察位置、尺寸、方法與解析度','核對儀器校驗後依點位量測／拍攝','逐點記錄原始值及來源照片'],
 DROP:['核對跌落高度、方向、次數與落下面','確認安全及樣品狀態，依順序逐次執行','保存每次方向、損傷及功能檢查'],
 INSERTION:['核對插拔力、速度、次數與治具','依核准程序執行插拔並記錄實際次數','檢查端子、接觸與功能；連續運轉須有證據'],
 VOLTAGE:['核對電壓範圍、變化速率、負載與工作模式','使用受控電源依程序施加條件，記錄波形','保存實測供電與功能變化，待依據判定'],
};
export function trialProcedure(row){
 if(row.name==='高溫運作試驗')return ['核對通電電壓、負載、工作模式及監測項目','依高溫運作條件執行，保存供電與溫度紀錄','恢復後檢查功能；不得使用不通電儲存結果替代'];
 return procedures[row.profileId]||['核對試驗規範、樣品及設備來源','依核准程序執行並保存原始紀錄','記錄實際結果、異常及人工審查依據'];
}
export function addTrialReportForms(book,row,{request={},assets,demo=false}={}){
 const ref=getTestReference(row.name),cover=sheet(book,'報告首頁','試驗報告單\nTest Report',assets,2),process=sheet(book,'試驗過程',`${row.name}\nTest Procedure`,assets,3),results=sheet(book,'結果與照片',`${row.name}\nTest Results & Photo Record`,assets,4);
 area(cover,'A5:B8','試驗目的\nTest intention',{fill:true});area(cover,'C5:L8',list(request.purpose||request.intent)||'□ 新產品    □ 設計變更    □ 量產品    □ 再現試驗    □ 定期抽測');
 area(cover,'A9:B11','樣品來源\nSample source',{fill:true});area(cover,'C9:L11',list(request.sampleSource)||'□ 社內    □ 海外廠    □ 客戶    □ 廠商    □ 競品');
 for(const [n,a,b,c,d]of [[12,'試驗項目',row.name,'客戶',request.customer],[14,'品名',request.productName||request.productCode,'報告日期',request.reportDate],[16,'品番',request.productCode,'報告編號',request.id?`DQA-${request.id}`:'']]){area(cover,`A${n}:B${n+1}`,a,{fill:true});area(cover,`C${n}:F${n+1}`,b);area(cover,`G${n}:H${n+1}`,c,{fill:true});area(cover,`I${n}:L${n+1}`,d);}
 area(cover,'A18:B21','樣品資訊\nSample note',{fill:true});area(cover,'C18:L21',`委託編號：${request.id||''}    樣品數：${request.quantity||''}\n樣品編號：${request.execution?.sampleCode||''}\n設備：${request.execution?.equipment||''}    規範版本：${row.version}\n試驗期間：${request.execution?.plannedStart||''} ～ ${request.execution?.completedAt||request.execution?.plannedEnd||''}`,{size:8});
 area(cover,'A22:L23','試驗基準 Test Conditions',{fill:true,bold:true,center:true});area(cover,'A24:L32',addEvidenceContinuations(book,request.specification||row.specification,assets));
 area(cover,'A33:L34','判定基準 Judgment Criteria',{fill:true,bold:true,center:true});area(cover,'A35:L41',addEvidenceContinuations(book,request.judgementCriteria||row.acceptance,assets,'判定續頁',250));
 area(cover,'A42:L43','試驗結果 Test Results',{fill:true,bold:true,center:true});area(cover,'A44:L49',demo?'DEMO：以下僅示範試驗紀錄流程，非實測結果；不得作為合格判定依據。':'');
 area(cover,'A50:L52','判定 Judgment：□ 合格 OK    □ 不合格 NG    ■ 待確認 Pending（須有實際證據後填寫）');
 area(cover,'A53:B60','實驗室\nLaboratory',{fill:true,center:true});
 for(const [label,header,sign,name]of [['承認 Approved by','C53:E54','C55:E58','C59:E60'],['確認 Confirmed by','F53:H54','F55:H58','F59:H60'],['作成 Issued by','I53:L54','I55:L58','I59:L60']]){area(cover,header,label,{fill:true,center:true});area(cover,sign,'');area(cover,name,'',{size:7,center:true});}
 const steps=trialProcedure(row);area(process,'A5:L7',`試驗項目：${row.name}    版本：${row.version}\n適用設備：${row.equipment}`,{bold:true});area(process,'A8:L12',`試驗條件／工時：${ref?.conditions||'依來源規範補齊'}；${row.durationHours}H\n${ref?.calendar||'尚未設定排程規則'}\nU 為 Demo 可用空間單位，不代表公升；設備實體規格保留原單位。`);
 for(const [i,step]of steps.entries()){const n=14+i*8;area(process,`A${n}:B${n+5}`,String(i+1).padStart(2,'0'),{fill:true,bold:true,size:14,center:true});area(process,`C${n}:L${n+5}`,step+'\n實際時間／執行人／證據編號：________________');}
 area(process,'A40:L42','試驗過程紀錄（空白，請按實際執行填寫）',{fill:true,bold:true});
 for(let i=0;i<4;i++){const n=43+i*4;area(process,`A${n}:C${n+3}`,'日期／時間：');area(process,`D${n}:J${n+3}`,'條件、觀察、中斷／恢復：');area(process,`K${n}:L${n+3}`,'執行人：');}
 area(results,'A5:L7',`委託編號：${request.id||''}    試驗：${row.name}\n規範版本：${row.version}    樣品編號：${request.execution?.sampleCode||''}`);
 for(const [range,value]of [['A9:B11','樣品／位置'],['C9:F11','量測值／單位'],['G9:J11','外觀／功能與異常'],['K9:L11','判定']])area(results,range,value,{fill:true,bold:true,center:true});
 for(let i=0;i<3;i++){const n=12+i*4;for(const range of [`A${n}:B${n+3}`,`C${n}:F${n+3}`,`G${n}:J${n+3}`,`K${n}:L${n+3}`])area(results,range,'');}
 area(results,'A25:L27','照片與證據｜下列為共用合成 Demo 圖，不是本次試驗實拍或量測證據。',{fill:true,bold:true});
 area(results,'A28:F41','');area(results,'G28:L41','');
 const environmental=['HIGH_TEMPERATURE','LOW_TEMPERATURE','HIGH_HUMIDITY','THERMAL_CYCLE','HUMIDITY_CYCLE'].includes(row.profileId);
 if(assets?.sample){const id=picture(book,results,assets.sample,{col:.15,row:27.2,width:333,height:200});book.getImage(id).name='SYNTHETIC_DEMO_NOT_TEST_EVIDENCE';}
 if(environmental&&assets?.placement){const id=picture(book,results,assets.placement,{col:6.15,row:27.2,width:333,height:200});book.getImage(id).name='SYNTHETIC_PLACEMENT_NOT_TEST_EVIDENCE';}
 area(results,'A42:F45','合成 Demo 樣品照片；非實拍，不代表任何試驗結果。',{size:8});area(results,'G42:L45',environmental?'合成環境箱擺放示意；非實際條件或曝露證據。':'實際試驗配置照片留白，請補入本類型設備／治具實拍與證據編號。',{size:8});
 area(results,'A47:B56','異常與處置',{fill:true});area(results,'C47:L56','');area(results,'A58:L60','量測結果與正式判定尚未填寫；不得以 Demo 圖片取代試驗證據。',{size:8});
 return {cover,process,results};
}
export function labTemplateProfile(book){
 const cover=book.getWorksheet('報告首頁');if(!cover||cover.getCell('J63').text!==LAB_FORM_VERSION||cover.getCell('C1').text!=='試驗報告單\nTest Report'||!book.getWorksheet('試驗過程')||!book.getWorksheet('結果與照片'))return null;
 for(const [cell,label]of [['C53','承認'],['F53','確認'],['I53','作成']])if(!cover.getCell(cell).text.includes(label))return null;
 for(const address of Object.values(LAB_SIGNATURE_CELLS))if(!cover.getCell(address).isMerged||cover.getCell(address).master.address!==address)return null;
 return {id:LAB_FORM_VERSION,sheetName:cover.name,cells:{...LAB_SIGNATURE_CELLS}};
}

export function addEvidenceContinuations(book,text,assets,prefix='規範續頁',threshold=500){
 if(typeof text!=='string'||text.length<=threshold)return text||'';
 const existing=book.worksheets.filter(s=>s.name.startsWith(prefix));
 if(existing.length){if(existing.map(s=>s.getCell('A5').text).join('')!==text)throw Error('續頁來源不一致，停止產生範本。');}
 else for(let offset=0,page=1;offset<text.length;offset+=800,page++){
  const s=sheet(book,prefix+page,prefix==='規範續頁'?'試驗規範／手法（續）':'判定基準（續）',assets,10+(prefix==='判定續頁'?20:0)+page);
  area(s,'A5:L58',text.slice(offset,offset+800),{size:9});
 }
 return `完整內容請見「${prefix}」。內容未截斷，須連同續頁審查。`;
}
