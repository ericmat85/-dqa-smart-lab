import rules from '../render-backend/gateway/lab_scope.json' with {type:'json'};
export function e4LabScope(question,{document=false}={}){
 const text=String(question||'').replace(/DQA\s*Smart\s*Lab/ig,'實驗室系統').trim();
 if(new RegExp(rules.identity,'i').test(text))return {allowed:false,code:'IDENTITY_SCOPE_DENIED',reply:'我目前只回答實驗室業務與試驗資訊，不提供帳號、角色、權限或憑證資料。'};
 if(new RegExp(rules.unbuilt,'i').test(text))return {allowed:false,code:'DQA_NOT_AVAILABLE',reply:'DQA 功能尚未建置，目前不提供這部分的回答。可以詢問實驗室、試驗、排程、設備、物料或報告。'};
 if(new RegExp(rules.outside,'i').test(text)||!document&&!new RegExp(rules.laboratory,'i').test(text)&&!new RegExp(rules.neutral,'i').test(text))return {allowed:false,code:'NON_LAB_SCOPE_DENIED',reply:'我目前的回答範圍是實驗室系統與試驗資訊，這個問題不在目前開放的範圍內。'};
 return {allowed:true};
}
