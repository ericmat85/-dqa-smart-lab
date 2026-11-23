import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import WorkspaceProfileSettings from '../../src/WorkspaceProfileSettings.jsx';
import '../../src/AdminCenter.css';
function Fixture(){const [module,setModule]=useState('parameters'),[login,setLogin]=useState(true);return <><button onClick={()=>setLogin(!login)}>{login?'登出':'重新登入'}</button>{['parameters','organization','documents'].map(x=><button key={x} onClick={()=>setModule(x)}>{x}</button>)}{login&&<WorkspaceProfileSettings key={module} module={module} account={{id:'synthetic-admin'}} connected/>}</>;}
createRoot(document.getElementById('root')).render(<Fixture/>);
