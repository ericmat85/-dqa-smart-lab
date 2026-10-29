import React, { useEffect, useRef, useState } from "react";

export default function SignaturePad({ onChange, label = "手寫簽名" }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  useEffect(() => { const ctx=ref.current?.getContext("2d"); if(ctx){ctx.strokeStyle="#16365e";ctx.fillStyle="#16365e";ctx.lineWidth=2.5;ctx.lineCap="round";ctx.lineJoin="round";} }, []);
  const point = e => { const box=ref.current.getBoundingClientRect(); return {x:(e.clientX-box.left)*ref.current.width/box.width,y:(e.clientY-box.top)*ref.current.height/box.height}; };
  const down = e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drawing.current=true; const p=point(e), c=ref.current.getContext("2d"); c.beginPath(); c.arc(p.x,p.y,1.25,0,Math.PI*2); c.fill(); c.beginPath(); c.moveTo(p.x,p.y); setHasInk(true); };
  const move = e => { if(!drawing.current)return; e.preventDefault(); const p=point(e),c=ref.current.getContext("2d"); c.lineTo(p.x,p.y); c.stroke(); };
  const end = () => { if(!drawing.current)return; drawing.current=false; onChange(ref.current.toDataURL("image/png")); };
  const clear = () => { ref.current.getContext("2d").clearRect(0,0,ref.current.width,ref.current.height); drawing.current=false;setHasInk(false);onChange(""); };
  return <div style={{margin:"10px 0"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:6}}><strong style={{fontSize:13}}>{label}</strong><button type="button" onClick={clear} style={{border:"1px solid #cbd9eb",background:"#fff",color:"#294665",borderRadius:7,padding:"5px 10px",cursor:"pointer"}}>清除</button></div><canvas ref={ref} width={600} height={160} aria-label={label} onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end} style={{display:"block",width:"100%",height:120,background:"white",border:"1px solid #cbd9eb",borderRadius:8,touchAction:"none",cursor:"crosshair"}}/><small style={{display:"block",color:"#7186a3",marginTop:5}}>{hasInk ? "簽名已填寫，可清除後重簽。" : "請使用滑鼠或觸控筆在上方簽名。"}</small></div>;
}
