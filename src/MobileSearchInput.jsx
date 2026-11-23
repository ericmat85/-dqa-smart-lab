import {useId,useRef} from 'react';
import useSidebarMobile from './useSidebarMobile.js';
import './MobileSearchInput.css';
export default function MobileSearchInput({onClear,labelNode,labelClassName,inlineLabel=false,...props}){
 const mobile=useSidebarMobile(900),generated=useId(),inputRef=useRef(null),id=props.id||generated;
 const input=<input {...props} id={id} ref={inputRef}/>;
 if(!mobile)return labelNode===undefined?input:<label className={labelClassName}>{labelNode}{input}</label>;
 const field=<span className="mobile-clearable-search" data-has-query={Boolean(props.value)}>{input}<button type="button" className="mobile-search-clear" aria-label="清除搜尋與篩選" onClick={()=>{onClear();inputRef.current?.focus({preventScroll:true});}}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg></button></span>;
 return labelNode===undefined?field:<div className={`${labelClassName||''} ${inlineLabel?'mobile-search-inline':'mobile-search-labelled'}`}>{inlineLabel?labelNode:<label htmlFor={id}>{labelNode}</label>}{field}</div>;
}
