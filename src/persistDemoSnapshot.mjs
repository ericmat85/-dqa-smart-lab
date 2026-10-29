export function persistDemoSnapshot(key,value,previous,storage){
 const serialized=JSON.stringify(value);
 // StrictMode may replay the same effect after another workflow has committed newer data.
 if(previous?.key===key&&previous.serialized===serialized&&storage.getItem(key)!==serialized)return {written:false,stamp:previous};
 storage.setItem(key,serialized);return {written:true,stamp:{key,serialized}};
}
