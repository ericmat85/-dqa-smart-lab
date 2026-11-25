
import {beginPageLoading} from './pageLoading.mjs'
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './UnifiedTypography.css'
import './DarkTheme.css'
import './SystemTabs.css'
import './ControlAlignment.css'
import './SummaryTiles.css'
import './UnifiedButtons.css'
import './ApprovedWorkspaceDesign.css'
import './WorkspaceLayoutPolish.css'
import './WorkspaceRefresh.css'
import './WorkspaceRefinements.css'
import './ArchiveWorkspace.css'
import './SearchStandards.css'
import './AdminUiStandards.css'
import './ScreenRefinements.css'

const finishBootstrap=beginPageLoading();
function BootReady({children}){useEffect(()=>{finishBootstrap();},[]);return children;}
let root;
function mount(Component,key='app'){
 if(!root)root=createRoot(document.getElementById('root'));
 root.render(<StrictMode><BootReady><Component key={key}/></BootReady></StrictMode>);
 return root;
}
function bootError(error){
 finishBootstrap();
 console.error('Application bootstrap failed',error);
 document.getElementById('root').textContent='畫面載入失敗，請重新整理或重新開始導覽。';
 if(window.parent!==window)window.parent.postMessage({source:'dqa-guided-workspace',token:window.name,type:'error',message:error.message},location.origin);
}
if(window.parent!==window&&/^dqa-guided-tour-[a-f0-9-]+$/.test(window.name)){
 import('./guidedTourRuntime.mjs').then(({startGuidedWorkspace})=>startGuidedWorkspace(mount)).catch(bootError);
}else{
 const ready=import.meta.env.VITE_ORIGINAL_BUSINESS==='true'?import('./originalBusiness.mjs').then(m=>m.initializeOriginalBusiness()):Promise.resolve();
 ready.then(()=>import('./PreferenceRoot.jsx')).then(({default:Component})=>mount(Component)).catch(bootError);
}
