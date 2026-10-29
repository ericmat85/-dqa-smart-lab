import { useState } from 'react';
import { readDefaultSignature, saveDefaultSignature } from './defaultSignature.mjs';

export default function DefaultSignatureActions({ accountId, value, onChange, beforeApply }) {
  const [message, setMessage] = useState('');
  const save = () => {
    try {
      saveDefaultSignature(accountId, value);
      setMessage('已儲存為此帳號的預設簽名，下次可直接使用。');
    } catch {
      setMessage('無法儲存預設簽名，請確認圖片及瀏覽器儲存空間後再試。');
    }
  };
  const apply = () => {
    try {
      const signature = readDefaultSignature(accountId);
      if (!signature) { setMessage('尚未儲存預設簽名，請先上傳簽名圖片並儲存。'); return; }
      beforeApply?.();
      onChange(signature);
      setMessage('已套用預設簽名，請確認預覽後再送出。');
    } catch {
      setMessage('無法讀取預設簽名，請確認瀏覽器允許本機儲存。');
    }
  };
  return <div style={{ margin: '10px 0' }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <button type="button" className="rq-btn rq-btn-small" disabled={!accountId} onClick={apply}>使用預設簽名</button>
      <button type="button" className="rq-btn rq-btn-small" disabled={!accountId || !value} onClick={save}>儲存為預設簽名</button>
    </div>
    <small>預設簽名依帳號儲存於此瀏覽器；再次儲存會更新預設圖片。</small>
    {message && <p role="status" style={{ margin: '6px 0', fontSize: 12 }}>{message}</p>}
  </div>;
}
