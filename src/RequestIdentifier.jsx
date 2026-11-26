import './RequestIdentifier.css';
export default function RequestIdentifier({children}){return <span className="request-identifier">{children}</span>;}
export function RequestText({children}){if(typeof children!=='string')return children;return children.split(/((?<![A-Za-z0-9_-])REQ-(?:[A-Za-z0-9]+-)*[A-Za-z0-9]+)/g).map((part,i)=>/^REQ-/.test(part)?<RequestIdentifier key={i}>{part}</RequestIdentifier>:part);}
