import {generateOnce} from './core.js';
import {reachRequest} from './reach-client.js';
import {ReachError,REACH_LIMITS,normalizeReachResult,normalizeReachStatus} from './reach-core.js';
import {buildResearchSystem,parseResearchDirective} from './research-protocol.js';

function addSources(result,sources){
  return result.items.slice(0,8).map(item=>{
    let source=null;
    if(item.url){source=sources.find(s=>s.url===item.url);if(!source){source={n:sources.length+1,title:item.title||new URL(item.url).hostname,url:item.url};sources.push(source);}}
    return {...item,source:source?.n||null};
  });
}

export function formatReachObservation(result,sources){
  const items=addSources(result,sources),budget=Math.max(200,Math.floor(3800/Math.max(1,items.length)));
  const data={ok:result.ok,channel:result.channel,action:result.action,backend:result.backend,error:result.error,attempts:result.meta.attempts,items:items.map(item=>({source:item.source,title:item.title.slice(0,160),author:item.author.slice(0,80),published_at:item.publishedAt,text:item.text.slice(0,budget)}))};
  let json=JSON.stringify(data);
  if(json.length>REACH_LIMITS.observation){for(const item of data.items)item.text=item.text.slice(0,200);json=JSON.stringify(data);}
  if(json.length>REACH_LIMITS.observation){data.items=data.items.slice(0,4);json=JSON.stringify(data);}
  return `<untrusted_reach_result>\n${json}\n</untrusted_reach_result>`;
}

function supported(status,request){
  if(request.op==='read'&&!request.channel)return status.channels.some(c=>c.actions.some(a=>a.name==='read'));
  const channel=status.channels.find(c=>c.name===(request.channel||(request.op==='search'?'web':'')));
  return !!channel?.actions.some(a=>a.name===request.op);
}

function unavailable(request){
  return normalizeReachResult({ok:false,channel:request.channel||'',action:request.op,backend:null,items:[],meta:{},error:{code:'UNSUPPORTED_CHANNEL',message:`Agent Reach did not report ${request.channel||'automatic URL'} ${request.op} support.`,hint:'Choose a reported capability or finish without that source.'}});
}

export function finalizeResearchAnswer(answer,sources){
  const observed=new Set(sources.map(source=>source.n));
  return String(answer||'').replace(/\[(\d{1,2})\]/g,(citation,value)=>observed.has(Number(value))?`[${Number(value)}]`:'');
}

export async function runResearchLoop({cfg,key,messages,signal,request=reachRequest,generate=generateOnce,confirm,onEvent=()=>{}}){
  if(typeof confirm!=='function')throw new TypeError('Research requires a per-request confirmation callback.');
  signal?.throwIfAborted?.();
  onEvent({type:'status',text:'Reading local Agent Reach capabilities (no network check)…',calls:0});
  const status=normalizeReachStatus(await request({op:'status'},{signal}));
  if(!status.channels.length)throw new ReachError('NO_CHANNELS','Agent Reach reported no search/read channels.','Run agent-reach setup, then reopen Reach status.');
  const history=[{role:'system',content:buildResearchSystem(status)},...messages],sources=[],trace=[];
  let calls=0,mustFinish=false,protocolRetries=0;
  for(let round=0;round<=REACH_LIMITS.calls;round++){
    signal?.throwIfAborted?.();
    onEvent({type:'thinking',text:calls?`Reviewing research (${calls}/${REACH_LIMITS.calls} Reach calls used)…`:'Planning supervised research…',calls});
    const output=await generate(cfg,key,history,{signal,timeoutMs:120000});
    const raw=String(output?.text||''),directive=parseResearchDirective(raw);
    if(directive.op==='final'&&directive.plain&&calls===0&&protocolRetries<1){
      protocolRetries++;
      onEvent({type:'status',text:'Model replied in prose instead of a research directive; requesting the directive format once…',calls});
      history.push({role:'assistant',content:raw},{role:'user',content:'That reply was chat text, not a research directive. Respond with exactly one JSON object and no other text: {"op":"search","channel":"...","query":"...","limit":5}, {"op":"read","target":"https://..."} or {"op":"read","channel":"...","target":"..."}, or {"op":"final","answer":"..."} to finish without further research.'});
      round--;continue;
    }
    if(directive.op==='final'){
      const text=finalizeResearchAnswer(directive.answer,sources);
      onEvent({type:'answer',text,calls});
      return {text,sources,trace,calls};
    }
    if(mustFinish)throw new ReachError('CALL_LIMIT','Research stopped because the model did not finish within four Reach calls.');
    if(calls>=REACH_LIMITS.calls)throw new ReachError('CALL_LIMIT','Research call limit reached.');
    const proposed=calls+1;
    if(!supported(status,directive)){
      const result=unavailable(directive);calls++;mustFinish=calls>=REACH_LIMITS.calls;
      trace.push({request:directive,outcome:'unsupported',error:result.error});
      history.push({role:'assistant',content:raw},{role:'user',content:formatReachObservation(result,sources)+(mustFinish?'\nThe Reach call budget is exhausted. Return the final JSON response now.':'')});
      onEvent({type:'result',text:`No local support for ${directive.channel||'URL'} ${directive.op}; no network request was made.`,calls});
      continue;
    }
    onEvent({type:'review',text:`Review Agent Reach ${directive.op} request ${proposed}/${REACH_LIMITS.calls}.`,request:directive,proposed});
    if(!await confirm(directive)){
      calls++;mustFinish=calls>=REACH_LIMITS.calls;
      trace.push({request:directive,outcome:'declined'});
      history.push({role:'assistant',content:raw},{role:'user',content:`The user declined this Reach request. Do not repeat it. Finish with available evidence or propose a meaningfully different request.${mustFinish?' The Reach call budget is exhausted; return the final JSON response now.':''}`});
      onEvent({type:'result',text:'Reach request declined; no network request was made.',calls});
      continue;
    }
    onEvent({type:'request',text:`Running Agent Reach ${directive.op} (${proposed}/${REACH_LIMITS.calls})…`,request:directive,proposed});
    const result=normalizeReachResult(await request(directive,{signal}));calls++;mustFinish=calls>=REACH_LIMITS.calls;
    trace.push({request:directive,outcome:result.ok?'complete':'upstream-error',backend:result.backend,error:result.error,attempts:result.meta.attempts});
    history.push({role:'assistant',content:raw},{role:'user',content:formatReachObservation(result,sources)+(mustFinish?'\nThe Reach call budget is exhausted. Return the final JSON response now.':'')});
    onEvent({type:'result',text:result.ok?`Reach returned ${result.items.length} item(s)${result.backend?` via ${result.backend}`:''}.`:`Reach ${result.error.code}: ${result.error.message}`,calls});
  }
  throw new ReachError('CALL_LIMIT','Research exceeded its bounded planning loop.');
}
