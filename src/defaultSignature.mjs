import {appStorage} from './originalBusiness.mjs';
const key = accountId => `dqa-default-signature-v1:${encodeURIComponent(accountId)}`;
const isImage = value => /^data:image\/(png|jpeg);base64,/i.test(value || '');

export function saveDefaultSignature(accountId, signature, storage = appStorage()) {
  if (!accountId || !isImage(signature)) throw new Error('請先上傳有效的簽名圖片。');
  storage.setItem(key(accountId), signature);
}

export function readDefaultSignature(accountId, storage = appStorage()) {
  if (!accountId) return '';
  const signature = storage.getItem(key(accountId));
  return isImage(signature) ? signature : '';
}
