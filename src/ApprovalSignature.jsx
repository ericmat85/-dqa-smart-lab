import { useRef, useEffect } from 'react';
import SignaturePad from './SignaturePad.jsx';
import DefaultSignatureActions from './DefaultSignatureActions.jsx';
import './SignatureInput.css';

export default function ApprovalSignature({ label="主管簽名", accountId, mode, onModeChange, value, onChange, onError }) {
  const readerRef = useRef(null);
  useEffect(() => () => readerRef.current?.abort(), []);
  const changeMode = next => {
    readerRef.current?.abort();
    onChange('');
    onModeChange(next);
  };
  const upload = event => {
    readerRef.current?.abort();
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 1024 * 1024) {
      event.target.value = '';
      onError('請選擇 1 MB 以內的 PNG 或 JPG 簽名圖片。');
      return;
    }
    onChange('');
    const reader = new FileReader();
    readerRef.current = reader;
    reader.onload = () => onChange(String(reader.result));
    reader.onerror = () => onError('簽名圖片無法讀取，請重新選擇。');
    reader.readAsDataURL(file);
  };
  return <div className="dqa-signature-input" style={{ margin: '12px 0' }}>
    <div className="rq-radio-row" role="group" aria-label={`${label}方式`}>
      <label><input type="radio" name="approvalSignatureMode" checked={mode === 'draw'} onChange={() => changeMode('draw')} /> 手寫簽名</label>
      <label><input type="radio" name="approvalSignatureMode" checked={mode === 'upload'} onChange={() => changeMode('upload')} /> 上傳簽名檔</label>
    </div>
    {mode === 'draw' ? <SignaturePad onChange={onChange} label={label} /> : <>
      <label className="rq-label">{label}檔<input className="rq-input" type="file" accept="image/png,image/jpeg" onChange={upload} /></label>
      <DefaultSignatureActions accountId={accountId} value={value} onChange={onChange} beforeApply={() => readerRef.current?.abort()} />
      <small>支援 PNG、JPG，檔案不超過 1 MB。</small>
      {value && <div style={{ marginTop: 10 }}><img src={value} alt={`${label}預覽`} style={{ display: 'block', width: '100%', maxWidth: 600, height: 120, objectFit: 'contain', objectPosition: 'left center', background: '#fff' }} /><button type="button" className="rq-btn rq-btn-small" onClick={() => onChange('')}>清除簽名</button></div>}
    </>}
  </div>;
}
