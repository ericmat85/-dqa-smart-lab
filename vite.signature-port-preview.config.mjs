import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
 plugins:[react()],
 build:{cssCodeSplit:false,assetsInlineLimit:Infinity,rolldownOptions:{input:fileURLToPath(new URL('./dev/digital-signature-port-preview.html',import.meta.url))}},
});
