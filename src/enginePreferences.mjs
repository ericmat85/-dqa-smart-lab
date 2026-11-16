import {canEditAdmin} from './adminCenterStore.mjs';
export const ENGINE_PREFERENCES_EVENT='dqa:engine-preferences';
export const ENGINE_DEFAULTS=Object.freeze({
 E3:Object.freeze({enabled:true,preset:'weekly',style:'主管摘要',extraLimit:8,title:'實驗室管理報告'}),
 E4:Object.freeze({enabled:true,speed:35,punctuation:true,showFaq:true}),
});
export const E3_PRESETS=Object.freeze({weekly:'管理週／月報',equipment:'設備與資源報告',case:'單案試驗報告',special:'特殊客製報告'});
const failure=(code,message)=>{throw Object.assign(Error(message),{code});};
export const enginePreferenceKey=engine=>{if(!Object.hasOwn(ENGINE_DEFAULTS,engine))failure('ENGINE_INVALID','引擎無法核對。');return 'dqa-'+engine.toLowerCase()+'-preferences-v1';};
export function validateEnginePreferences(engine,value){
 const defaults=ENGINE_DEFAULTS[engine];if(!defaults||!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==Object.keys(defaults).length||Object.keys(value).some(k=>!Object.hasOwn(defaults,k))||typeof value.enabled!=='boolean')failure('ENGINE_PREFERENCES_INVALID','引擎偏好格式無效，原設定未覆寫。');
 if(engine==='E3'&&(!Object.hasOwn(E3_PRESETS,value.preset)||!['主管摘要','工程技術說明','客戶說明文字'].includes(value.style)||!Number.isInteger(value.extraLimit)||value.extraLimit<0||value.extraLimit>8||typeof value.title!=='string'||!value.title.trim()||value.title.length>40))failure('ENGINE_PREFERENCES_INVALID','報告偏好超過安全範圍。');
 if(engine==='E4'&&(!Number.isInteger(value.speed)||value.speed<15||value.speed>80||typeof value.punctuation!=='boolean'||typeof value.showFaq!=='boolean'))failure('ENGINE_PREFERENCES_INVALID','助理偏好超過安全範圍。');
 return {...value};
}
export function readEnginePreferences(engine,storage=globalThis.localStorage){
 const key=enginePreferenceKey(engine);
 try{const raw=storage?.getItem(key);if(raw===null||raw===undefined)return {version:1,revision:0,settings:{...ENGINE_DEFAULTS[engine]}};const data=JSON.parse(raw);if(data.version!==1||!Number.isSafeInteger(data.revision)||data.revision<0||Object.keys(data).some(k=>!['version','revision','settings'].includes(k)))throw Error();return {version:1,revision:data.revision,settings:validateEnginePreferences(engine,data.settings)};}
 catch{failure('ENGINE_PREFERENCES_UNAVAILABLE','引擎偏好無法讀取，已停止新請求；原設定未重置。');}
}
export function saveEnginePreferences(engine,settings,account,{storage=globalThis.localStorage,expectedRevision}={}){
 const value=validateEnginePreferences(engine,settings);let people;try{people=JSON.parse(storage.getItem('dqa-shared-demo-accounts-v1')||'[]');}catch{failure('ENGINE_PREFERENCES_FORBIDDEN','帳號資料無法核對。');}
 const actor=Array.isArray(people)&&people.find(a=>a.id===account?.id);if(!actor||!canEditAdmin(actor,storage))failure('ENGINE_PREFERENCES_FORBIDDEN','目前帳號沒有修改引擎偏好的權限。');
 const previous=readEnginePreferences(engine,storage);if(previous.revision!==expectedRevision)failure('ENGINE_PREFERENCES_CONFLICT','偏好已在其他分頁更新，請重新開啟設定。');
 const next={version:1,revision:previous.revision+1,settings:value};storage.setItem(enginePreferenceKey(engine),JSON.stringify(next));if(typeof window!=='undefined'&&storage===window.localStorage)window.dispatchEvent(new Event(ENGINE_PREFERENCES_EVENT));return next;
}
export function requireEngineEnabled(engine,storage=globalThis.localStorage){const result=readEnginePreferences(engine,storage);if(!result.settings.enabled)failure('ENGINE_CLIENT_PAUSED',engine==='E3'?'新的報告草稿已暫停；一般 PDF／Excel 匯出保持原樣。':'新的助理請求已暫停；可使用清除對話或登出。');return result;}
