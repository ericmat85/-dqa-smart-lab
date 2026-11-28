export const IMAGE_LIMIT=524288;
export const IMAGE_KINDS=['logo','avatar','signature'];
export function validateImageChange(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['kind','image','name','expected_revision'].includes(k))||!IMAGE_KINDS.includes(value.kind)||!Number.isSafeInteger(value.expected_revision)||value.expected_revision<0||typeof value.name!=='string'||value.name.length>100||Array.from(value.name).some(c=>c.codePointAt(0)<32||c.codePointAt(0)===127||c==='/'||c==='\\'))throw Error('WORKSPACE_IMAGE_INVALID');
 if(value.image===null){if(value.name!=='')throw Error('WORKSPACE_IMAGE_INVALID');return value;}
 if(typeof value.image!=='string'||value.image.length>699100||!new RegExp('^data:image/'+(value.kind==='signature'?'(?:png|jpeg)':'(?:png|jpeg|webp)')+';base64,[A-Za-z0-9+/]+={0,2}$').test(value.image))throw Error('WORKSPACE_IMAGE_INVALID');
 return value;
}
export function validateImagesPacket(data,member){
 if(!data||data.member_id!==member||typeof data.can_manage!=='boolean'||!IMAGE_KINDS.every(kind=>{try{const v=data.images?.[kind];validateImageChange({kind,image:v.image,name:v.name,expected_revision:v.revision});return true;}catch{return false;}}))throw Error('圖片資料回應不正確，請重新讀取。');return data;
}
export async function prepareWorkspaceImage(data,kind){
 if(typeof data!=='string'||data.length>3000000||!/^data:image\/(png|jpeg|webp);base64,/.test(data))throw Error('請選擇有效的 PNG、JPG 或 WebP 圖片。');
 const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('圖片無法讀取，請重新選擇。'));img.src=data;});
 if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>40000000)throw Error('圖片尺寸過大，請縮小後再上傳。');
 const max=kind==='avatar'?512:1600,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);let result=canvas.toDataURL('image/png');
 for(let i=0;result.length>699075&&i<5;i++){const smaller=document.createElement('canvas');smaller.width=Math.max(1,Math.floor(canvas.width*.7));smaller.height=Math.max(1,Math.floor(canvas.height*.7));smaller.getContext('2d').drawImage(canvas,0,0,smaller.width,smaller.height);canvas.width=smaller.width;canvas.height=smaller.height;canvas.getContext('2d').drawImage(smaller,0,0);result=canvas.toDataURL('image/png');}
 if(result.length>699075)throw Error('圖片仍超過儲存上限，請縮小後再上傳。');return result;
}
export async function readWorkspaceImageFile(file,kind){if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2097152)throw Error('請選擇 2 MB 以內的 PNG、JPG 或 WebP 圖片。');const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(Error('圖片讀取失敗。'));r.readAsDataURL(file);});return prepareWorkspaceImage(data,kind);}
