import {useEffect,useState} from 'react';
export default function useSidebarMobile(maxWidth){
 const [mobile,setMobile]=useState(()=>window.matchMedia(`(max-width: ${maxWidth}px)`).matches);
 useEffect(()=>{const query=window.matchMedia(`(max-width: ${maxWidth}px)`),sync=()=>setMobile(query.matches);sync();query.addEventListener('change',sync);return()=>query.removeEventListener('change',sync);},[maxWidth]);
 return mobile;
}
