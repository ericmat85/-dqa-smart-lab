// Explicit filesystem entry; all Session security remains in the shared handler.
import {createHandler} from './[...path].js';
export default createHandler({entrypointPath:'/session'});
