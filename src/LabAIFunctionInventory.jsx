import {ENGINE_CAPABILITIES} from './labAIWorkbench.mjs';
import './LabAIWorkbench.css';
export default function LabAIFunctionInventory({engine}){
 const entries=engine?[[engine,ENGINE_CAPABILITIES[engine]]]:Object.entries(ENGINE_CAPABILITIES);
 return <details className="lab-ai-capabilities"><summary>{engine?engine+' 功能與使用範圍':'E1–E4 功能盤點'}<span>既有能力・新增任務・使用限制</span></summary><div className="lab-ai-capability-grid">{entries.map(([code,c])=><article key={code}><header><b>{code}</b><h4>{c.title}</h4></header><h5>既有能力</h5><ul>{c.current.map(s=><li key={s}>{s}</li>)}</ul><h5>本次新增</h5><ul>{c.added.map(s=><li key={s}>{s}</li>)}</ul><p>{c.limits}</p></article>)}</div></details>;
}
