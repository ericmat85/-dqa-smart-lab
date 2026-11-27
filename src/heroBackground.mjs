import {appStorage} from './originalBusiness.mjs';
export const HERO_BACKGROUND_KEY='dqa-ui-preferences-v2-hero-background';
export const HERO_BACKGROUNDS=Object.freeze([
 ['ocean','深海藍','深藍與青綠的流動光線'],['indigo','靛藍光譜','層疊幾何與靛藍光暈'],['aurora','極光映色','青紫色的柔和光帶'],['sky','晴空軌跡','藍色弧線與星點'],['forest','翠綠山嵐','森林綠的層次輪廓'],['slate','岩灰網格','低彩度的精密網格'],['sunset','暮光暖橙','深藍與琥珀色的交會'],['wine','酒紅曲線','酒紅色的優雅波紋'],['violet','紫晶稜鏡','紫色幾何稜線'],['graphite','墨色光影','石墨黑與銀灰軌道'],
].map(([id,name,description])=>Object.freeze({id,name,description})));
export function normalizeHeroBackground(value){
 if(value?.preset==='custom'&&typeof value.image==='string'&&value.image.length<=800000&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value.image))return {preset:'custom',image:value.image};
 return {preset:HERO_BACKGROUNDS.some(p=>p.id===value?.preset)?value.preset:'ocean',image:''};
}
export function readHeroBackground(storage=appStorage()){try{return normalizeHeroBackground(JSON.parse(storage.getItem(HERO_BACKGROUND_KEY)||'null'));}catch{return normalizeHeroBackground(null);}}
export function saveHeroBackground(value,storage=appStorage()){const next=normalizeHeroBackground(value);if(value?.preset==='custom'&&next.preset!=='custom')throw Error('背景圖片格式不正確或超過儲存上限。');storage.setItem(HERO_BACKGROUND_KEY,JSON.stringify(next));if(typeof window!=='undefined')window.dispatchEvent(new Event('dqa:hero-background'));return next;}
export function heroBackgroundStyle(value){const next=normalizeHeroBackground(value),src=next.preset==='custom'?next.image:`${import.meta.env?.BASE_URL||'/'}branding/hero/${next.preset}.svg`;return {backgroundImage:`linear-gradient(90deg,rgba(6,18,38,.72),rgba(6,18,38,.3)),url("${src}")`,backgroundSize:'cover',backgroundPosition:'center'};}
export async function prepareHeroImage(file){
 if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('請選擇 5 MB 以內的 PNG、JPG 或 WebP 圖片。');
 let bitmap;try{bitmap=await createImageBitmap(file);if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>40000000)throw Error('圖片尺寸過大，請使用 4000 萬像素以內的圖片。');const scale=Math.min(1,1920/bitmap.width,1080/bitmap.height),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const context=canvas.getContext('2d');context.fillStyle='#142d48';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);for(const quality of [.86,.72,.56,.4]){const image=canvas.toDataURL('image/jpeg',quality);if(image.length<=800000)return image;}throw Error('圖片內容過大，請縮小圖片後再試。');}catch(error){throw Error(error.message?.includes('圖片')?error.message:'無法讀取圖片，請選擇有效的 PNG、JPG 或 WebP 圖片。');}finally{bitmap?.close();}
}
