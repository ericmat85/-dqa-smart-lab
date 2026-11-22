import {useEffect,useState} from 'react';
import {businessClient,businessErrorMessage} from './businessClient.mjs';

export default function WorkflowSignatureImage({record,index=0,style,alt}){
 const [state,setState]=useState({loading:true,image:'',error:''});
 useEffect(()=>{let active=true;businessClient.request('/workflow/signature/'+record.signatureId).then(async({data})=>{if(!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(data.signature_data||''))throw Error('簽名圖片格式無法核對。');const bytes=Uint8Array.from(atob(data.signature_data.split(',')[1]),c=>c.charCodeAt(0));const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');if(hash!==record.signatureSha256||hash!==data.signature_sha256)throw Error('簽名雜湊不一致，未顯示圖片。');if(active)setState({loading:false,image:data.signature_data,error:''});}).catch(error=>{if(active)setState({loading:false,image:'',error:error.code?businessErrorMessage(error):error.message});});return()=>{active=false;};},[record.signatureId,record.signatureSha256]);
 if(state.error)return <p role="alert">{state.error}</p>;if(state.loading)return <p role="status">讀取簽名…</p>;return <a href={state.image} download={`signature-${record.signatureId}.${state.image.startsWith('data:image/jpeg')?'jpg':'png'}`} aria-label={`下載第 ${index+1} 筆簽名`}><img src={state.image} style={style} alt={alt||`${record.actor||record.actorId||'簽署人'}的簽名`}/></a>;
}
