import test from 'node:test';import assert from 'node:assert/strict';
import {BUSINESS_MODEL_CATALOG,compatibleModelEvidence,modelOptions,verifiedModelCost} from '../src/businessModelCatalog.mjs';
const data={models:BUSINESS_MODEL_CATALOG.models.map(row=>({...row,available:true,contract_reason:row.reason,max_input_tokens:16384}))};
const form={max_output_tokens:768,per_call_usd:'0.05'};
test('catalog lists disabled choices with reasons and preserves eligible alternatives',()=>{
 const rows=modelOptions(data,form);assert.equal(rows.length,99);assert.equal(rows.filter(r=>r.selectable).length,3);
 for(const id of ['gpt-6.2-sol','gpt-image-2','gpt-4.1-mini']){const r=rows.find(r=>r.id===id);assert.equal(r.selectable,false);assert.ok(r.reason);}
});
test('budget and access changes disable a model immediately, without trusting its stale selectable flag',()=>{
 const reduced=modelOptions(data,{...form,per_call_usd:'0.01'});assert.equal(reduced.find(r=>r.id==='gpt-6-sol').selectable,false);assert.equal(reduced.find(r=>r.id==='gpt-6.1-terra').selectable,false);assert.equal(reduced.find(r=>r.id==='gpt-6-luna').selectable,true);
 assert.equal(modelOptions({models:[{...data.models.find(r=>r.id==='gpt-6-sol'),available:false,selectable:true}]},form)[0].selectable,false);
});
test('provider evidence accepts only approved documented profiles and the correct response model',()=>{
 for(const id of ['gpt-6-luna','gpt-6-sol','gpt-6.1-terra'])assert.equal(compatibleModelEvidence({model:id,requested_model:id}),true);
 for(const packet of [{model:'gpt-image-2'},{model:'gpt-6.2-sol'},{model:'gpt-6-sol',requested_model:'gpt-6-luna'}])assert.equal(compatibleModelEvidence(packet),false);
});

test('verified prices use exact integer accounting and reject cheaper-model costs or inconsistent model bindings',()=>{
 const packet={model:'gpt-6-sol',usage:{input_tokens:80,output_tokens:40},estimated_cost_usd:'0.00056'};assert.equal(verifiedModelCost(packet),true);assert.equal(verifiedModelCost({...packet,estimated_cost_usd:'0.000028'}),false);assert.equal(verifiedModelCost({...packet,model:'gpt-6.1-terra',estimated_cost_usd:'0.00028'}),true);assert.equal(verifiedModelCost({...packet,usage:{input_tokens:NaN,output_tokens:40}}),false);
});
