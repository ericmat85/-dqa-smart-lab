import {appStorage} from './originalBusiness.mjs';
export const UI_PREFERENCES_KEY='dqa-ui-preferences-v1';
export const DEFAULT_UI_PREFERENCES={fontSize:'normal',language:'zh-TW',pageSize:20};
export function readUiPreferences(storage=appStorage()){
 try{const value=JSON.parse(storage?.getItem(UI_PREFERENCES_KEY)||'{}');return {fontSize:['small','normal','large'].includes(value.fontSize)?value.fontSize:'normal',language:value.language==='en'?'en':'zh-TW',pageSize:[10,20,50,100].includes(Number(value.pageSize))?Number(value.pageSize):20};}catch{return {...DEFAULT_UI_PREFERENCES};}
}
export function saveUiPreferences(patch,storage=appStorage()){
 const merged={...readUiPreferences(storage),...patch};
 const next=readUiPreferences({getItem:()=>JSON.stringify(merged)});storage.setItem(UI_PREFERENCES_KEY,JSON.stringify(next));
 if(typeof window!=='undefined'&&storage===appStorage())window.dispatchEvent(new Event('dqa:ui-preferences'));
 return next;
}
