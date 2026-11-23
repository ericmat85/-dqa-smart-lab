import test from 'node:test';import assert from 'node:assert/strict';
import {memoryStorage} from '../src/guidedTourStorage.mjs';import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
import {defaultTrialCatalog} from '../src/trialCatalogStore.mjs';import {makeTrialTemplateWorkbook} from '../src/trialTemplateWorkbook.mjs';
import {saveUploadedTemplate,readUploadedTemplate} from '../src/reportTemplateStore.mjs';
const access={actorId:'U001',system:'lms',syntheticConfirmed:true};
function fixture(){const values=new Map();return {storage:memoryStorage({'dqa-shared-demo-accounts-v1':JSON.stringify(INITIAL_ACCOUNTS)}),repo:{values,async list(){return [...values.values()];},async get(id){return values.get(id);},async put(record,authorize){authorize();values.set(record.id,record);}}};}
test('uploaded trial classification must match actual workbook contents before storing or downloading',async()=>{const {storage,repo}=fixture(),trial=defaultTrialCatalog()[2],bytes=await makeTrialTemplateWorkbook(trial),file=new File([bytes],'synthetic.xlsx');
 await assert.rejects(saveUploadedTemplate(file,{...access,trialId:'TRIAL-006'},storage,repo),/不一致/);assert.equal(repo.values.size,0);
 const value=await saveUploadedTemplate(file,{...access,trialId:trial.id},storage,repo);assert.equal(value.trialBinding.status,'VERIFIED');assert.equal(value.trialBinding.trialId,trial.id);assert.equal((await readUploadedTemplate(value.id,access,storage,repo)).trialBinding.status,'VERIFIED');
 const stored=repo.values.get(value.id);repo.values.set(value.id,{...stored,trialId:'TRIAL-006',trialBinding:undefined});await assert.rejects(readUploadedTemplate(value.id,access,storage,repo),/不一致/);assert.equal(repo.values.get(value.id).sha256,stored.sha256);
});
test('custom reports remain independent versions and a trial report cannot be mislabeled as blank request',async()=>{const {storage,repo}=fixture(),bytes=await makeTrialTemplateWorkbook(defaultTrialCatalog()[0]),file=new File([bytes],'synthetic.xlsx');await assert.rejects(saveUploadedTemplate(file,{...access,trialId:'BLANK'},storage,repo),/空白委託單/);await assert.rejects(saveUploadedTemplate(file,{...access,trialId:'TRIAL-999'},storage,repo),/不存在/);const result=await saveUploadedTemplate(file,{...access,trialId:'CUSTOM'},storage,repo);assert.equal(result.trialBinding.status,'CUSTOM_ONLY');});
