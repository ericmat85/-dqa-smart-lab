import test from 'node:test';
import assert from 'node:assert/strict';
import {fillLV1Demo,registerLV1Demo,lv1DemoManualFields} from '../src/lv1DemoCommand.mjs';
import {PREAPPROVAL_DERIVED,validateStageFields} from '../src/templateStageFields.mjs';
test('LV1 fill is scoped to the active LMS actor and never routes into another system',()=>{
 let calls=0;const close=registerLV1Demo({actorId:'lv1',run:()=>{calls++;return {ok:true,message:'filled'};}});
 for(const args of [{system:'lab',path:'/lab/dashboard',actorId:'lv1'},{system:'lms',path:'/lms/requests/history',actorId:'lv1'},{system:'lms',path:'/lms/requests',actorId:'other'}])assert.equal(fillLV1Demo(args).ok,false);
 assert.equal(calls,0);assert.equal(fillLV1Demo({system:'lms',path:'/lms/requests/',actorId:'lv1'}).ok,true);assert.equal(calls,1);close();assert.equal(fillLV1Demo({system:'lms',path:'/lms/requests',actorId:'lv1'}).ok,false);
});
test('old cleanup cannot unregister a newly opened LV1 form',()=>{const old=registerLV1Demo({actorId:'one',run:()=>({ok:false})});const next=registerLV1Demo({actorId:'two',run:()=>({ok:true})});old();assert.equal(fillLV1Demo({system:'lms',actorId:'two',path:'/lms/requests'}).ok,true);next();});
test('demo fields are valid manual inputs and never fabricate confirmed scheduling or numbering',()=>{const fields=lv1DemoManualFields({dueDate:'2027-02-10'});assert.equal(fields.reportDueDate,'2027-02-10');assert.deepEqual(validateStageFields('LMS_1',fields,[]),{permitTypes:['other'],permitOther:'Demo 合成試驗需求',allowed:'yes',criteriaClear:'yes',resourcesReady:'yes',reportDueDate:'2027-02-10'});for(const key of PREAPPROVAL_DERIVED)assert.equal(Object.hasOwn(fields,key),false);assert.equal(lv1DemoManualFields({dueDate:'bad'}).reportDueDate,'');});

test('permit type follows the virtual request purpose',()=>{assert.deepEqual(lv1DemoManualFields({purpose:['設計變更 Design change','新產品 New product']}).permitTypes,['new_product','design_change']);assert.equal(lv1DemoManualFields({purpose:['量產品']}).permitOther,'量產品');});
