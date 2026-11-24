import {assetBytes} from './assetBytes.mjs';
import seed from './generalDemoSeed.json' with {type:'json'};
const cols=['Q','V','AA','AF','AK'];
const resultRows=[82,83,84,85,86,87,88,91,94,97,118,119,120,121,122,123,124,125,126,127,128,147,148,149,150,151,152,153,154,155,156,158,160,189,190,191,192,193,209,211,213,219,220,221,222,223,224,225,226,227,228];
const datestring=value=>{if(!value)return '';const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'}):'';};
export async function fillGeneralDemo(book,request,{specimenImages}={}){
 const count=request.quantity===undefined?1:Number(request.quantity);
 if(!Number.isInteger(count)||count<1||count>5)throw Error('一般性能 Demo 範本目前支援 1～5 支樣品，請確認委託數量；不得省略其餘樣品。');
 seed.forEach((cells,index)=>{const sheet=book.worksheets[index];for(const [address,data]of Object.entries(cells)){
  const cell=sheet.getCell(address);cell.style={...cell.style};cell.value=data.value;cell.numFmt=data.numFmt;cell.font={size:data.size,color:{argb:'FF000000'}};
  cell.alignment={horizontal:data.alignment.horizontal||'center',vertical:data.alignment.vertical==='center'?'middle':data.alignment.vertical||'middle',wrapText:true};
 }});
 const cover=book.getWorksheet('1.1一般性能試驗-1'),detail=book.getWorksheet('1.1一般性能試驗-2');
 if(!cover.getCell('N18').isMerged)cover.mergeCells('N18:AR18');
 for(const address of ['A40','W40'])cover.getCell(address).value=cover.getCell(address).value.replaceAll('5/5',`${count}/${count}`);
 cover.getCell('N17').value=count;
 book.eachSheet(ws=>ws.eachRow(row=>row.eachCell(cell=>{if(cell.isMerged&&cell.master.address!==cell.address)return;if(typeof cell.value==='string')cell.value=cell.value.replace(/5\s*支/g,`${count} 支`).replace(/5 samples/g,`${count} samples`);})));
 const first=datestring(request.execution?.plannedStart),last=datestring(request.execution?.completedAt);
 const observations=[...new Set([first,last].filter(Boolean))];
 for(let index=0;index<5;index++)for(let row=5;row<=7;row++){
  const col=10+index*3,cell=detail.getCell(row,col);
  if(index<observations.length){cell.value=row===5?observations[index].slice(5).replace('-','/'):row===6?24.8+index*.3:50+index;}
  else{cell.value=null;for(let offset=0;offset<3;offset++)detail.getCell(row,col+offset).style={...detail.getCell(row,25+offset).style};}
 }
 // The specimen matrix has five places. Never populate unused specimens.
 for(let index=count;index<5;index++){
  for(const row of resultRows)detail.getCell(cols[index]+row).value='N/A';
  for(const col of ['G','L','Q','V','AA','AF','AK'])detail.getCell(col+(166+index)).value='N/A';
 }
 for(const cell of ['AP82','AP88','AP209'])detail.getCell(cell).value=String(detail.getCell(cell).value||'').replaceAll('5支',`${count}支`);
 const notes=[['AP82',first],['AP119',first],['AP147',last],['AP189',last],['AP209',last]];
 for(const [address,date]of notes)detail.getCell(address).value=String(detail.getCell(address).value||'').replace(/10\/2[89]/g,date?date.slice(5).replace('-','/'):'日期待確認');
 const purpose=(request.purpose||[]).join(' ').replaceAll(' ','');
 for(const [address,label]of Object.entries({F4:'新產品',F5:'設計變更',F6:'量產品',O4:'手工品',O5:'型物品',O6:'本型本工程',U4:'再現試驗',U5:'定期抽測'}))cover.getCell(address).value=purpose.includes(label)?'■':'□';
 const origin=(request.sampleSource||[]).join(' ');
 for(const [address,label]of Object.entries({F7:'社內',F8:'廠商',U7:'海外廠',U8:'競品',AG7:'客戶'}))cover.getCell(address).value=origin.includes(label)?'■':'□';
 detail.getCell('A37').value=`試驗後 ${count}/${count} 支外觀與顯示無異常（DEMO 模擬，非實拍）`;
 for(const [stage,locations]of [[0,[[0,10],[16,10],[32,10],[0,23],[16,23]]],[1,[[0,38],[16,38],[32,38],[0,51],[16,51]]]]){
  for(let i=0;i<5;i++){
   const [col,row]=locations[i];
   if(i>=count){const cell=detail.getCell(row+1,col+1);cell.value='N/A（本案未使用）';cell.style={...cell.style,font:{size:7},alignment:{horizontal:'left',vertical:'middle',wrapText:false}};continue;}
   let bytes=specimenImages?.[`${i+1}_${stage}`];
   if(!bytes&&typeof window!=='undefined'){
    bytes=new Uint8Array(await assetBytes(`${import.meta.env?.BASE_URL||'/'}demo-report-images/示意_${i+1}_${stage}.png`,{message:'Demo 樣品示意圖載入失敗，請重新產生。'}));
   }
   if(bytes){const image=book.addImage({buffer:bytes,extension:'png'});detail.addImage(image,{tl:{col,row},ext:{width:308,height:218},editAs:'oneCell'});}
  }
 }
}
