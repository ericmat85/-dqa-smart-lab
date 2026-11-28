import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Keep the administrator journey in the same isolated business mode as CI.
const files=['workspace-admin-acceptance.spec.mjs','request-workflow.spec.mjs','preapproval-workflow.spec.mjs','human-flow.spec.mjs','original-business.spec.mjs'];
const child=spawn(process.execPath,[fileURLToPath(import.meta.resolve('@playwright/test/cli')),'test',...files,...process.argv.slice(2)],{
 cwd:fileURLToPath(new URL('../../',import.meta.url)),stdio:'inherit',env:{...process.env,BROWSER_MODE:'business'},
});
child.on('error',error=>{process.stderr.write(`Administrator test runner failed: ${error.message}\n`);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
