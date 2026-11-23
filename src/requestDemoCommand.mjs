// An explicit local UI command; it never calls a model, saves or submits a case.
export const requestDemoStartIntent=text=>/^\/demo[ \t]+start$/i.test(String(text??'').trim());
const automatic=new Set(['requester','department','supervisorId','executionKind','demoFilled']);
const comparable=value=>Array.isArray(value)?JSON.stringify(value):String(value??'').trim();
export function requestDemoStartStatus({canCreate,isEditor,editingId,busy,form={},defaults={},signature=''}){
 if(!canCreate)return 'DENIED';
 if(!isEditor)return 'EDITOR_REQUIRED';
 if(editingId)return 'SAVED_DRAFT';
 if(busy)return 'BUSY';
 if(signature||form.demoFilled||Object.keys(defaults).some(key=>!automatic.has(key)&&comparable(form[key])!==comparable(defaults[key])))return 'NOT_EMPTY';
 return 'READY';
}
const replies={
 DENIED:['目前帳號沒有建立委託單的權限。','This account cannot create requests.'],
 EDITOR_REQUIRED:['請先開啟「新增試驗委託單」的空白頁面，再輸入 /demo start。','Open a blank New Test Request page, then enter /demo start.'],
 SAVED_DRAFT:['此委託草稿已儲存，請開啟一張新的空白委託單後再使用 /demo start。','This draft has been saved. Open a new blank request to use /demo start.'],
 BUSY:['委託單正在處理中，請完成目前操作後再使用 /demo start。','A request operation is in progress. Finish it before using /demo start.'],
 NOT_EMPTY:['目前委託單已有內容，請先確認或重設表單，再使用 /demo start。','This request already contains data. Review or reset the form before using /demo start.'],
 FILLED:['已填入虛擬委託資料及測試簽名，請確認內容後按「送出主管簽核」。','Virtual request data and a test signature are filled in. Review the form, then submit it for supervisor approval.'],
 SUPERVISOR_REQUIRED:['已填入虛擬委託資料；請先設定直屬主管，再確認送出。','Virtual request data is filled in. Set the direct supervisor before submitting.'],
 WRONG_SYSTEM:['請在電子委託系統的空白新增委託單頁面使用 /demo start。','Use /demo start on a blank New Request page in Electronic Requests.'],
};
export const requestDemoReply=(code,language='zh-TW')=>(replies[code]||replies.EDITOR_REQUIRED)[language==='en'?1:0];
