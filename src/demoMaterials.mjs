export const MATERIAL_KEY='dqa-materials-demo-v1';
export const MATERIAL_STATUSES=['可用','使用中','借出','維護中','校驗中','缺料','停用'];
const definitions=[
  ['耐熱膠帶','物料耗材','TAPE-25','25 mm × 33 m；耐熱固定用途',24,18,'卷','耗材櫃 A・01',5],
  ['無塵擦拭布','物料耗材','WIPE-100','100 張／包；儀器外觀清潔',30,12,'包','耗材櫃 A・02',8],
  ['防靜電手套','物料耗材','ESD-GLOVE-M','M 號；無塵包裝；防靜電作業',50,36,'雙','耗材櫃 A・03',10],
  ['導熱矽脂','物料耗材','THERMAL-100','100 g／罐；測試治具導熱介面',10,2,'罐','耗材櫃 A・04',3],
  ['扭力起子 #01','工具','TORQUE-05','可調範圍 0.5～5 N·m',1,1,'支','工具櫃 B・01',0],
  ['扭力起子 #02','工具','TORQUE-05','可調範圍 0.5～5 N·m',1,0,'支','工具櫃 B・02',0],
  ['數位電表 #01','工具','DMM-6000','6,000 counts；電壓／電阻／導通量測',1,1,'台','工具櫃 B・03',0],
  ['數位游標卡尺','工具','CALIPER-150','量測範圍 0～150 mm；解析度 0.01 mm',1,0,'支','工具櫃 B・04',0],
  ['恆溫焊台','工具','SOLDER-90','設定溫度 200～450°C；額定 90 W',1,0,'台','工作桌 B・05',0],
  ['儀表固定治具 A','治具配件','FIX-METER-A','TFT／LCD 儀表固定；可調孔距',4,3,'組','治具架 C・01',1],
  ['防水接線治具','治具配件','FIX-WATER-01','防水試驗線束固定；含轉接端子',3,1,'組','治具架 C・02',1],
  ['振動固定底板','治具配件','FIX-VIB-300','300 × 300 mm；鋁合金底板',2,2,'片','治具架 C・03',1],
  ['儀表完檢機 #01','完檢機','EOL-METER-01','儀表顯示、指示燈及按鍵功能檢查',1,1,'台','完檢區 D・01',0],
  ['儀表完檢機 #02','完檢機','EOL-METER-01','儀表顯示、指示燈及按鍵功能檢查',1,0,'台','完檢區 D・02',0],
  ['控制器完檢機','完檢機','EOL-VCU-02','控制器 I/O、通訊與基本功能檢查',1,0,'台','完檢區 D・03',0],
  ['直流電源供應器 #01','輔助儀器','PSU-30-10','輸出 0～30 V／0～10 A；單通道',1,1,'台','儀器架 E・01',0],
  ['直流電源供應器 #02','輔助儀器','PSU-30-10','輸出 0～30 V／0～10 A；單通道',1,0,'台','儀器架 E・02',0],
  ['溫度記錄器','輔助儀器','LOGGER-8CH','8 通道；K 型熱電偶輸入',1,0,'台','儀器架 E・03',0],
  ['防靜電工作墊','治具配件','MAT-ESD-120','1,200 × 600 mm；附接地線',6,4,'張','工具櫃 B・06',2],
  ['端子連接器備品盒','物料耗材','CONN-KIT-A','常用端子、接頭與防水塞備品套組',8,0,'盒','耗材櫃 A・05',2],
];
export const DEMO_MATERIALS=definitions.map((row,index)=>{
  const [name,category,model,specification,quantity,available,unit,location,minStock]=row;
  const id=`MAT-${String(index+1).padStart(3,'0')}`;
  const status=({5:'借出',7:'校驗中',8:'維護中',13:'使用中',14:'停用',16:'借出',17:'使用中',19:'缺料'})[index] || '可用';
  return {id,name,category,model,specification,quantity,available,unit,location,minStock,status,
    owner:['陳工程師','林工程師','王工程師','黃小明'][index%4],manufacturer:'DQA 示範供應商（虛構）',
    serial:`DEMO-MAT-2026-${String(index+1).padStart(3,'0')}`,purchasedAt:'2026-09-01',
    notes:'實驗室輔助物料，不占用設備排程；領用前請確認數量與物品狀況。',
    records:[{id:`INITIAL-${id}`,date:'2026-10-28T01:00:00Z',type:'建檔',actor:'示範管理員',result:`初始狀態：${status}`,detail:`建立 ${quantity} ${unit}物料，可用數量 ${available} ${unit}。`}],
  };
});

export function changeMaterialStatus(rows,{id,status,reason,actor,actorId}) {
  const row=rows.find(item=>item.id===id);
  if(!row)throw Error('請選擇物料。');
  if(!MATERIAL_STATUSES.includes(status))throw Error('請選擇有效的物料狀態。');
  if(row.status===status)throw Error('新狀態與目前狀態相同。');
  if(!String(reason||'').trim())throw Error('請填寫變更原因。');
  if(!actor || !actorId)throw Error('請重新登入後再操作。');
  return rows.map(item=>item.id===id ? {...item,status,records:[{id:globalThis.crypto.randomUUID(),date:new Date().toISOString(),type:'狀態變更',actor,actorId,result:`${item.status} → ${status}`,detail:reason.trim()},...(item.records||[])]} : item);
}
