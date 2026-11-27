import {sourceConditions} from './trialSourceFacts.mjs';
import {testOptions,getTestReference as baseReference,testAcceptanceCriteriaCatalog,testSpecificationCatalog} from './trialCatalogData.mjs';
import {findTrialDefinition} from './trialCatalogStore.mjs';
export {testOptions,testAcceptanceCriteriaCatalog,testSpecificationCatalog};
export function getTestReference(name){
 let row;try{row=findTrialDefinition(name);}catch{return null;}if(!row)return null;
 if(row.profileId==='COMPOUND_ENVIRONMENT')return {...row,calendar:'連續試驗；切換限平日作業時段',duration:'依專案階段工時計算',durationHours:0,catalogId:row.id};
 const parsed=sourceConditions({specification:row.specification}),conditionText=parsed.supplied?[['temperature','溫度','°C'],['humidity','濕度','%RH'],['frequency','頻率','Hz']].filter(([key])=>parsed.conditions[key+'Min']!==undefined).map(([key,label,unit])=>{const a=parsed.conditions[key+'Min'],b=parsed.conditions[key+'Max'];return label+' '+(a===b?a:a+'～'+b)+unit;}).join('；'):'依試驗規範確認，未提供數值';
 const base=baseReference(testOptions.find(option=>baseReference(option).profileId===row.profileId))||{};
 return {...base,name:row.name,specification:row.specification,acceptance:row.acceptance,equipment:row.equipment,profileId:row.profileId,conditions:conditionText,calendar:base.calendar||'尚未設定排程規則',duration:base.duration?base.duration.replace(/\d+(?:\.\d+)? 小時/,row.durationHours+' 小時'):row.durationHours+' 小時',durationHours:row.durationHours,version:row.version,catalogId:row.id};
}
export function buildSpecification(items){return (items||[]).map(name=>`${name}：${findTrialDefinition(name)?.specification||'請依核准試驗規範填寫條件與判定要求。'}`).join('\n\n');}
export function buildAcceptanceCriteria(name){return findTrialDefinition(name)?.acceptance||testAcceptanceCriteriaCatalog[name==='機械衝擊'?'機械衝擊試驗':name]||'';}
