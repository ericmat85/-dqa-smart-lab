// Use a standard PDF font for ASCII, avoiding CJK OpenType substitutions that
// can change numeric advances and copied identifiers after PDF embedding.
export function pdfTextLayout(cjk,latin){
 function runs(value){const parts=[];for(const char of String(value)){const font=char.codePointAt(0)<=126?latin:cjk,last=parts.at(-1);if(last?.font===font)last.text+=char;else parts.push({font,text:char});}return parts;}
 const width=(value,size)=>runs(value).reduce((sum,run)=>sum+run.font.widthOfTextAtSize(run.text,size),0);
 function draw(page,value,options){let x=options.x;for(const run of runs(value)){page.drawText(run.text,{...options,x,font:run.font});x+=run.font.widthOfTextAtSize(run.text,options.size);}}
 return {width,draw};
}
