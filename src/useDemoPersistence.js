import {caseResetVersion} from './resetCases.mjs';
import {persistDemoSnapshot} from './persistDemoSnapshot.mjs';
import { useEffect, useRef, useState } from 'react';

export default function useDemoPersistence(key, value) {
  const resetEpoch=useRef(caseResetVersion());
  const lastWritten=useRef(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if(resetEpoch.current!==caseResetVersion())return;
    let message = '';
    try { const result=persistDemoSnapshot(key,value,lastWritten.current,window.localStorage);lastWritten.current=result.stamp;if(!result.written)return;if (key === 'dqa-request-demo-v2') window.dispatchEvent(new Event('dqa:request-updated')); }
    catch { message = '資料與簽名尚未儲存：瀏覽器空間不足或禁止儲存。請勿關閉頁面，釋出空間後重試。'; }
    // Report the result of synchronizing with browser storage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(message);
  }, [key, value, retry]);
  return { error, retry: () => setRetry(n => n + 1) };
}
