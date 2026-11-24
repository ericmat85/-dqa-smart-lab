import {appStorage,equipmentActivityData,originalBusinessEnabled} from './originalBusiness.mjs';
import {useSyncExternalStore} from 'react';
import {MANAGEMENT_PREFERENCES_KEY,readManagementPreferences} from './managementPreferences.mjs';
function signature(){try{return (appStorage().getItem(MANAGEMENT_PREFERENCES_KEY)||'')+(originalBusinessEnabled()?JSON.stringify(equipmentActivityData()?.configuration||{}):'');}catch{return '';}}
function subscribe(listener){const storage=event=>{if(!event.key||event.key===MANAGEMENT_PREFERENCES_KEY)listener();};window.addEventListener('storage',storage);window.addEventListener('dqa:management-preferences',listener);return()=>{window.removeEventListener('storage',storage);window.removeEventListener('dqa:management-preferences',listener);};}
export default function useManagementPreferences(){useSyncExternalStore(subscribe,signature,()=> '');return readManagementPreferences();}
