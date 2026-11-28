import {useSyncExternalStore} from 'react';
import {appStorage} from './originalBusiness.mjs';
import {HERO_BACKGROUND_KEY,readHeroBackground} from './heroBackground.mjs';
function snapshot(){try{return appStorage().getItem(HERO_BACKGROUND_KEY)||'';}catch{return '';}}
function subscribe(listener){const storage=event=>{if(!event.key||event.key===HERO_BACKGROUND_KEY)listener();};window.addEventListener('storage',storage);window.addEventListener('dqa:hero-background',listener);return()=>{window.removeEventListener('storage',storage);window.removeEventListener('dqa:hero-background',listener);};}
export default function useHeroBackground(){useSyncExternalStore(subscribe,snapshot,()=> '');return readHeroBackground();}
