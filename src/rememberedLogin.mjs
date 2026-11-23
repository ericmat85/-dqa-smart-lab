import {appStorage} from './originalBusiness.mjs';
const prefix='dqa-remembered-login-v1:';
export function readRememberedLogin(scope,storage=appStorage()){
 try{const account=storage.getItem(prefix+scope);return typeof account==='string'&&account.trim()?account:'';}catch{return '';}
}
export function saveRememberedLogin(scope,account,remember,storage=appStorage()){
 if(remember)storage.setItem(prefix+scope,String(account).trim());else storage.removeItem(prefix+scope);
}
