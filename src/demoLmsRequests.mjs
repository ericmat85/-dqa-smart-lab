let seed=20261028;
const demoRandom=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const INITIAL_REQUESTS = [
 { id:"REQ-2026-001", title:"高溫儲存試驗", department:"研發部", applicant:"王工程師", priority:"高", submitted:"2026/10/22", status:"待審查", approval:0, productCode:"VCU-2026-A01", productType:"車用電子控制器", customerName:"造隆股份有限公司", customerPartNo:"CL-VCU-001", requestedDate:"2026/10/28", quantity:"5", intentions:["新產品","設計變更"], sampleSource:["內部","客戶"], productVersion:"V1.2", pcbaVersion:"PCB-A03", softwareVersion:"SW-2.6.1", manufactureDate:"2026/10/15", specification:"高溫儲存試驗：依客戶規格及內部試驗計畫執行。", judgment:"試驗後功能正常，外觀無異常。", remarks:"請依最新版試驗規範執行。", history:["2026/10/22 09:15 王工程師提交委託"] },
 { id:"REQ-2026-002", title:"溫濕度循環試驗", department:"DQA 實驗室", applicant:"陳工程師", priority:"中", submitted:"2026/10/21", status:"完成", approval:2, productCode:"METER-2026-B02", productType:"車用儀表", customerName:"造隆股份有限公司", customerPartNo:"CL-MTR-002", requestedDate:"2026/10/27", quantity:"3", intentions:["設計變更"], sampleSource:["內部製作"], productVersion:"V2.0", pcbaVersion:"PCB-B02", softwareVersion:"SW-1.8.0", manufactureDate:"2026/10/10", specification:"依溫濕度循環試驗規範執行。", judgment:"試驗後功能正常。", remarks:"完成雙階簽核。", history:["2026/10/21 10:00 提交委託","2026/10/21 11:00 第一階主管核准","2026/10/21 14:30 第二階主管核准"] },
 { id:"REQ-2026-003", title:"振動耐久試驗", department:"研發部", applicant:"林工程師", priority:"高", submitted:"2026/10/20", status:"退回", approval:0, productCode:"VCU-2026-C03", productType:"車用電子控制器", customerName:"造隆股份有限公司", customerPartNo:"CL-VCU-003", requestedDate:"2026/10/29", quantity:"4", intentions:["再現試驗"], sampleSource:["廠商"], productVersion:"V1.1", pcbaVersion:"PCB-C01", softwareVersion:"SW-2.4.0", manufactureDate:"2026/10/08", specification:"依振動耐久試驗規範執行。", judgment:"需補充測試條件與樣品數量依據。", remarks:"補件後重新送審。", history:["2026/10/20 08:30 提交委託","2026/10/20 13:00 第一階主管退回：請補充試驗條件"] },
 { id:"REQ-2026-004", title:"IPX6 防水試驗", department:"品保部", applicant:"張工程師", priority:"低", submitted:"2026/10/19", status:"取消", approval:0, productCode:"LAMP-2026-D04", productType:"車用燈具", customerName:"造隆股份有限公司", customerPartNo:"CL-LMP-004", requestedDate:"2026/10/30", quantity:"2", intentions:["量產品"], sampleSource:["廠商"], productVersion:"V1.0", pcbaVersion:"N/A", softwareVersion:"N/A", manufactureDate:"2026/10/05", specification:"依 IPX6 防水試驗規範執行。", judgment:"依試驗規格判定。", remarks:"申請人取消委託。", history:["2026/10/19 15:00 提交委託","2026/10/20 09:00 申請人取消"] },

];

// 補足至 50 筆展示用委託資料；新增資料的狀態在每次載入時隨機分配。
const DEMO_TEST_TITLES = ["高低溫循環試驗", "耐久振動試驗", "鹽霧腐蝕試驗", "溫濕度循環試驗", "IPX6 防水試驗", "高溫高濕試驗", "日照耐候試驗", "ESD 靜電試驗", "跌落試驗", "接插件插拔試驗", "電壓變動試驗", "低溫啟動試驗"];
const DEMO_DEPARTMENTS = ["研發部", "DQA 實驗室", "品保部", "電子設計部", "產品工程部"];
const DEMO_APPLICANTS = ["王工程師", "陳工程師", "林工程師", "張工程師", "李工程師", "周工程師"];
const DEMO_STATUSES = ["待審查", "完成", "取消", "退回"];
const EXTRA_DEMO_REQUESTS = Array.from({ length: 46 }, (_, index) => {
  const number = index + 5;
  const status = DEMO_STATUSES[Math.floor(demoRandom() * DEMO_STATUSES.length)];
  const title = DEMO_TEST_TITLES[Math.floor(demoRandom() * DEMO_TEST_TITLES.length)];
  const applicant = DEMO_APPLICANTS[Math.floor(demoRandom() * DEMO_APPLICANTS.length)];
  const department = DEMO_DEPARTMENTS[Math.floor(demoRandom() * DEMO_DEPARTMENTS.length)];
  const day = String(1 + Math.floor(demoRandom() * 25)).padStart(2, "0");
  const approval = status === "完成" ? 2 : 0;
  return {
    id: `REQ-2026-${String(number).padStart(3, "0")}`,
    title,
    department,
    applicant,
    priority: ["高", "中", "低"][Math.floor(demoRandom() * 3)],
    submitted: `2026/10/${day}`,
    status,
    approval,
    productCode: `DEMO-${String(number).padStart(3, "0")}`,
    productType: ["車用電子控制器", "車用儀表", "車用燈具", "電子模組"][Math.floor(demoRandom() * 4)],
    customerName: "造隆股份有限公司",
    customerPartNo: `CL-DEMO-${String(number).padStart(3, "0")}`,
    requestedDate: `2026/11/${String(1 + Math.floor(demoRandom() * 28)).padStart(2, "0")}`,
    quantity: String(1 + Math.floor(demoRandom() * 10)),
    intentions: [["新產品"], ["設計變更"], ["量產品"], ["再現試驗"]][Math.floor(demoRandom() * 4)],
    sampleSource: [["內部製作"], ["客戶"], ["廠商"], ["供應商"]][Math.floor(demoRandom() * 4)],
    productVersion: `V${1 + Math.floor(demoRandom() * 3)}.${Math.floor(demoRandom() * 10)}`,
    pcbaVersion: `PCB-${String.fromCharCode(65 + Math.floor(demoRandom() * 5))}0${1 + Math.floor(demoRandom() * 4)}`,
    softwareVersion: `SW-${1 + Math.floor(demoRandom() * 3)}.${Math.floor(demoRandom() * 10)}.0`,
    manufactureDate: `2026/10/${String(1 + Math.floor(demoRandom() * 25)).padStart(2, "0")}`,
    specification: `依${title}相關客戶規格及內部試驗計畫執行。`,
    judgment: "依核准之試驗規格判定。",
    remarks: status === "退回" ? "請補充試驗條件或樣品資訊。" : "Demo 展示資料。",
    history: [`2026/10/${day} 09:00 ${applicant}提交委託`, ...(status === "完成" ? ["主管完成雙階核准"] : status === "退回" ? ["主管退回：請補充資料"] : status === "取消" ? ["申請人取消委託"] : [])]
  };
});

export const ALL_DEMO_REQUESTS = [...INITIAL_REQUESTS, ...EXTRA_DEMO_REQUESTS];

