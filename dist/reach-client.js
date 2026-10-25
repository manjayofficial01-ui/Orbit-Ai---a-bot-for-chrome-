import {ReachError,normalizeReachRequest,normalizeReachStatus} from './reach-core.js';

export const REACH_HOST='ai.orbit.agent_reach';

function bridgeError(error){
  const message=String(error?.message||error||'Native messaging failed.').slice(0,500);
  if(/host not found|not found.*native messaging/i.test(message))return new ReachError('BRIDGE_NOT_FOUND','Orbit Reach bridge is not installed.','Run the one-time installer shown in Settings → Reach.');
  if(/forbidden|not allowed/i.test(message))return new ReachError('BRIDGE_FORBIDDEN','Chrome blocked this extension from using the Reach bridge.','Reinstall the bridge with this extension’s exact ID.');
  return new ReachError('BRIDGE_UNAVAILABLE','Reach bridge unavailable: '+message,'Check the bridge installation and Agent Reach setup.');
}

function supervise(promise,{signal,timeoutMs}){
  return new Promise((resolve,reject)=>{
    let done=false;
    const finish=(fn,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',aborted);fn(value);};
    const timer=setTimeout(()=>finish(reject,new ReachError('BRIDGE_TIMEOUT','The local Reach bridge did not respond in time.','Retry once; if it persists, run agent-reach doctor in your terminal.')),timeoutMs);
    const aborted=()=>finish(reject,new ReachError('CANCELLED','Reach request cancelled.'));
    if(signal?.aborted)return aborted();
    signal?.addEventListener('abort',aborted,{once:true});
    Promise.resolve(promise).then(value=>finish(resolve,value),error=>finish(reject,bridgeError(error)));
  });
}

export async function reachRequest(request,{signal,transport,timeoutMs}={}){
  signal?.throwIfAborted?.();
  const message=normalizeReachRequest(request);
  const send=transport||((host,payload)=>chrome.runtime.sendNativeMessage(host,payload));
  let response;
  try{response=await supervise(Promise.resolve().then(()=>send(REACH_HOST,message)),{signal,timeoutMs:timeoutMs||(message.op==='status'?20000:90000)});}
  catch(error){throw error instanceof ReachError?error:bridgeError(error);}
  if(!response||typeof response!=='object')throw new ReachError('BRIDGE_INVALID_RESPONSE','The local Reach bridge returned no valid response.');
  if(response.bridge_error){const e=response.error||{};throw new ReachError(String(e.code||'BRIDGE_ERROR').slice(0,50),String(e.message||'Reach bridge failed.').slice(0,500),String(e.hint||'').slice(0,500));}
  return response;
}

export async function reachStatus(options={}){
  return normalizeReachStatus(await reachRequest({op:'status'},options));
}
