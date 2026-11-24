import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {browserSummary,publishBrowserSummary} from '../scripts/ci/browser-summary.mjs';

test('summary preserves failed outcome and identifies nested unexpected tests without exporting assertions',()=>{
 const report={stats:{expected:2,unexpected:1,flaky:1,skipped:3},suites:[{suites:[{file:'e2e/example.spec.js',specs:[{title:'Failed trial <img> | [link](https://invalid)',line:12,tests:[{projectName:'desktop',status:'unexpected',results:[{status:'failed',error:{message:'PRIVATE_ASSERTION_CONTENT'}}]}]},{title:'retried and passed',tests:[{status:'flaky',results:[{status:'failed'},{status:'passed'}]}]}]}]}],errors:[{message:'PRIVATE_RUNNER_ERROR'}]};
 const result=browserSummary(report,{outcome:'failure'});
 assert.match(result,/outcome: \*\*failure\*\*/);assert.match(result,/\| 2 \| 1 \| 1 \| 3 \|/);assert.match(result,/e2e\/example\.spec\.js:12/);assert.match(result,/&lt;img&gt;/);assert.ok(!result.includes('[link]('));assert.ok(!result.includes('PRIVATE_ASSERTION_CONTENT'));assert.ok(!result.includes('PRIVATE_RUNNER_ERROR'));assert.ok(!result.includes('retried and passed'));
});
test('missing or malformed JSON appends a diagnostic without claiming the tests passed',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dqa-ci-summary-'));
 try{
  const summaryPath=join(dir,'summary.md'),reportPath=join(dir,'report.json');await writeFile(summaryPath,'Existing summary\n');
  await publishBrowserSummary({reportPath,summaryPath,outcome:'failure'});await writeFile(reportPath,'{bad json');await publishBrowserSummary({reportPath,summaryPath,outcome:'cancelled'});
  const result=await readFile(summaryPath,'utf8');assert.match(result,/^Existing summary/);assert.match(result,/failure/);assert.match(result,/cancelled/);assert.equal(result.match(/No passing result can be inferred/g).length,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('summaries are bounded even when many tests fail',()=>{
 const report={stats:{unexpected:500},suites:[{specs:Array.from({length:500},()=>({title:'x'.repeat(1000),file:'f'.repeat(1000),tests:[{status:'unexpected',results:[{status:'timedOut'}]}]}))}]};
 const result=browserSummary(report,{outcome:'failure'});assert.ok(Buffer.byteLength(result)<32000);assert.match(result,/460 additional failures/);
});
