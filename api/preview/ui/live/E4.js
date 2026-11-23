// Explicit E4 entry; all authentication and Gateway logic stays in createHandler.
import {createHandler} from '../../[...path].js';
const handle=createHandler({entrypointPath:'/ui/live/E4'});
export default function e4(req,res){
  res.setHeader('X-Preview-Entrypoint','E4_EXPLICIT');
  return handle(req,res);
}
