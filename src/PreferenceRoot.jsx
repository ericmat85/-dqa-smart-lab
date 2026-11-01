import {useLayoutEffect} from 'react';
import App from './App.jsx';
import {translateText} from './i18n.mjs';
import useUiPreferences from './useUiPreferences.js';
export default function PreferenceRoot(){
 const ui=useUiPreferences();
 useLayoutEffect(()=>{const alert=window.alert,confirm=window.confirm,prompt=window.prompt;window.alert=message=>alert.call(window,translateText(message));window.confirm=message=>confirm.call(window,translateText(message));window.prompt=(message,value)=>prompt.call(window,translateText(message),value);return()=>{window.alert=alert;window.confirm=confirm;window.prompt=prompt;};},[]);
 useLayoutEffect(()=>{document.documentElement.lang=ui.language==='en'?'en':'zh-Hant';document.documentElement.dataset.uiFont=ui.fontSize;document.documentElement.style.setProperty('--ui-font-scale',({small:.9,normal:1,large:1.12})[ui.fontSize]);},[ui.fontSize,ui.language]);
 return <App locale={ui.language}/>;
}
