import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// A physical-entry HTTP harness, separate from the handler's logical-route parser.
// The repeat-parameter syntax is also checked with Vercel's official compiler
// during this change's compatibility verification (no production dependency).
const root=new URL('../../',import.meta.url);
export async function fixedBusinessRouter(handler,{rewrites=true}={}){
 const config=JSON.parse(await readFile(new URL('vercel.json',root),'utf8'));
 const rule=config.rewrites.find(x=>x.source==='/api/business/:path+');
 if(rewrites&&rule?.destination!=='/api/business?path=:path')throw Error('Fixed business rewrite is missing or inconsistent');
 return async(req,res)=>{
  const raw=new URL(req.url,'http://fixture.invalid'),path=raw.pathname;
  if(!path.startsWith('/api/business')){res.statusCode=404;return res.end('Unmapped fixture route');}
  const relative=path.replace(/^\//,''),file=new URL(relative+'.js',root),isFixed=/^\/api\/business\/[A-Za-z0-9/-]+$/.test(path)&&existsSync(fileURLToPath(file));
  if(isFixed||path==='/api/business')return handler(req,res);
  const match=rewrites&&path.match(/^\/api\/business\/(.+)$/);
  if(!match){res.statusCode=404;res.setHeader('Content-Type','text/html');return res.end('<html>Unmapped nested function</html>');}
  const params=new URLSearchParams();params.append('path',match[1]);for(const [key,value] of raw.searchParams)params.append(key,value);
  req.url='/api/business?'+params;req.query=Object.fromEntries(params);return handler(req,res);
 };
}
