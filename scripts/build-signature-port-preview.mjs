// Usage: node scripts/build-signature-port-preview.mjs /absolute/output-directory
// Builds a portable HTML preview without publishing, credentials or API access.
import {build} from 'vite';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
const output=process.argv[2];if(!output)throw Error('An explicit output directory is required');
const root=resolve(import.meta.dirname,'..'),destination=resolve(output),temp=resolve(destination,'.preview-build');
await mkdir(destination,{recursive:true});
await build({root,configFile:resolve(root,'vite.signature-port-preview.config.mjs'),base:'./',build:{outDir:temp,emptyOutDir:true}});
const htmlFile=resolve(temp,'dev/digital-signature-port-preview.html');let html=await readFile(htmlFile,'utf8');
for(const match of [...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g)]){
 const js=await readFile(resolve(dirname(htmlFile),match[1]),'utf8');html=html.replace(match[0],()=>'<script type="module">'+js.replace(/<\/script/gi,'<\\/script')+'</script>');
}
for(const match of [...html.matchAll(/<link\b[^>]*href="([^"]+)"[^>]*>/g)]){
 if(!/rel="stylesheet"/.test(match[0]))throw Error('Unexpected external resource in portable preview');
 const css=await readFile(resolve(dirname(htmlFile),match[1]),'utf8');html=html.replace(match[0],()=>'<style>'+css.replace(/<\/style/gi,'<\\/style')+'</style>');
}
const markup=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
if(/<(?:script|link)\b[^>]*(?:src|href)=/.test(markup))throw Error('Preview is not standalone');
const final=resolve(destination,'digital-signature-port-preview.html');await writeFile(final,html);await rm(temp,{recursive:true,force:true});
console.log(final);
