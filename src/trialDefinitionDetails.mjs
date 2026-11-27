import {SPEC_PARAMETER_TYPES as TRIAL_CONDITIONS,parameterKindValid,parameterTextValid} from './specificationParameters.mjs';
export {SPEC_PARAMETER_TYPES as TRIAL_CONDITIONS} from './specificationParameters.mjs';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export function validateTrialDetails(v,{types=TRIAL_CONDITIONS}={}){
 const fail=()=>{throw Error('TRIAL_DETAILS_INVALID');};
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join()!=='conditions,description,equipment_ids'||!Array.isArray(v.conditions)||v.conditions.length>12||!Array.isArray(v.equipment_ids)||v.equipment_ids.length>100||v.equipment_ids.some(id=>!UUID.test(id)&&!/^EQ-[A-Z0-9-]+$/.test(id))||new Set(v.equipment_ids).size!==v.equipment_ids.length||!Array.isArray(v.description)||!v.description.length||v.description.length>16)fail();
 const seen=new Set();for(const c of v.conditions){const type=types?.find(t=>t.id===c?.kind);if(!c||Object.keys(c).sort().join()!=='kind,lower,unit,upper'||!parameterKindValid(c.kind)||!parameterTextValid(c.unit,20)||(types&&(!type||!type.units.includes(c.unit)))||[c.lower,c.upper].some(x=>x!==null&&(!Number.isFinite(x)||Math.abs(x)>1e9))||c.lower!==null&&c.upper!==null&&c.lower>c.upper||seen.has(c.kind+':'+c.unit))fail();seen.add(c.kind+':'+c.unit);}
 let images=0;for(const b of v.description){if(b?.type==='text'){if(Object.keys(b).sort().join()!=='text,type'||typeof b.text!=='string'||b.text.length>6000)fail();}else if(b?.type==='image'){images++;if(Object.keys(b).sort().join()!=='caption,data,type'||typeof b.caption!=='string'||b.caption.length>200||typeof b.data!=='string'||b.data.length>120000||!/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(b.data))fail();}else fail();}
 if(images>4||descriptionText(v.description).length>6000||JSON.stringify(v).length>510000)fail();return structuredClone(v);
}
export const descriptionText=blocks=>(blocks||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n');
export const trialDetails=(row={})=>row.definitionDetails||{conditions:[],equipment_ids:[],description:[{type:'text',text:row.specification||''}]};
