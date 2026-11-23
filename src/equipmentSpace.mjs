// U is an administrative space quota. Never convert litres or dimensions to U.
export function equipmentSpaceUnits(machine){
 const raw=machine&&Object.hasOwn(machine,'spaceUnits')?machine.spaceUnits:machine?.capacity;
 if(raw===null||raw===undefined||String(raw).trim()==='')return null;
 const n=Number(raw);return Number.isSafeInteger(n)&&n>=1&&n<=100000?n:null;
}
export function requireEquipmentSpaceUnits(value){
 if(value===null||value===undefined||String(value).trim()==='')throw Error('請填寫可用空間 U。');
 const n=Number(value);if(!Number.isSafeInteger(n)||n<1||n>100000)throw Error('可用空間 U 必須是 1～100000 的整數。');return n;
}
