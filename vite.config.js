import {fileURLToPath} from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  optimizeDeps:{exclude:['@dqa/i18n/jsx-runtime','@dqa/i18n/jsx-dev-runtime']},
  resolve:{alias:{'@dqa/i18n':fileURLToPath(new URL('./src/localized-jsx',import.meta.url))}},
  plugins: [react({jsxImportSource:'@dqa/i18n'}),{
    name:'dqa-live-localization',enforce:'post',
    // React adds custom JSX runtimes to include; remove them so source dictionaries stay live.
    config(config){if(config.optimizeDeps?.include)config.optimizeDeps.include=config.optimizeDeps.include.filter(dependency=>!dependency.startsWith('@dqa/i18n/'));},
  }],
  css:{postcss:{plugins:[{postcssPlugin:'dqa-ui-font-scale',Declaration(decl){if(decl.prop==='font-size'&&/^\d*\.?\d+px$/.test(decl.value))decl.value=`calc(${decl.value} * var(--ui-font-scale,1))`;else if(decl.prop==='font'&&!decl.value.includes('--ui-font-scale'))decl.value=decl.value.replace(/(\d*\.?\d+px)/,size=>`calc(${size} * var(--ui-font-scale,1))`);}}]}},
})
