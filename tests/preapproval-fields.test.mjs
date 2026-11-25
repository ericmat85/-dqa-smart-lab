import test from 'node:test';
import assert from 'node:assert/strict';
import {preapprovalRequired,preapprovalPlanCurrent,preparationFields,preparationChecksReady} from '../src/preapprovalFields.mjs';
import {documentValues} from '../src/documentCellMapping.mjs';
import {requestAction} from '../src/requestWorkflowClient.mjs';
const context={document_id:'doc',request_revision:3,sample_code:'S1',sample_revision:1,draft:{document_version_id:'doc',request_revision:3,revision:2,plan:{sample_code:'S1',sample_revision:1}}};
const fields={sampleCorrect:'yes',sampleQuantity:3,sampleReceivedDate:'2026-11-25',fixturesReady:'yes',operationFamiliar:'yes',outsourceBooked:'not_applicable'};
test('first review requires explicit manual checks while derived fields come from the plan',()=>{
 const required=preapprovalRequired(['lms1SampleCode','lms1Equipment1','lms1PlannedOperator','lms1AllowedYesCheck'].map(field=>({field})));
 assert.deepEqual(required,['allowed','permitTypes','criteriaClear','resourcesReady']);
 assert.equal(requestAction({databaseId:'r',sourceRevision:3},'LMS_APPROVE',{planRevision:2}).plan_revision,2);
});
test('sample edits, new document and background revisions invalidate the plan',()=>{
 assert.equal(preapprovalPlanCurrent(context),true);
 for(const c of [{...context,sample_revision:2},{...context,document_id:'new'},{...context,request_revision:4}])assert.equal(preapprovalPlanCurrent(c),false);
 assert.equal(preapprovalPlanCurrent(context,'UNSAVED'),false);
});
test('preparation fields have no default answers and abnormal drafts remain editable',()=>{
 assert.throws(()=>preparationFields({}));assert.deepEqual(preparationFields(fields),fields);
 const abnormal={...fields,sampleCorrect:'no'};assert.deepEqual(preparationFields(abnormal),abnormal);assert.equal(preparationChecksReady(abnormal),false);
 assert.equal(preparationChecksReady(fields),true);assert.equal(preparationChecksReady(fields,true),false);
 assert.equal(preparationChecksReady({...fields,outsourceBooked:'yes'},true),true);
 for(const patch of [{fixturesReady:'no'},{operationFamiliar:'no'},{sampleQuantity:0},{sampleReceivedDate:''}])assert.equal(preparationChecksReady({...fields,...patch}),false);
});
test('unsigned preparation renders checks but never a signature; completion cannot overwrite pre-start checks',()=>{
 const c={preflight_required:true,flow_version:'LEGACY',stages:{LAB_PREPARE:{actor:'Draft author',at:'2026-11-25T00:00:00Z',fields},LAB_COMPLETE:{fields:{executionAbnormal:'yes',abnormalDescription:'Later result'}}}};
 const before=documentValues(c);assert.equal(before.labSampleQuantity,3);assert.equal(before.labSampleCorrectYesCheck,'☑');assert.equal(before.labReceiptSignature,'');assert.equal(before.labReceiptName,'');assert.equal(before.labReceiptSignedDate,'');assert.equal(before.labExecutionAbnormalYesCheck,'☐');
 const after=documentValues({...c,stages:{...c.stages,LAB_RECEIVE:{fields:{...fields,executionAbnormal:'no'},actor:'Executor',at:'2026-11-25T00:00:00Z'}}});
 assert.equal(after.labExecutionAbnormalNoCheck,'☑');assert.equal(after.labAbnormalDescription,'');assert.equal(after.labReceiptName,'Executor');
});
