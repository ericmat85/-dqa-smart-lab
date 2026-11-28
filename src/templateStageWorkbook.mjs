import {templateStageField,stageForField} from './templateStageFields.mjs';
function imageSize(bytes,mime){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(mime==='png'&&bytes.length>=24&&v.getUint32(0)===0x89504e47)return {width:v.getUint32(16),height:v.getUint32(20)};
 if(mime==='jpeg'&&bytes[0]===255&&bytes[1]===216){let p=2;while(p+4<bytes.length){if(bytes[p]!==255)break;const marker=bytes[p+1];if(marker===217||marker===218)break;const size=v.getUint16(p+2);if(size<2||p+2+size>bytes.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&size>=7)return {width:v.getUint16(p+7),height:v.getUint16(p+5)};p+=2+size;}}
 throw Error('簽名圖片格式無法驗證。');
}
export async function applyStageSignature(book,sheet,cell,fieldId,context){
 const f=templateStageField(fieldId),entry=context.stages?.[stageForField(f,context)];cell.value='';if(!entry?.signature_data)return;
 const match=/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(entry.signature_data);if(!match)throw Error('簽名圖檔無效。');const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));if(bytes.length>1048576)throw Error('簽名圖檔超限。');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(hash!==entry.signature_sha256)throw Error('簽名圖檔完整性驗證失敗。');
 const size=imageSize(bytes,match[1]);if(!size.width||!size.height||size.width>12000||size.height>12000)throw Error('簽名圖片尺寸無效。');
 const merge=sheet.model.merges?.find(r=>r.split(':')[0]===cell.address),last=sheet.getCell(merge?.split(':')[1]||cell.address);let width=0,height=0;
 for(let col=cell.col;col<=last.col;col++)width+=(sheet.getColumn(col).width||8.43)*7+5;for(let row=cell.row;row<=last.row;row++)height+=(sheet.getRow(row).height||15)*4/3;
 const scale=Math.min((width-4)/size.width,(height-4)/size.height,1),image=book.addImage({base64:entry.signature_data,extension:match[1]});sheet.addImage(image,{tl:{col:cell.col-1,row:cell.row-1,colOff:19050,rowOff:19050},ext:{width:Math.max(1,size.width*scale),height:Math.max(1,size.height*scale)},editAs:'oneCell'});
}
