import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
const names={lms:'實驗室管理系統',request:'電子委託系統',lab:'實驗室系統'};
export default function SessionTimeoutDialog({systems,onClose}){
 const ref=useRef(null);
 useEffect(()=>{const element=ref.current;element.showModal();return()=>element.close();},[]);
 return createPortal(<dialog ref={ref} className="session-timeout-dialog" aria-labelledby="session-timeout-title" aria-describedby="session-timeout-description" onCancel={onClose}><h2 id="session-timeout-title">已自動登出</h2><p id="session-timeout-description">超過 30 分鐘未操作，已自動登出{systems.map(system=>names[system]).join('、')}。請重新登入後繼續使用。</p><button type="button" onClick={onClose}>確認，重新登入</button></dialog>,document.body);
}
