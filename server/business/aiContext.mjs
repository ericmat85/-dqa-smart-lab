// Keep every selected value and citation while avoiding repeated JSON field names.
export function compactAIContext(context){
 const clean=JSON.parse(JSON.stringify(context));
 if(!Array.isArray(clean.records)||clean.records.length<4)return clean;
 const tables=[];
 for(const record of clean.records){
  const columns=Object.keys(record).sort(),schema=JSON.stringify(columns),last=tables.at(-1);
  if(last&&JSON.stringify(last.columns)===schema)last.rows.push(columns.map(k=>record[k]));
  else tables.push({columns,rows:[columns.map(k=>record[k])]});
 }
 const candidate={...clean,records_format:'columnar-v1',record_count:clean.records.length,record_tables:tables};delete candidate.records;
 return Buffer.byteLength(JSON.stringify(candidate))<Buffer.byteLength(JSON.stringify(clean))?candidate:clean;
}

export function conciseAIQuestion(engine,question){
 const guide=engine==='E3'
  ?'輸出需符合指定 JSON 結構。摘要一句，各章節一句短句，總敘述約 180 個中文字內；保留來源引用與待補證據。章節名稱過長時可簡稱。'
  :'輸出需符合指定 JSON 結構。摘要一句，優先列出至多三項重要發現，每項一句短句，總敘述約 180 個中文字內；保留來源引用與必要限制。';
 return question.length+guide.length+2<=4000?question+'\n\n'+guide:question;
}

// Prior generated replies are interpretation hints, not current source evidence.
// Keep complete turns only and disclose omissions instead of cutting any text.
export function boundedAIHistory(history,maxBytes=512){
 if(!Array.isArray(history)||!history.length)return {};
 const kept=[];
 for(const turn of history){
  if(Buffer.byteLength(JSON.stringify([...kept,turn]))>maxBytes)break;
  kept.push(turn);
 }
 return {history_for_interpretation_only:kept,history_turns_omitted:history.length-kept.length,history_policy:'COMPLETE_RECENT_TURNS_ONLY; CURRENT_RECORDS_NOT_TRUNCATED'};
}

export const AI_SYSTEM_GUIDE='AI gives advice/drafts only. Humans submit, sign, approve and save plans. Reservations use whole days; actual test hours are separate. U is required. Equipment endpoint configuration is not proof of hardware connection. Data is shared; display preferences may be browser-local.';
export const AI_METHOD_GUIDE='Catalog reference: humidity 250H continuous; vibration 20H/unit, one unit at a time, weekdays. Other conditions follow the catalog and approved case protocol.';
