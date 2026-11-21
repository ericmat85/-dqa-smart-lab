import {appStorage} from './originalBusiness.mjs';
import {caseResetActive} from './resetCases.mjs';
const STORAGE_KEY = 'dqa-lms-reviews-v1';

export function readStoredRequests(fallback, storage = appStorage()) {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
    return readCancellationOverrides(Array.isArray(value) && value.every(r => r && typeof r.id === 'string' && Array.isArray(r.history)) ? value : fallback, storage);
  } catch {
    return fallback;
  }
}

export function writeStoredRequests(requests, storage = appStorage()) {
  try {
    if(caseResetActive(storage))return true;
    storage.setItem(STORAGE_KEY, JSON.stringify(requests));
    return true;
  } catch {
    return false;
  }
}

export function mergeImportedRequests(requests, imported) {
  const ids = new Set(imported.map(r => r.id));
  return [...imported, ...requests.filter(r => r.source !== 'electronic-request' && !ids.has(r.id))];
}
import { readCancellationOverrides } from './requestCancellation.mjs';
