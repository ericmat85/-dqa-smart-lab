export const APPEARANCE_DEFAULTS=Object.freeze({tabBarColor:'#142D48',tableHeaderColor:'#D2DCE8',headerColor:'#DCE7F1'});
export const APPEARANCE_PRESETS=Object.freeze([
 {id:'mist',name:'霧藍灰',configuration:APPEARANCE_DEFAULTS},
 {id:'stone',name:'岩石灰',configuration:{tabBarColor:'#263447',tableHeaderColor:'#D9DDE2',headerColor:'#E4E7EC'}},
 {id:'indigo',name:'淡靛藍',configuration:{tabBarColor:'#263456',tableHeaderColor:'#DCE2F4',headerColor:'#E1E7F5'}},
 {id:'warm',name:'暖灰',configuration:{tabBarColor:'#353B47',tableHeaderColor:'#E3DFDA',headerColor:'#ECE9E3'}},
]);
export const isHexColor=value=>typeof value==='string'&&/^#[a-f0-9]{6}$/i.test(value);
export function validateWorkspaceAppearance(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||![2,3].includes(Object.keys(value).length)||!['tabBarColor','tableHeaderColor'].every(key=>Object.hasOwn(value,key)&&isHexColor(value[key]))||Object.entries(value).some(([key,color])=>!Object.hasOwn(APPEARANCE_DEFAULTS,key)||!isHexColor(color)))throw Error('WORKSPACE_APPEARANCE_FIELDS_INVALID');
 return Object.fromEntries(Object.keys(APPEARANCE_DEFAULTS).map(key=>[key,(Object.hasOwn(value,key)?value[key]:APPEARANCE_DEFAULTS[key]).toUpperCase()]));
}
const rgb=color=>[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
export function blendColors(a,b,amount){return '#'+rgb(a).map((v,i)=>Math.round(v*(1-amount)+rgb(b)[i]*amount).toString(16).padStart(2,'0')).join('').toUpperCase();}
function luminance(color){return rgb(color).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);}
export function colorContrast(a,b){const [lo,hi]=[luminance(a),luminance(b)].sort((x,y)=>x-y);return (hi+.05)/(lo+.05);}
export function readableColor(background,preferred='#30465F'){
 if(colorContrast(background,preferred)>=4.5)return preferred;
 return colorContrast(background,'#000000')>colorContrast(background,'#FFFFFF')?'#000000':'#FFFFFF';
}
export function appearancePalette(configuration,dark=false){
 const colors=validateWorkspaceAppearance(configuration),tab=dark?blendColors(colors.tabBarColor,'#071525',.35):colors.tabBarColor,head=dark?blendColors(colors.tableHeaderColor,'#071525',.78):colors.tableHeaderColor;
 const tabText=readableColor(tab,'#D4E2EF'),headText=readableColor(head),search=blendColors(tab,tabText,.09),searchText=readableColor(search,'#F3F9FC');
 const active=dark?'#10263D':colorContrast(tab,'#FFFFFF')>=3?'#FFFFFF':'#142D48',activeText=readableColor(active,dark?'#E6EDF7':'#17253B');
 const header=dark?blendColors(colors.headerColor,'#071525',.78):colors.headerColor,headerText=readableColor(header,'#30465F');
 return {header,headerText,tab,tabText,active,activeText,head,headText,rule:blendColors(head,headText,.2),search,searchText,searchBorder:blendColors(search,searchText,.3),placeholder:colorContrast(search,blendColors(search,searchText,.85))>=4.5?blendColors(search,searchText,.85):searchText};
}
export function appearanceVariables(configuration){
 const variables={};for(const [mode,dark] of [['light',false],['dark',true]])for(const [name,color] of Object.entries(appearancePalette(configuration,dark)))variables[`--workspace-color-${name}-${mode}`]=color;
 return variables;
}
