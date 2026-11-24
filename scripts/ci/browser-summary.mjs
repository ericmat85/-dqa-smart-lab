import {readFile,appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

// Diagnostic metadata only: never include raw assertions, response bodies or env values.
const text=value=>String(value??'').slice(0,160).replace(/[\r\n]+/g,' ').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[\\`*_[\]{}()|#!]/g,'\\$&');
export function browserSummary(report,{outcome='unknown',unavailable=false}={}){
 const lines=['## Browser test summary','',`Test step outcome: **${text(outcome)}**. The test step remains authoritative; this summary does not change its result.`,''];
 if(unavailable||!report||typeof report!=='object'||Array.isArray(report)||!report.stats)return lines.concat('The JSON report is missing or unreadable. No passing result can be inferred; inspect the test step log.','').join('\n');
 const stats=report.stats||{};
 lines.push('| Expected | Unexpected | Flaky | Skipped |','| --- | --- | --- | --- |',`| ${Number(stats.expected)||0} | ${Number(stats.unexpected)||0} | ${Number(stats.flaky)||0} | ${Number(stats.skipped)||0} |`,'');
 const failures=[];
 function visit(suite){
  for(const spec of suite.specs||[])for(const test of spec.tests||[])if(test.status==='unexpected'){
   const result=test.results?.at(-1);failures.push({title:spec.title,file:spec.file||suite.file,line:spec.line,project:test.projectName,status:result?.status||test.status});
  }
  for(const child of suite.suites||[])visit(child);
 }
 visit(report);
 if(failures.length){lines.push('### Unexpected tests','');for(const f of failures.slice(0,40))lines.push(`- ${text(f.title)} — ${text(f.file)}:${Number(f.line)||0}; project: ${text(f.project||'default')}; status: ${text(f.status)}.`);if(failures.length>40)lines.push(`- ${failures.length-40} additional failures; see the test step log.`);lines.push('');}
 if(report.errors?.length)lines.push(`Global runner errors: ${report.errors.length}. See the test step log; raw errors are intentionally omitted.`, '');
 lines.push('Detailed traces and files are uploaded separately when artifact storage is available. This summary uses the job summary and does not require an artifact upload.','');
 return lines.join('\n');
}
export async function publishBrowserSummary({reportPath,summaryPath,outcome}){
 let report,unavailable=false;try{report=JSON.parse(await readFile(reportPath,'utf8'));}catch{unavailable=true;}
 const summary=browserSummary(report,{outcome,unavailable});
 if(summaryPath)await appendFile(summaryPath,summary);else process.stdout.write(summary);
 return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await publishBrowserSummary({reportPath:process.argv[2]||'test-results/results.json',summaryPath:process.env.GITHUB_STEP_SUMMARY,outcome:process.env.BROWSER_TEST_OUTCOME||'unknown'});
