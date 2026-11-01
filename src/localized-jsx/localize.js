import {translateText} from '../i18n.mjs';
function children(value){
 if(Array.isArray(value)){
  if(value.every(child=>typeof child==='string'||typeof child==='number')){const joined=value.join(''),translated=translateText(joined);if(translated!==joined)return translated;}
  return value.map(child=>typeof child==='string'?translateText(child):child);
 }
 return typeof value==='string'?translateText(value):value;
}
export function localizeProps(type,props){
 if(typeof type!=='string'||!props)return props;
 const next={...props};
 // Option labels can change language; their submitted values must stay unchanged.
 if(type==='option'&&props.value===undefined){if(typeof props.children==='string'||typeof props.children==='number')next.value=props.children;else if(Array.isArray(props.children)&&props.children.every(child=>typeof child==='string'||typeof child==='number'))next.value=props.children.join('');}
 for(const key of ['aria-label','title','placeholder','alt'])if(typeof next[key]==='string')next[key]=translateText(next[key]);
 if('children'in next)next.children=children(next.children);
 if(props.style?.fontSize!==undefined){const size=props.style.fontSize;if(typeof size==='number'||/^\d+(\.\d+)?px$/.test(size))next.style={...props.style,fontSize:`calc(${typeof size==='number'?size+'px':size} * var(--ui-font-scale,1))`};}
 return next;
}
