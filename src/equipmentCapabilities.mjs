import {TRIAL_CONDITIONS} from './trialDefinitionDetails.mjs';
const normalUnit=u=>({kN:'N',kHz:'Hz',MPa:'kPa'})[u]||u;
const factor=u=>['kN','kHz','MPa'].includes(u)?1000:1;
export function validateEquipmentCapabilities(rows){
 if(!Array.isArray(rows)||rows.length>12)throw Error('設備技術規格最多 12 組。');
 const seen=new Set();return rows.map(r=>{const type=TRIAL_CONDITIONS.find(t=>t.id===r?.kind),key=r?.kind+':'+normalUnit(r?.unit);
  if(!r||Object.keys(r).sort().join()!=='kind,lower,unit,upper'||!type||!type.units.includes(r.unit)||seen.has(key)||[r.lower,r.upper].some(v=>v===null||v===undefined||String(v).trim()===''||!Number.isFinite(Number(v))||Math.abs(Number(v))>1e9)||Number(r.lower)>Number(r.upper))throw Error('請確認規格類型、單位與上下限；同類型及單位不可重複。');
  seen.add(key);return {...r,lower:Number(r.lower),upper:Number(r.upper)};
 });
}
export function capabilityCompatibility(machine,requirements=[]){
 const reasons=[];for(const c of requirements){if(c.lower===null&&c.upper===null)continue;const label=TRIAL_CONDITIONS.find(t=>t.id===c.kind)?.label||c.kind;
  const caps=(machine.capabilities||[]).filter(r=>r.kind===c.kind&&normalUnit(r.unit)===normalUnit(c.unit));
  if(!caps.length){reasons.push('缺少'+label+'規格（'+c.unit+'），請補齊資料');continue;}
  const fits=caps.some(r=>[r.lower,r.upper].every(Number.isFinite)&&r.lower<=r.upper&&(c.lower===null||r.lower*factor(r.unit)<=c.lower*factor(c.unit))&&(c.upper===null||r.upper*factor(r.unit)>=c.upper*factor(c.unit)));
  if(!fits)reasons.push(label+'需求 '+(c.lower??'—')+'～'+(c.upper??'—')+' '+c.unit+' 超過設備規格 '+caps.map(r=>r.lower+'～'+r.upper+' '+r.unit).join('、'));
 }
 return {compatible:reasons.length===0,reasons,reason:reasons.join('；')};
}
export const capabilityLabel=r=>(TRIAL_CONDITIONS.find(t=>t.id===r.kind)?.label||r.kind)+'：'+r.lower+'～'+r.upper+' '+r.unit;
