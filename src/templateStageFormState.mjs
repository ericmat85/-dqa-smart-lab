import {validateStageFields} from './templateStageFields.mjs';
export function stageCommandFields(state,key){try{if(state?.key!==key||!state.ready)throw Error(state?.error||'請等待委託單範本檢核設定讀取完成。');const fields=validateStageFields(state.stage,state.fields,state.required);return Object.keys(fields).length?fields:undefined;}catch(e){throw Object.assign(e,{code:'TEMPLATE_STAGE_LOCAL_VALIDATION'});}}
export const stageFormKey=(documentId,stage,scope='')=>[documentId,stage,scope].join(':');
