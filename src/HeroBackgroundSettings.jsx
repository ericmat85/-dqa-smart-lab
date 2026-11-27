import {useState} from 'react';
import {HERO_BACKGROUNDS,heroBackgroundStyle,prepareHeroImage,saveHeroBackground} from './heroBackground.mjs';
import useHeroBackground from './useHeroBackground.js';
import './HeroBackgroundSettings.css';
export default function HeroBackgroundSettings({canManage=true}){
 const saved=useHeroBackground(),[draft,setDraft]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),value=draft||saved;
 const selected=value.preset==='custom'?'自訂背景圖':HERO_BACKGROUNDS.find(p=>p.id===value.preset)?.name,changed=!!draft&&JSON.stringify(draft)!==JSON.stringify(saved);
 function choose(preset){setDraft({preset,image:''});setError('');setNotice('');}
 async function upload(event){const file=event.target.files?.[0];event.target.value='';if(!file)return;setBusy(true);setError('');setNotice('');try{setDraft({preset:'custom',image:await prepareHeroImage(file)});}catch(error){setError(error.message);}finally{setBusy(false);}}
 function save(){try{saveHeroBackground(value);setDraft(null);setNotice('主題背景已儲存，管理總覽將立即套用。');setError('');}catch{setError('背景尚未儲存，請確認瀏覽器儲存空間與權限。');}}
 return <section className="hero-background-settings" aria-labelledby="hero-background-title"><header><div><h3 id="hero-background-title">主題框格背景</h3><p>為管理總覽選擇背景圖，或上傳自己的圖片。設定保留於目前瀏覽器。</p></div><span className="admin-badge">{selected}</span></header>
 <div className="hero-background-preview" style={heroBackgroundStyle(value)} aria-label="主題背景預覽"><span>LABORATORY CONTROL CENTER</span><h4>DQA Smart Lab 實驗室</h4><p>工作區資訊與最新狀態，在這裡清楚呈現。</p></div>
 <fieldset disabled={!canManage||busy}><legend>10 組精選背景</legend><div className="hero-background-presets">{HERO_BACKGROUNDS.map(p=><button type="button" key={p.id} aria-pressed={value.preset===p.id} aria-label={p.name} title={p.description} onClick={()=>choose(p.id)}><span className="hero-preset-image" style={heroBackgroundStyle({preset:p.id})} aria-hidden="true"/><span>{p.name}<i aria-hidden="true">{value.preset===p.id?'✓':''}</i></span></button>)}</div><label className="hero-background-upload"><strong>上傳自訂背景圖</strong><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="上傳主題背景圖" onChange={upload}/><small>PNG、JPG、WebP，5 MB 以內。建議使用 1920 × 640 的橫向圖片；自動縮圖並加上深色遮罩，讓文字保持清楚。</small></label></fieldset>
 {error&&<p role="alert" className="management-error">{error}</p>}{notice&&<p role="status">{notice}</p>}{!canManage&&<p>目前為唯讀，請由管理者設定主題背景。</p>}
 <footer><span>{busy?'正在處理圖片…':changed?'預覽尚未儲存':'目前背景已套用'}</span><div><button type="button" className="template-btn secondary" disabled={!canManage||busy} onClick={()=>choose('ocean')}>還原預設</button><button type="button" className="template-btn secondary" disabled={!draft||busy} onClick={()=>{setDraft(null);setError('');setNotice('');}}>取消</button><button type="button" className="template-btn" disabled={!canManage||busy||!changed} onClick={save}>儲存主題背景</button></div></footer></section>;
}
