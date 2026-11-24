// Successful screenshots are review artifacts, not assertions. Keep them for
// local design review; CI captures failures through Playwright instead.
export async function captureBrowserEvidence(target,options,{ci=process.env.CI==='true'||process.env.CI==='1',captureSuccess=process.env.CAPTURE_SUCCESS_SCREENSHOTS==='1'}={}){
 if(ci&&!captureSuccess)return {captured:false};
 await target.screenshot(options);return {captured:true,path:options?.path};
}
