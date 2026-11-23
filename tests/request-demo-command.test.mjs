import test from 'node:test';
import assert from 'node:assert/strict';
import {requestDemoStartIntent as intent,requestDemoStartStatus as status,requestDemoReply} from '../src/requestDemoCommand.mjs';
const defaults={executionKind:'REAL',demoFilled:false,productCode:'',testItems:[],quantity:'1',priority:'一般',judgementRequired:'需作判定',requester:'',department:''};
const blank={canCreate:true,isEditor:true,busy:false,editingId:null,defaults,form:{...defaults,requester:'Current user',department:'Current department',supervisorId:'manager-id'}};
test('only the explicit command triggers local demo fill',()=>{
 for(const text of ['/demo start','  /demo start  ','/DEMO START','/demo\tstart'])assert.equal(intent(text),true);
 for(const text of ['請輸入 /demo start','/demo start now','/demo\nstart','/demo starting','/demo','',null])assert.equal(intent(text),false);
});
test('a blank new form accepts automatic identity values, but every user change is protected',()=>{
 assert.equal(status(blank),'READY');
 for(const [key,value] of Object.entries({productCode:'USER',testItems:['custom trial'],quantity:'2',priority:'急件',judgementRequired:'不需作判定'}))assert.equal(status({...blank,form:{...blank.form,[key]:value}}),'NOT_EMPTY',key);
 assert.equal(status({...blank,signature:'data:image/png;base64,c2ln'}),'NOT_EMPTY');
 assert.equal(status({...blank,form:{...blank.form,executionKind:'VIRTUAL',demoFilled:true}}),'NOT_EMPTY');
});
test('saved drafts, unauthorized users and busy operations are rejected before filling',()=>{
 assert.equal(status({...blank,canCreate:false}),'DENIED');
 assert.equal(status({...blank,isEditor:false}),'EDITOR_REQUIRED');
 for(const executionKind of ['REAL','VIRTUAL'])assert.equal(status({...blank,editingId:'saved-id',form:{...blank.form,executionKind}}),'SAVED_DRAFT');
 assert.equal(status({...blank,busy:true}),'BUSY');
});
test('command responses explain manual submission and use the selected language',()=>{
 assert.match(requestDemoReply('FILLED'),/確認內容後按「送出主管簽核」/);
 assert.match(requestDemoReply('FILLED','en'),/Review the form, then submit/);
 assert.match(requestDemoReply('NOT_EMPTY'),/已有內容/);
 assert.match(requestDemoReply('DENIED','en'),/cannot create/);
});
