export const SAMPLE_SOURCE_OPTIONS=[
 {key:'sourceInHouse',content:'sourceInHouseContent',label:'社內',value:'社內 In-house production'},
 {key:'sourceOverseas',content:'sourceOverseasContent',label:'海外廠',value:'海外廠 Overseas factory'},
 {key:'sourceCustomer',content:'sourceCustomerContent',label:'客戶',value:'客戶 Customer'},
 {key:'sourceSupplier',content:'sourceSupplierContent',label:'廠商',value:'廠商 Supplier'},
 {key:'sourceCompetitor',content:'sourceCompetitorContent',label:'競品',value:'競品 Competing products'},
];
export const PURPOSE_OPTIONS=[
 {key:'purposeNewProduct',label:'新產品',value:'新產品 New Product',matches:/^(新產品|新品試驗|new product)/i},
 {key:'purposeEV',label:'EV/手工品',value:'手工品 EV',matches:/^(手工品|EV(?:\b|\/))/i},
 {key:'purposeReproduction',label:'再現試驗',value:'再現試驗 Reproducibility test',matches:/^(再現試驗|reproducibility)/i},
 {key:'purposeOtherSelected',label:'其他（請說明）',value:'其他（請說明）Other',matches:/^(其他|other\b)/i},
 {key:'purposeDesignChange',label:'設計變更',value:'設計變更 Design change',matches:/^(設計變更|design change)/i},
 {key:'purposeDV',label:'DV/型物品',value:'型物品 DV',matches:/^(型物品|DV(?:\b|\/))/i},
 {key:'purposePeriodic',label:'定期抽測',value:'定期抽測 Periodic sampling inspection',matches:/^(定期抽測|periodic)/i},
 {key:'purposeMassProduct',label:'量產品',value:'量產品 Mass product',matches:/^(量產品|mass product)/i},
 {key:'purposePV',label:'PV/本型本工程',value:'本型本工程 PV',matches:/^(本型本工程|PV(?:\b|\/))/i},
];
export function sourceSelected(value,option){return Array.isArray(value?.sampleSource)&&value.sampleSource.some(v=>typeof v==='string'&&(v===option.value||v.startsWith(option.label)));}
export function sampleSourceContent(value,option){
 if(!sourceSelected(value,option))return '';
 if(typeof value?.[option.content]==='string')return value[option.content];
 // An old shared description can only be attributed when one source was selected.
 return value?.sampleSource?.length===1&&typeof value.sampleSourceOther==='string'?value.sampleSourceOther:'';
}
export function normalizeSourceContents(value={}){return Object.fromEntries(SAMPLE_SOURCE_OPTIONS.map(option=>[option.content,sampleSourceContent(value,option)]));}
export function sampleSourcesComplete(value){
 if(!Array.isArray(value?.sampleSource)||!value.sampleSource.length)return true;
 const modern=SAMPLE_SOURCE_OPTIONS.some(o=>Object.hasOwn(value,o.content));
 if(!modern)return !!value.sampleSourceOther?.trim();
 return value.sampleSource.every(v=>SAMPLE_SOURCE_OPTIONS.some(o=>v===o.value||v.startsWith(o.label)))&&SAMPLE_SOURCE_OPTIONS.filter(o=>sourceSelected(value,o)).every(o=>sampleSourceContent(value,o).trim());
}
export function formatSampleSources(value){
 const selected=SAMPLE_SOURCE_OPTIONS.filter(o=>sourceSelected(value,o)),modern=SAMPLE_SOURCE_OPTIONS.some(o=>Object.hasOwn(value||{},o.content));if(!selected.length)return modern?'':value?.sampleSourceOther||'';
 if(!modern)return [value.sampleSource.join('、'),value.sampleSourceOther].filter(Boolean).join('：');
 return selected.map(o=>o.label+(sampleSourceContent(value,o)?`：${sampleSourceContent(value,o)}`:'')).join('；');
}
export function purposeSelected(value,option){return Array.isArray(value?.purpose)&&value.purpose.some(v=>typeof v==='string'&&option.matches.test(v));}
