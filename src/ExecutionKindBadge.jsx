import {isVirtualRequest} from './requestExecutionKind.mjs';
import './ExecutionKindBadge.css';
export default function ExecutionKindBadge({request}){return isVirtualRequest(request)?<span className="execution-kind-badge is-virtual">虛擬委託</span>:null;}
