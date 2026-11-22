export function invitationMessage(invitation){
 switch(invitation?.state){
 case 'SENT':return '啟用信已交由寄信服務送出，請使用者查看收件匣及垃圾郵件，開啟連結設定密碼。';
 case 'REQUIRES_VERIFIED_SENDER':return '啟用信尚未寄出：目前的測試寄件只能寄至 Resend 註冊信箱。寄給此帳號前，請先設定自有網域寄件地址。';
 case 'NOT_CONFIGURED':return '啟用信尚未寄出：寄信服務尚未就緒。設定完成後，請按「寄送啟用信」。';
 case 'QUEUED':return '啟用信等待寄送，請按「寄送啟用信」完成。';
 case 'FAILED':return invitation.code==='RATE_LIMITED'?'啟用信未寄出：寄信服務頻率限制，請稍後再寄。':'啟用信寄送失敗，請確認寄件設定與收件地址後再寄。';
 case 'UNKNOWN':return '啟用信寄送結果待確認；為避免重複寄信，目前暫停重寄，請先查看信箱或寄信服務紀錄。';
 case 'SKIPPED_VERIFIED':return '此帳號已完成電子郵件驗證，無須重寄啟用信。';
 case 'SKIPPED_DISABLED':return '帳號已停用，未寄送啟用信。';
 case 'STALE':return '帳號資料已變更，本次未寄送啟用信。';
 default:return '';
 }
}
export function accountSavedMessage(result){return (result.kind==='invitation'?'':result.kind==='role'?'角色權限已儲存；受影響的既有登入會撤銷，需重新登入。':'帳號資料已儲存。')+invitationMessage(result.invitation);}
