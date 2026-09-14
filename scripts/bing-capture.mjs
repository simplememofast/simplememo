import os from 'node:os';
import path from 'node:path';
import {bingCapture,bingView} from '../growth/lib/company-bing.mjs';
const args=process.argv.slice(2);
const option=(key,fallback)=>{const i=args.indexOf('--'+key);return i<0?fallback:args[i+1];};
try {
  const stateRoot=option('state-root',path.join(os.homedir(),'.config/simplememo/company-os'));
  const action=args[0]??'status';
  if(!['status','begin','complete','fail','view'].includes(action))throw new Error('invalid_action');
  console.log(JSON.stringify(action==='view'?bingView({stateRoot}):bingCapture({stateRoot,action,outcome:option('outcome'),attemptId:option('attempt')}),null,2));
} catch {console.error('Bing capture state unavailable or invalid; do not retry without inspecting the retained state.');process.exitCode=1;}
