import {readFile} from 'node:fs/promises';
import {prepareDemoReport} from '../src/demoReportPreparation.mjs';
export async function uploadDemoReport(page){
 const request=await page.evaluate(async()=>{const {appStorage}=await import('/src/originalBusiness.mjs');const storage=appStorage(),id=document.querySelector('.report-submit-modal>p')?.textContent?.split(' · ')[0],rows=JSON.parse(storage.getItem('dqa-request-demo-v2')||'[]');return rows.find(q=>q.id===id)||rows[0];});
 const result=await prepareDemoReport(request,{requireTrialMatch:true,templateBytes:await readFile('public/templates/general-performance-v1.xlsx')});
 await page.locator('#lab-report-file').setInputFiles({name:result.fileName,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(result.bytes)});
 await page.getByRole('button',{name:'重新檢查報告',exact:true}).click();await page.getByLabel('上傳簽名檔',{exact:true}).check();await page.locator('.dqa-signature-input input[type=file]').setInputFiles({name:'synthetic-signature.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1kAAAAASUVORK5CYII=','base64')});return result;
}
