export const REACH_LIMITS=Object.freeze({calls:4,items:10,text:12000,observation:7000});

export class ReachError extends Error{
  constructor(code,message,hint=''){super(message);this.name='ReachError';this.code=code;this.hint=hint;}
}

const clean=(value,max=500)=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,max);
const name=(value)=>{const v=clean(value,64);return /^[a-z0-9][a-z0-9_.-]*$/i.test(v)?v:'';};
function fail(message,hint=''){throw new ReachError('BAD_INPUT',message,hint);}

export function safeReachUrl(value){
  try{
    const raw=clean(value,2048),url=new URL(raw);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!url.hostname)return '';
    return url.href;
  }catch{return '';}
}

export function normalizeReachRequest(value){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('Reach request must be an object.');
  const op=value.op;
  if(!['status','search','read'].includes(op))fail('Only Reach status, search, and read are allowed.');
  const allowed=op==='status'?['op']:op==='search'?['op','channel','query','limit']:['op','channel','target'];
  for(const key of Object.keys(value))if(!allowed.includes(key))fail(`Unsupported Reach parameter: ${key}.`);
  if(op==='status')return {op};
  const channel=value.channel===undefined||value.channel===''?'':name(value.channel);
  if(value.channel!==undefined&&value.channel!==''&&!channel)fail('Invalid Reach channel name.');
  if(op==='search'){
    if(typeof value.query!=='string')fail('Reach search requires a query string.');
    const query=clean(value.query,500);
    if(!query||/[\u0000-\u001f\u007f]/.test(value.query))fail('Reach query must be one non-empty line.');
    const limit=value.limit===undefined?5:value.limit;
    if(!Number.isInteger(limit)||limit<1||limit>10)fail('Reach result limit must be an integer from 1 to 10.');
    return {op,channel:channel||'web',query,limit};
  }
  if(typeof value.target!=='string')fail('Reach read requires a target string.');
  const target=clean(value.target,2048);
  if(!target||/[\u0000-\u001f\u007f]/.test(value.target))fail('Reach target must be one non-empty line.');
  if(!channel){const url=safeReachUrl(target);if(!url)fail('Automatic Reach read requires a public HTTP(S) URL without embedded credentials.');return {op,target:url};}
  if(target.includes('://')&&!safeReachUrl(target))fail('Reach URLs must be HTTP(S) URLs without embedded credentials.');
  if(channel==='web'&&!safeReachUrl(target))fail('Web read requires a public HTTP(S) URL.');
  return {op,channel,target};
}

export function normalizeReachStatus(value){
  if(!value||value.ok!==true||!Array.isArray(value.channels))throw new ReachError('CLI_INVALID_OUTPUT','Agent Reach returned invalid capability data.');
  const channels=[];
  for(const channel of value.channels.slice(0,40)){
    const id=name(channel?.name);if(!id||!Array.isArray(channel.actions))continue;
    const actions=[];
    for(const action of channel.actions.slice(0,30)){
      const actionName=name(action?.name);if(!['search','read'].includes(actionName))continue;
      actions.push({name:actionName,help:clean(action.help,240),backends:(Array.isArray(action.backends)?action.backends:[]).slice(0,10).map(x=>name(x)).filter(Boolean),publicWeb:Array.isArray(action.public_web)&&action.public_web.length>0});
    }
    if(!actions.length)continue;
    const login=channel.login&&typeof channel.login==='object'?{via:clean(channel.login.via,40),loggedIn:typeof channel.login.logged_in==='boolean'?channel.login.logged_in:null}:null;
    channels.push({name:id,description:clean(channel.description,240),level:clean(channel.level,30),login,actions});
  }
  return {schemaVersion:1,channels};
}

export function normalizeReachResult(value){
  if(!value||typeof value.ok!=='boolean'||!['search','read'].includes(value.action))throw new ReachError('CLI_INVALID_OUTPUT','Agent Reach returned an invalid result envelope.');
  if(value.ok&&!Array.isArray(value.items))throw new ReachError('CLI_INVALID_OUTPUT','Agent Reach returned malformed result items.');
  const result={ok:value.ok,channel:name(value.channel),action:value.action,backend:name(value.backend),items:[],error:null,meta:{elapsedMs:0,attempts:[]}};
  if(!value.ok){const e=value.error&&typeof value.error==='object'?value.error:{};result.error={code:clean(e.code,50)||'UPSTREAM_BROKEN',message:clean(e.message,500)||'Agent Reach request failed.',hint:clean(e.hint,500)};}
  for(const item of (value.ok?value.items:[]).slice(0,REACH_LIMITS.items)){
    if(!item||typeof item!=='object')continue;
    result.items.push({title:clean(item.title,300),url:safeReachUrl(item.url),author:clean(item.author,200),publishedAt:clean(item.published_at,100),text:clean(item.text,REACH_LIMITS.text)});
  }
  const meta=value.meta&&typeof value.meta==='object'?value.meta:{};
  result.meta.elapsedMs=Number.isFinite(meta.elapsed_ms)?Math.max(0,Math.min(120000,Math.floor(meta.elapsed_ms))):0;
  result.meta.attempts=(Array.isArray(meta.attempts)?meta.attempts:[]).slice(0,8).map(a=>({backend:name(a?.backend),result:clean(a?.result,50),skipped:a?.skipped===true}));
  return result;
}
