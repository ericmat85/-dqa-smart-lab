import {randomBytes} from 'node:crypto';
import {deflateSync} from 'node:zlib';
export function syntheticReportPhoto(){
 const chunk=(type,bytes)=>{const t=Buffer.from(type),data=Buffer.concat([t,bytes]);let crc=0xffffffff;for(const b of data){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}const head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(bytes.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([head,data,tail]);};
 const w=1280,h=1024,header=Buffer.alloc(13),pixels=Buffer.alloc((w*3+1)*h);header.writeUInt32BE(w);header.writeUInt32BE(h,4);header[8]=8;header[9]=2;for(let y=0;y<h;y++)randomBytes(w*3).copy(pixels,y*(w*3+1)+1);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
