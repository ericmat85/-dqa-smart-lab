import {useEffect,useState} from 'react';
import {businessClient} from './businessClient.mjs';
export default function BusinessAccountEntry(){
 const [available,setAvailable]=useState(false),[loaded,setLoaded]=useState(false);
 useEffect(()=>{let active=true;businessClient.request('/config').then(p=>{if(active){setAvailable(p.activation_available===true);setLoaded(true);}}).catch(()=>{if(active)setLoaded(true);});return()=>{active=false;};},[]);
 return <div className="account-entry-control"><button type="button" className="back-button" disabled={!available} aria-describedby="account-entry-explanation" onClick={()=>{if(available){history.pushState({},'','/account/activate');window.dispatchEvent(new Event('dqa:navigate'));}}}>{loaded?'啟用帳號':'正在確認啟用狀態…'}</button>{loaded&&!available&&<p id="account-entry-explanation" className="account-entry-explanation">帳號請由管理者建立，並透過啟用信完成設定。</p>}</div>;
}
