import AISessionNotice from './AISessionNotice.jsx';

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './UnifiedTypography.css'
import './DarkTheme.css'
import './SystemTabs.css'
import './ControlAlignment.css'
import './SummaryTiles.css'

let root;
function mount(Component,key='app'){
 if(!root)root=createRoot(document.getElementById('root'));
 root.render(<StrictMode><Component key={key}/><AISessionNotice/></StrictMode>);
 return root;
}
function bootError(error){
 console.error('Application bootstrap failed',error);
 document.getElementById('root').textContent='畫面載入失敗，請重新整理或重新開始導覽。';
 if(window.parent!==window)window.parent.postMessage({source:'dqa-guided-workspace',token:window.name,type:'error',message:error.message},location.origin);
}
if(window.parent!==window&&/^dqa-guided-tour-[a-f0-9-]+$/.test(window.name)){
 import('./guidedTourRuntime.mjs').then(({startGuidedWorkspace})=>startGuidedWorkspace(mount)).catch(bootError);
}else{
 import('./PreferenceRoot.jsx').then(({default:Component})=>mount(Component)).catch(bootError);
}
