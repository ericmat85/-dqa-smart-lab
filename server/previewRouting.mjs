// Canonicalize only known Preview paths. Routing metadata never grants identity.
const prefix='/api/preview';
const internal=new Set([prefix,prefix+'/',prefix+'/[...path]',prefix+'/[...path].js']);
export const isAllowedPreviewPath=path=>/^\/(?:session|health\/(?:live|ready)|ui\/(?:bootstrap|knowledge|live\/E[1-4]|requests(?:\/REQ-\d{4}-[0-9a-f]{8}(?:\/actions|\/engines\/E[1-4])?)?))$/.test(path);
function segments(value){
 if(value===undefined)return null;
 const list=typeof value==='string'?value.split('/'):Array.isArray(value)?value:null;
 if(!list?.length||list.length>6||!list.every(x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x)))throw Error('INVALID_ROUTE_PARAMETERS');
 const path='/'+list.join('/');if(!isAllowedPreviewPath(path))throw Error('ROUTE_NOT_ALLOWED');return path;
}
export function resolvePreviewRoute(req,{origin,entrypointPath}={}){
 const diagnostic={pathname:'[UNRECOGNIZED_PATH]',query_keys:[],parameter_shape:'none',source:'REJECTED',reason:'INVALID_PATH'};
 try{
  let raw=req.url;if(typeof raw!=='string'||raw.length>4096||/[\\#\r\n]/.test(raw))throw Error('INVALID_URL');
  if(raw.startsWith('https://')){
   const absolute=new URL(raw);if(absolute.origin!==origin||absolute.username||absolute.password)throw Error('FOREIGN_ORIGIN');
   raw=raw.replace(/^https:\/\/[^/?#]+/,'')||'/';
  }
  if(!raw.startsWith('/')||raw.startsWith('//'))throw Error('INVALID_PATH');
  const qmark=raw.indexOf('?'),pathname=qmark<0?raw:raw.slice(0,qmark),query=qmark<0?'':raw.slice(qmark+1);
  if(/%|\/\//.test(pathname)||pathname.split('/').some(x=>x==='.'||x==='..'))throw Error('UNSAFE_PATH');
  const params=new URLSearchParams(query);const names=[...params.keys()];
  diagnostic.query_keys=[...new Set(names.map(x=>x==='path'?'path':'OTHER_QUERY'))];
  const normalized=pathname.length>1&&pathname.endsWith('/')?pathname.slice(0,-1):pathname;
  const publicPath=normalized.startsWith(prefix+'/')?normalized.slice(prefix.length):null;
  if(internal.has(pathname)||publicPath&&isAllowedPreviewPath(publicPath)||entrypointPath&&[entrypointPath,prefix+entrypointPath+'.js'].includes(normalized))diagnostic.pathname=pathname;
  if(names.some(x=>x!=='path')||params.getAll('path').length>1)throw Error('UNEXPECTED_QUERY');
  const queryValue=params.has('path')?params.get('path'):undefined;
  const queryObject=req.query?.path,routeObject=req.params?.path;
  if(req.query&&Object.keys(req.query).some(x=>x!=='path'))throw Error('UNEXPECTED_QUERY');
  diagnostic.parameter_shape=Array.isArray(queryObject??routeObject)?'array':typeof(queryObject??routeObject)==='string'?'string':'none';
  const hints=[queryValue,queryObject,routeObject].filter(x=>x!==undefined).map(segments);
  if(hints.some(x=>x!==hints[0]))throw Error('ROUTE_PARAMETER_MISMATCH');
  let path;
  if(publicPath&&isAllowedPreviewPath(publicPath)){
   path=publicPath;diagnostic.source=pathname.endsWith('/')?'PUBLIC_TRAILING_SLASH':'PUBLIC_PATH';
   if(hints.length&&hints[0]!==path)throw Error('ROUTE_PARAMETER_MISMATCH');
  }else if(internal.has(pathname)&&hints.length){path=hints[0];diagnostic.source='CATCHALL_ROUTE_PARAMETERS';}
  else if(entrypointPath&&[entrypointPath,prefix+entrypointPath+'.js'].includes(normalized)){
   path=entrypointPath;diagnostic.source='EXPLICIT_ENTRYPOINT';
   if(hints.length&&hints[0]!==path)throw Error('ROUTE_PARAMETER_MISMATCH');
  }else throw Error('ROUTE_NOT_ALLOWED');
  if(entrypointPath&&path!==entrypointPath)throw Error('ENTRYPOINT_MISMATCH');
  diagnostic.reason='MATCHED';diagnostic.resolved_path=path;return {path,diagnostic};
 }catch(e){diagnostic.source='REJECTED';diagnostic.reason=e.message;return {path:null,diagnostic};}
}
