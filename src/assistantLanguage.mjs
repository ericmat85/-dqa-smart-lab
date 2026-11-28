import {commandGuide} from './assistantCommands.mjs';
// Presentation language is a bounded preference, never an instruction or a role.
export const assistantLanguage=value=>value==='en'?'en':'zh-TW';
const questions={
 overview:'What is the current laboratory test status?',pending:'How many tests are awaiting scheduling?',running:'How many tests are currently running?',schedule:'How do I schedule a new test?',automatic:'How do I use AI automated scheduling?',conflict:'How do I resolve a scheduling conflict?',progress:'How is test progress calculated?',finish:'Is equipment released when a test finishes?',stop:'How do I stop a scheduled test?',standby:'How many devices are available for testing?',breakdown:'What should I do if equipment fails during a test?',calibration:'Can equipment be calibrated while in use?',history:'Where can I find equipment maintenance records?',materials:'Do materials occupy equipment schedules?',stock:'Which materials are below safety stock?',commands:'View AI assistant commands',return:'Is a signature required when returning a request?',report:'How do I export laboratory reports?','trial-reference':'Where can I find test specifications and equipment compatibility?',sync:'Is data synchronized and preserved after refresh?',
};
export const faqQuestion=(item,language)=>assistantLanguage(language)==='en'?questions[item.id]:item.question;
export function faqEnglishReply(item,reply,snapshot,metrics,system){
 if(item.id==='commands')return 'FAQ\n'+commandGuide('en');
 if(reply.includes('目前資料無法完整讀取'))return 'FAQ\nThe current data could not be read completely. Counts are unavailable; refresh or open the corresponding list.';
 const rows=snapshot?.labWorkItems||[],counts=metrics?.counts||{},equipment=snapshot?.equipment||[],count=s=>rows.filter(r=>r.status===s).length;
 if(system==='lab'){
  if(item.id==='overview')return `FAQ\nLaboratory work items: ${count('待確認')} awaiting receipt, ${count('已排程')} scheduled, ${count('試驗中')} running and ${count('已完成')} completed.`;
  if(item.id==='pending')return `FAQ\n${count('待確認')} work items await receipt and ${count('已排程')} are scheduled. Unscheduled requests are arranged in Laboratory Management.`;
  if(item.id==='running')return `FAQ\n${count('試驗中')} tests are running; ${count('已排程')} have been received and await their start.`;
  if(['schedule','automatic','conflict','stop'].includes(item.id))return 'FAQ\nScheduling, conflicts and stopping schedules are handled in Laboratory Management. In the laboratory workspace, confirm receipt or submit a cancellation/interruption request through the existing workflow.';
  if(item.id==='breakdown')return 'FAQ\nEquipment status is read-only here. Follow site procedures for the affected test and notify an authorized equipment manager.';
  if(item.id==='report')return 'FAQ\nAfter finishing a test, submit its report from Test Requests. The library provides permitted reports and templates. Use Reports in Laboratory Management for PDF/Excel statistical exports.';
 }
 if(item.id==='overview')return `FAQ\nCurrent data: ${counts['未排程']||0} awaiting scheduling, ${counts['已排程']||0} scheduled, ${counts['試驗中']||0} running and ${counts['已完成']||0} completed; ${equipment.length} devices in total.`;
 if(item.id==='pending')return `FAQ\n${counts['未排程']||0} tests await scheduling and ${counts['有衝突']||0} scheduling conflicts require review. Open Scheduling for details.`;
 if(item.id==='running')return `FAQ\n${counts['試驗中']||0} tests are running and ${counts['已排程']||0} are scheduled but have not started.`;
 if(item.id==='standby')return `FAQ\nThere are ${equipment.length} devices, including ${equipment.filter(r=>r.status==='待機中').length} on standby. Check availability, specifications and conflicts before scheduling.`;
 if(item.id==='stock')return metrics.lowStock.length?`FAQ\n${metrics.lowStock.length} materials are below safety stock: ${metrics.lowStock.slice(0,20).map(r=>`${r.name} (available ${r.available} ${r.unit}; safety stock ${r.minStock} ${r.unit})`).join(', ')}. Open Materials for the complete list.`:'FAQ\nNo materials in the current ledger are below safety stock.';
 const answers={
  schedule:'Open Scheduling, select a request and Edit Schedule. Select standby equipment, an operator, start and completion dates, then Save Schedule.',
  automatic:'Open Edit Schedule, enter the space per sample in U and select AI Automated Scheduling. Conditions come from existing test data; U is a Demo space unit, not litres. Equipment, people and time slots are checked before suggestions enter the draft. Save Schedule applies the draft. Missing data, network or budget errors are never automatically retried.',
  conflict:'Read the conflict details, choose available equipment or change the time slot, then save. The assistant does not change schedules.',
  progress:'After dates are saved, a test is scheduled before its start and running after its start; progress follows elapsed time. Type /demo accelerator in the assistant to open flow-test controls. Database mode advances an explicitly marked rehearsal copy and preserves production schedules, hours and reservations. The separate Demo advances received trials to 50% and then 100%.',
  finish:'A finished test becomes completed. Equipment returns to standby if no other test occupies it. Maintenance and calibration states are preserved.',
  stop:'Select Stop Schedule at the bottom of Edit Schedule. Review the scope before confirming cancellation of the request and related schedules; equipment is released according to occupancy.',
  breakdown:'First handle the affected test, then use Equipment Management to set maintenance status and a reason. Return it to standby after maintenance; start/end times and duration are recorded.',
  calibration:'Equipment in use cannot be changed directly to calibration. Finish or handle existing tests first. Equipment under maintenance or calibration cannot be scheduled.',
  history:'Open Equipment Management, select Equipment Information, then the operation history or calibration/maintenance tab. Completed work retains its times, reason and operator.',
  materials:'Materials use a separate ledger and do not occupy equipment schedules. Materials Management lists consumables, inspection devices, tools and fixtures.',
  signature:'Signature fields support handwriting, image upload and saved default signatures. Submitted signatures are available in the corresponding request and signature history.',
  return:'Returning a request requires a reason but can omit a signature; approval requires a signature. Resubmission follows the review workflow and preserves signature/return history.',
  report:'Open Reports and choose schedules, equipment, material stock or request review. Set search, status and dates, then Export Report as PDF or Excel. All matching records are exported.',
  'trial-reference':'Open Test and Equipment Parameters in System Management for the catalog, versions, duration and compatible equipment. Selecting a test in a new request shows an editable reference specification. Scheduling still checks equipment, available space U and occupancy.',
  sync:'This Demo uses local storage for the same website and browser. Saved changes update the dashboard and normally survive refresh. Clearing site data, changing browsers or changing devices does not share those records.',
 };
 return 'FAQ\n'+answers[item.id];
}
export function scopeReply(scope,language){
 if(assistantLanguage(language)!=='en')return scope.reply;
 return ({IDENTITY_SCOPE_DENIED:'I can answer laboratory operations and test questions, but cannot provide accounts, roles, permissions or credentials.',DQA_NOT_AVAILABLE:'DQA is not implemented yet. You can ask about laboratory tests, schedules, equipment, materials or reports.',NON_LAB_SCOPE_DENIED:'This assistant currently covers the laboratory system and test information. This question is outside that scope.'})[scope.code]||scope.reply;
}
