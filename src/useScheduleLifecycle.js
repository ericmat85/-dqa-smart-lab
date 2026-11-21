import {originalBusinessEnabled,originalImportNotice} from './originalBusiness.mjs';
import {appStorage} from './originalBusiness.mjs';
import {useEffect,useState,useSyncExternalStore} from 'react';
import {subscribeScheduleClock,scheduleClockSnapshot,scheduleServerSnapshot} from './scheduleClock.mjs';
import {syncScheduleLifecycle} from './scheduleLifecycle.mjs';

export default function useScheduleLifecycle() {
  const now=useSyncExternalStore(subscribeScheduleClock,scheduleClockSnapshot,scheduleServerSnapshot);
  const [error,setError]=useState('');
  useEffect(()=>{
    if(originalBusinessEnabled())return;
    let message='';
    try {
      if(syncScheduleLifecycle(appStorage(),now)){
        window.dispatchEvent(new Event('dqa:schedules-updated'));
        window.dispatchEvent(new Event('dqa:equipment-updated'));
        window.dispatchEvent(new Event('dqa:request-updated'));
        window.dispatchEvent(new Event('dqa:review-updated'));
      }
    } catch {message='自動更新試驗狀態或釋放設備失敗，請確認瀏覽器儲存空間與權限；系統會重試。';}
    // Report the result of synchronizing schedule and equipment storage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(message);
  },[now]);
  return originalBusinessEnabled()?originalImportNotice():error;
}
