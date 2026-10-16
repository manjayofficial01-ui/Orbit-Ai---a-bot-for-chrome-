export function normalizeBase(value) {
 const u=new URL(value.trim());
 if(u.username||u.password||u.search||u.hash) throw Error('Base URL cannot contain credentials, query parameters or fragments.');
 if(u.protocol!=='https:' && !(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))) throw Error('Use HTTPS, or HTTP on a loopback server.');
 return u.href.replace(/\/+$/,'');
}
export function hostPattern(base){const u=new URL(normalizeBase(base));return `${u.protocol}//${u.hostname}/*`;}
export function requestBody(config,messages){
 const body={model:config.model,stream:true};
 if(!body.model?.trim())throw Error('Enter a model ID in settings.');
 if(config.format==='responses')Object.assign(body,{input:messages,store:false});else body.messages=messages;
 if(config.temperature!=='') {const n=Number(config.temperature);if(!Number.isFinite(n)||n<0||n>2)throw Error('Temperature must be 0–2.');body.temperature=n;}
 if(config.maxTokens!==''){const n=Number(config.maxTokens);if(!Number.isInteger(n)||n<1||n>128000)throw Error('Output cap must be 1–128000.');body[config.format==='responses'?'max_output_tokens':config.tokenField||'max_completion_tokens']=n;}
 if(config.effort) {if(config.format==='responses')body.reasoning={effort:config.effort};else body.reasoning_effort=config.effort;}
 if(config.search){if(config.format!=='responses'||!['https://api.openai.com','https://api.x.ai'].includes(new URL(config.base).origin))throw Error('Hosted search requires Responses on official OpenAI or xAI hosts.');body.tools=[{type:'web_search'}];}
 const budgetView=JSON.stringify(body,(k,v)=>typeof v==='string'&&v.startsWith('data:image/')?'[attached image]':v);
 if(budgetView.length>60000)throw Error('Conversation exceeds the 60,000-character text budget. Export it and start a new chat.');
 if(JSON.stringify(body).length>5000000)throw Error('Request exceeds the 5 MB transport budget. Remove or reduce screenshot attachments.');
 return body;
}
export function requestAgentBody(config,messages){
  const body=requestBody({...config,search:false},messages);
  body.stream=false;
  const budgetView=JSON.stringify(body,(k,v)=>typeof v==='string'&&v.startsWith('data:image/')?'[attached image]':v);
  if(budgetView.length>60000) throw Error('Conversation exceeds the 60,000-character text budget. Export it and start a new chat.');
  if(JSON.stringify(body).length>5000000) throw Error('Request exceeds the 5 MB transport budget. Remove or reduce screenshot attachments.');
  return body;
}
export async function generateOnce(config,key,messages,{signal,timeoutMs=120000}={}){
  const base=normalizeBase(config.base), body=requestAgentBody(config,messages);
  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(),timeoutMs);
  const onAbort=()=>ctl.abort();
  signal?.addEventListener?.('abort',onAbort,{once:true});
  try{
    const res=await fetch(base+(config.format==='responses'?'/responses':'/chat/completions'),{method:'POST',headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},body:JSON.stringify(body),signal:ctl.signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
    if(!res.ok){ try{ await res.body?.cancel(); }catch{} throw Error('Provider HTTP '+res.status+'. Check your key, model, API format, quota and optional parameters.'); }
    const reader=res.body.getReader();
    let n=0; const parts=[];
    try{ while(true){ const {done,value}=await reader.read(); if(done) break; n+=value.length; if(n>2000000) throw Error('Provider response exceeds 2 MB.'); parts.push(value); } }finally{ try{ await reader.cancel(); }catch{} }
    const bytes=new Uint8Array(n);
    let off=0;
    for(const p of parts){ bytes.set(p,off); off+=p.length; }
    const obj=JSON.parse(new TextDecoder().decode(bytes));
    if(obj.error) throw Error('Provider returned an error.');
    if(obj.status&&obj.status!=='completed') throw Error('Provider returned an incomplete answer.');
    return {text:responseText(obj),sources:citations(obj),usage:obj.usage,raw:obj};
  }finally{ clearTimeout(timer); signal?.removeEventListener?.('abort',onAbort); }
}
export function responseText(obj){return obj.output_text || (obj.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||x.refusal||'').join('') || obj.choices?.[0]?.message?.content || '';}
export function citations(obj){const result=[];for(const item of obj.output||[])for(const c of item.content||[])for(const a of c.annotations||[])if(a.type==='url_citation'&&a.url)result.push(a);return result;}
export function markdown(chat){return '# '+chat.title+'\n\n'+chat.messages.map(m=>'## '+m.role+'\n\n'+m.content+(m.state&&m.state!=='complete'?'\n\n['+m.state+']':'')).join('\n\n');}
export async function readSSE(stream,onEvent){
 const reader=stream.getReader(),decoder=new TextDecoder();let buffer='',data=[],event='',ended=false;
 function line(s){if(s===''){if(data.length)onEvent({event,data:data.join('\n')});data=[];event='';return;}if(s.startsWith(':'))return;const i=s.indexOf(':');let k=i<0?s:s.slice(0,i),v=i<0?'':s.slice(i+1);if(v.startsWith(' '))v=v.slice(1);if(k==='data')data.push(v);if(k==='event')event=v;}
 function drain(final=false){let match;while((match=/\r\n|\r|\n/.exec(buffer))){if(!final&&match[0]==='\r'&&match.index===buffer.length-1)break;line(buffer.slice(0,match.index));buffer=buffer.slice(match.index+match[0].length);}if(buffer.length>1000000)throw Error('Stream frame too large.');if(final){if(buffer)line(buffer);line('');}}
 try{while(!ended){const {done,value}=await reader.read();if(done){buffer+=decoder.decode();drain(true);ended=true;}else{buffer+=decoder.decode(value,{stream:true});drain();}}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export async function generate(config,key,messages,{signal,onText,onSources,onUsage,onSearch}){
 const base=normalizeBase(config.base), body=requestBody(config,messages);
 const res=await fetch(base+(config.format==='responses'?'/responses':'/chat/completions'),{method:'POST',headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},body:JSON.stringify(body),signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
 if(!res.ok) {res.body?.cancel();throw Error(`Provider HTTP ${res.status}. Check your key, model, API format, quota and optional parameters.`);}
 if(!res.headers.get('content-type')?.includes('text/event-stream')){
  const reader=res.body.getReader();let n=0,parts=[];try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>2000000)throw Error('Provider response exceeds 2 MB.');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(n);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}const obj=JSON.parse(new TextDecoder().decode(bytes));if(obj.error)throw Error('Provider returned an error.');onText(responseText(obj));onSources(citations(obj));onUsage(obj.usage);if(obj.status&&obj.status!=='completed')throw Error('Provider returned an incomplete answer.');return;
 }
 let completed=false;
 await readSSE(res.body,({data,event})=>{
  if(data==='[DONE]'){completed=true;return;}let x;try{x=JSON.parse(data);}catch{throw Error('Malformed provider stream.');}
  const type=x.type||event;
  if(x.error||['error','response.failed','response.incomplete'].includes(type))throw Error('Provider reported an error or incomplete output.');
  if(type==='response.output_text.delta'||type==='response.refusal.delta')onText(x.delta||'');
  if(type==='response.output_text.annotation.added'&&x.annotation?.type==='url_citation')onSources([x.annotation]);
  if(type?.startsWith('response.web_search_call.'))onSearch(type.split('.').at(-1));
  if(type==='response.completed'){completed=true;onSources(citations(x.response||{}));onUsage(x.response?.usage);}
  const choice=x.choices?.[0];if(choice){onText(choice.delta?.content||choice.delta?.refusal||'');if(choice.finish_reason){if(!['stop'].includes(choice.finish_reason))throw Error('Generation ended: '+choice.finish_reason);completed=true;}}
  if(x.usage)onUsage(x.usage);
 });
 if(!completed)throw Error('Connection closed before completion.');
}
