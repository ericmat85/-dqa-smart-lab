import {SPEC_PARAMETER_EVENT} from './specificationParameters.mjs';
import {useEffect,useState} from 'react';
import {readTrialCatalog,TRIAL_CATALOG_EVENT,TRIAL_CATALOG_KEY} from './trialCatalogStore.mjs';
export default function useTrialCatalog(){
 const [,refresh]=useState(0);
 useEffect(()=>{const update=()=>refresh(v=>v+1),storage=e=>{if(e.key===TRIAL_CATALOG_KEY||e.key===null)update();};window.addEventListener(TRIAL_CATALOG_EVENT,update);window.addEventListener(SPEC_PARAMETER_EVENT,update);window.addEventListener('storage',storage);return()=>{window.removeEventListener(TRIAL_CATALOG_EVENT,update);window.removeEventListener(SPEC_PARAMETER_EVENT,update);window.removeEventListener('storage',storage);};},[]);
 try{return {...readTrialCatalog(),error:null};}catch(error){return {rows:[],revision:null,error:error.message};}
}
