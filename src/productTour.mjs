import {SEED_ACCOUNTS,SEED_ACTORS,SEED_KEYS} from './nineStageSeed.mjs';
import {appendSignature} from './signatureHistory.mjs';
import {getRequestDate} from './requestDate.mjs';
import {memoryStorage} from './guidedTourStorage.mjs';
// Seed exactly one pending request. All subsequent business actions must come from the real UI.
export function createTourSeed({signature,now=Date.now()}={}){
 if(!/^data:image\/(png|jpeg);base64,/i.test(signature||''))throw Error('導覽需使用明確標示為 Demo 的模擬簽名');
 const storage=memoryStorage(Object.fromEntries(SEED_KEYS.map(key=>[key,'[]'])));
 const write=(key,value)=>storage.setItem(key,JSON.stringify(value));
 const actors=SEED_ACTORS,account=id=>SEED_ACCOUNTS.find(a=>a.id===id),id='TOUR-DEMO-001';
 // Explicit synthetic operating range, checked by the same scheduling guards as other equipment.
 const machine={id:'TOUR-EQ-001',name:'導覽環境試驗箱',category:'溫度試驗',model:'DEMO-120',location:'虛構實驗室 A',capacity:10,usableVolumeLitres:120,dailyHours:24,specification:'DEMO 合成設備規格：-40～150°C；120 L；非實機能力證明',status:'待機中',records:[]};
 const request={id,productCode:'TOUR-SAMPLE-A',product:'TOUR-SAMPLE-A',productType:'車用電子',project:'九階產品導覽',customer:'虛構導覽客戶',customerPartNo:'DEMO-PART-A',quantity:'1',sampleVolumeLitres:1,sampleSpaceUnits:1,durationHours:48,conditions:{temperatureMin:100,temperatureMax:100},purpose:['新產品'],sampleSource:['社內'],testItems:['高溫儲存試驗'],specification:'DEMO 合成高溫儲存：100°C，48 小時；非正式規範',judgementCriteria:'DEMO 外觀與功能確認',judgementRequired:'不作判定',notes:'產品導覽假資料；模擬簽名，無正式效力。',requester:account(actors.a).name,department:'虛構測試部門',ownerId:actors.a,ownerUser:account(actors.a).name,supervisorId:actors.manager,supervisorName:account(actors.manager).name,status:'待主管簽核',createdAt:new Date(now-3600000).toISOString(),dueDate:getRequestDate(new Date(now+7*86400000)),requesterSignature:signature,signatureRecords:[]};
 request.signatureRecords=appendSignature({...request,requesterSignature:''},{stage:'委託送出',actor:request.requester,actorId:actors.a,signature,decision:'送出',comment:'DEMO 導覽模擬簽名',at:new Date(now-60000).toISOString()});
 write('dqa-shared-demo-accounts-v1',SEED_ACCOUNTS);write('dqa-request-demo-v2',[request]);write('dqa-equipment-demo-v1',[machine]);write('dqa-completed-flow-provisioned-v1',{created:false});
 return {storage};
}
