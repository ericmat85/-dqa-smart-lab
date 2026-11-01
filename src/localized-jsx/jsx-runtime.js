import {jsx as reactJsx,jsxs as reactJsxs} from 'react/jsx-runtime';
import {localizeProps} from './localize.js';
export {Fragment} from 'react/jsx-runtime';
export function jsx(type,props,key){return reactJsx(type,localizeProps(type,props),key);}
export function jsxs(type,props,key){return reactJsxs(type,localizeProps(type,props),key);}
