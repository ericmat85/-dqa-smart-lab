import {isVirtualRequest,executionKindLabel} from './requestExecutionKind.mjs';
import './ExecutionKindBadge.css';
export default function ExecutionKindBadge({request}){return <span className={`execution-kind-badge ${isVirtualRequest(request)?'is-virtual':'is-real'}`}>{executionKindLabel(request)}</span>;}
