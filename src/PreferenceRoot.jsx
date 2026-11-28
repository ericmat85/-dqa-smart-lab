import {useLayoutEffect} from 'react';
import App from './App.jsx';
import {translateText} from './i18n.mjs';
import useUiPreferences from './useUiPreferences.js';
import WorkspaceImagesProvider from './WorkspaceImagesProvider.jsx';
import WorkspaceAppearanceProvider from './WorkspaceAppearanceProvider.jsx';
import {lazy,Suspense} from 'react';
const ConnectedWorkspace=lazy(()=>import('./ConnectedWorkspace.jsx'));
export default function PreferenceRoot(){
 const ui=useUiPreferences();
 useLayoutEffect(()=>{const alert=window.alert,confirm=window.confirm,prompt=window.prompt;window.alert=message=>alert.call(window,translateText(message));window.confirm=message=>confirm.call(window,translateText(message));window.prompt=(message,value)=>prompt.call(window,translateText(message),value);return()=>{window.alert=alert;window.confirm=confirm;window.prompt=prompt;};},[]);
 useLayoutEffect(()=>{document.documentElement.lang=ui.language==='en'?'en':'zh-Hant';document.documentElement.dataset.uiFont=ui.fontSize;document.documentElement.style.setProperty('--ui-font-scale',({small:.9,normal:1,large:1.12})[ui.fontSize]);},[ui.fontSize,ui.language]);
 if(import.meta.env.VITE_ORIGINAL_BUSINESS!=='true'&&/^\/lms\/connected(?:\/|$)/.test(location.pathname))return <Suspense fallback={<div role="status">正在載入工作區…</div>}><ConnectedWorkspace/></Suspense>;
 return <WorkspaceImagesProvider><WorkspaceAppearanceProvider><App locale={ui.language}/></WorkspaceAppearanceProvider></WorkspaceImagesProvider>;
}
