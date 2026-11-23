import {appStorage} from './originalBusiness.mjs';
import {useSyncExternalStore} from 'react';
import {readUiPreferences,UI_PREFERENCES_KEY} from './uiPreferences.mjs';
function snapshot(){try{return appStorage().getItem(UI_PREFERENCES_KEY)||'';}catch{return '';}}
function subscribe(listener){const storage=event=>{if(!event.key||event.key===UI_PREFERENCES_KEY)listener();};window.addEventListener('storage',storage);window.addEventListener('dqa:ui-preferences',listener);return()=>{window.removeEventListener('storage',storage);window.removeEventListener('dqa:ui-preferences',listener);};}
export default function useUiPreferences(){useSyncExternalStore(subscribe,snapshot,()=> '');return readUiPreferences();}
