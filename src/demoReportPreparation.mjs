import {createReportTemplate,inspectReport} from './reportWorkbook.mjs';
export const DEMO_REVIEW_PASSED='通過 AI 全檢（Demo 規則模擬）';
export function passedDemoReview(check){
 return check?.engine==='Demo 規則式防呆檢查'&&check.ok===true&&Array.isArray(check.checks)&&check.checks.length>0&&check.checks.every(row=>row.ok===true);
}
// Run the same validator used by submission. Never pre-assign a successful flag
// or advance a case's business status just because the Demo button was clicked.
export async function prepareDemoReport(request,options={}){
 if(!request?.id)throw Error('找不到本案委託資料，無法產生 Demo 報告。');
 const bytes=await createReportTemplate(request,true,options),fileName=`${request.id}-DEMO.xlsx`;
 const check=await inspectReport(bytes,request.id,fileName,request);
 if(!passedDemoReview(check)){const error=Error('Demo 報告未通過目前規則，請查看檢查項目。');error.check=check;throw error;}
 return {bytes,fileName,check};
}
