// Accept the familiar RT-2 input and store one canonical #RT-2 identity.
export function validateSampleNumbers(values,quantity){
 const errors={};
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000||!Array.isArray(values)||values.length!==quantity)return {valid:false,codes:[],errors,summary:'樣品編號欄位數量必須與委託單樣品數量一致。'};
 const codes=values.map(value=>{const text=typeof value==='string'?value.trim().toUpperCase():'';return text.startsWith('#')?text:'#'+text;});
 const positions=new Map();
 codes.forEach((code,i)=>{
  if(!/^#[A-Z]{2}-[1-9][0-9]{0,17}$/.test(code))errors[i]='請填寫兩個英文字母及正整數，例如 RT-2。';
  else if(code[1]===code[2])errors[i]='兩個英文字母不可相同，例如 RR-2 無效。';
  if(errors[i])return;
  if(positions.has(code)){errors[i]='編號與第 '+(positions.get(code)+1)+' 件樣品重複。';errors[positions.get(code)]='編號與第 '+(i+1)+' 件樣品重複。';}else positions.set(code,i);
 });
 return {valid:Object.keys(errors).length===0,codes,errors,summary:Object.keys(errors).length?'請再次確認並修正標示的編號，完成後再儲存。':''};
}
