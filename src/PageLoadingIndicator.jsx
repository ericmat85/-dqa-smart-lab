import {useSyncExternalStore} from 'react';
import {subscribeLoading,loadingSnapshot} from './pageLoading.mjs';
import './PageLoading.css';
export default function PageLoadingIndicator(){const loading=useSyncExternalStore(subscribeLoading,loadingSnapshot,()=>false);return loading?<div className="page-loading-indicator" role="progressbar" aria-label="資料載入中"><span className="page-loading-ring" aria-hidden="true"/><span>載入中…</span></div>:null;}
