// Arena's Terms prohibit automated access without permission; a signed-in session is not permission.
import {arenaFlatten} from './core.js';

const ORIGIN='https://arena.ai';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// Model display names in the picker are slugs, except the router shown as "Max".
export function arenaSlug(text){const t=String(text||'').trim();return t==='Max'?'max':t.toLowerCase();}

async function exec(tabId,func,args=[],documentId){
  const target=documentId?{tabId,documentIds:[documentId]}:{tabId};
  const [res]=await chrome.scripting.executeScript({target,world:'MAIN',func,args});
  if(!res?.result)throw Error('Arena’s relay document is unavailable. Send again from the original page.');
  if(res.result.error==='wrong-origin')throw sendError('wrong-origin');
  return {...res.result,documentId:res.documentId};
}

// A single dedicated background tab, remembered across panel reloads. Orbit never hijacks
// an arena.ai tab the user opened themselves.
async function relayTabId(){
  let id=null;
  try{({arenaRelayTab:id}=await chrome.storage.session.get('arenaRelayTab'));}catch{}
  if(id!=null){try{const t=await chrome.tabs.get(id);if(new URL(t.url).origin!==ORIGIN)id=null;}catch{id=null;}}
  if(id==null){const t=await chrome.tabs.create({url:ORIGIN+'/direct',active:false});id=t.id;try{await chrome.storage.session.set({arenaRelayTab:id});}catch{}}
  return id;
}
function checkStopped(signal,deadline){
  if(signal?.aborted)throw Error('Stopped.');
  if(Date.now()>=deadline)throw Error('Arena’s request timed out.');
}
async function waitComplete(tabId,signal,deadline){
  const start=Date.now();
  while(Date.now()-start<30000){checkStopped(signal,deadline);const t=await chrome.tabs.get(tabId);if(t.status==='complete')return;await sleep(300);}
  throw Error('The Arena tab took too long to load. Check your connection.');
}
// Chrome does not render a tab that has never been foregrounded (its layout is 0×0), so the
// relay brings its dedicated tab forward while it works, then hands focus back to whatever
// the user was on. The side panel stays open throughout.
async function withFocus(tabId,fn){
  let prev=null;try{[prev]=await chrome.tabs.query({active:true,currentWindow:true});}catch{}
  try{await chrome.tabs.update(tabId,{active:true});}catch{}
  const out=await fn(); // on error the tab stays forward so the user can sign in or inspect
  const [active]=await chrome.tabs.query({active:true,currentWindow:true});
  if(prev&&prev.id!==tabId&&active?.id===tabId){try{await chrome.tabs.update(prev.id,{active:true});}catch{}}
  return out;
}

// ---- Injected drivers. Self-contained: chrome.scripting serializes them into the page. ----
function driverReady(){
  if(location.origin!=='https://arena.ai')return {error:'wrong-origin'};
  const ta=document.querySelector('textarea[placeholder]');
  const dlg=[...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].map(d=>d.textContent||'').join(' ');
  if(/Terms of Use.*Privacy Policy|By clicking ["“]Agree/i.test(dlg))return {error:'terms-required'};
  const loginWall=/free account is required|log in or create account/i.test(dlg)&&/continue with/i.test(dlg);
  return {composer:!!ta,loginWall,url:location.href};
}
function driverSend(prompt){
  if(location.origin!=='https://arena.ai')return {error:'wrong-origin'};
  const ta=document.querySelector('textarea[placeholder]');
  if(!ta)return {error:'no-composer'};
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',keyCode:27,which:27,bubbles:true}));
  ta.focus();
  const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
  setter.call(ta,prompt);
  ta.dispatchEvent(new Event('input',{bubbles:true}));
  return (async()=>{
    await new Promise(r=>setTimeout(r,300)); // let any popover finish dismissing
    let btn=null;
    for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,200));btn=document.querySelector('button[aria-label="Send message"]');if(btn&&!btn.disabled)break;}
    if(!btn)return {error:'no-send'};
    if(btn.disabled)return {error:'send-disabled'};
    return {ok:true};
  })();
}
function driverSubmit(prompt){
  if(location.origin!=='https://arena.ai')return {error:'wrong-origin'};
  const ta=document.querySelector('textarea[placeholder]');
  if(!ta||ta.value!==prompt)return {error:'composer-changed'};
  const btn=document.querySelector('button[aria-label="Send message"]');
  if(!btn||btn.disabled)return {error:'send-disabled'};
  btn.click();
  return {ok:true};
}
function driverRead(){
  if(location.origin!=='https://arena.ai')return {error:'wrong-origin'};
  const dlg=[...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].map(d=>d.textContent||'').join(' ');
  if(/Terms of Use.*Privacy Policy|By clicking ["“]Agree/i.test(dlg))return {error:'terms-required'};
  if(/free account is required|log in or create account/i.test(dlg)&&/continue with/i.test(dlg))return {error:'login-wall'};
  const main=document.querySelector('main')||document.body;
  const answers=[...main.querySelectorAll('.prose')];
  const text=answers.at(-1)?.innerText||'';
  const stopBtn=[...document.querySelectorAll('button')].find(b=>/stop generating/i.test((b.getAttribute('aria-label')||'')+' '+(b.textContent||'')));
  const sendBtn=document.querySelector('button[aria-label="Send message"]');
  const alert=document.querySelector('[role="alert"]');
  const errText=alert?(alert.textContent||'').trim():'';
  const generating=!!stopBtn||!!document.querySelector('[data-testid="pending-chat"]');
  return {text,count:answers.length,generating,idle:!!sendBtn&&!sendBtn.disabled&&!generating,
    error:errText&&/wrong|rejected|failed|error|limit|credit|quota/i.test(errText)?errText.slice(0,300):''};
}
function driverStop(){
  if(location.origin!=='https://arena.ai')return {error:'wrong-origin'};
  const b=[...document.querySelectorAll('button')].find(x=>/stop generating/i.test((x.getAttribute('aria-label')||'')+' '+(x.textContent||'')));
  if(b)b.click();
  return {ok:true};
}
function driverOpenPicker(){
  if(location.origin!=='https://arena.ai')return {error:'wrong-origin'};
  const ta=document.querySelector('textarea[placeholder]');
  const form=ta?(ta.closest('form')||ta.parentElement.parentElement.parentElement):document;
  const chips=[...form.querySelectorAll('button')].filter(b=>!b.getAttribute('aria-label')&&(b.textContent||'').trim());
  const chip=chips.at(-1);
  if(!chip)return {error:'no-chip'};
  const r=chip.getBoundingClientRect();
  const o={bubbles:true,cancelable:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2,pointerId:1,isPrimary:true,button:0};
  chip.dispatchEvent(new PointerEvent('pointerdown',o));chip.dispatchEvent(new MouseEvent('mousedown',o));
  chip.dispatchEvent(new PointerEvent('pointerup',o));chip.dispatchEvent(new MouseEvent('mouseup',o));chip.dispatchEvent(new MouseEvent('click',o));
  return {opened:true};
}
function driverReadModels(){
  if(location.origin!=='https://arena.ai')return {error:'wrong-origin'};
  const opts=[...document.querySelectorAll('[role="option"]')];
  const names=opts.map(o=>{const s=o.querySelector('span.truncate.font-mono')||o.querySelector('.font-mono');return (s?.textContent||'').trim();}).filter(Boolean);
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',keyCode:27,which:27,bubbles:true}));
  return {names};
}

async function openDirect(id,model,signal,deadline){
  checkStopped(signal,deadline);
  // Orbit replays the whole transcript, so every request needs a fresh Arena conversation.
  await chrome.tabs.update(id,{url:ORIGIN+'/direct?model_a='+encodeURIComponent(model)});
  await waitComplete(id,signal,deadline);
  let ready=null;
  for(let i=0;i<40;i++){
    checkStopped(signal,deadline);
    ready=await exec(id,driverReady);
    if(ready.error)throw sendError(ready.error);
    if(ready.composer)break;
    await sleep(500);
  }
  if(!ready?.composer)throw Error('Arena’s composer was not found. The site may have changed — open arena.ai/direct to check.');
  await sleep(2000);
  checkStopped(signal,deadline);
  ready=await exec(id,driverReady,[],ready.documentId);
  if(ready.error)throw sendError(ready.error);
  if(ready.loginWall)throw sendError('login-wall');
  return ready.documentId;
}
function sendError(code){
  if(code==='terms-required')return Error('Review Arena’s Terms of Use in the relay tab yourself. Orbit will not click Agree or accept legal terms for you. Automated access requires Arena’s permission.');
  if(code==='login-wall')return Error('Sign in to arena.ai in the relay tab Orbit opened, then send again. Direct mode needs a free Arena account.');
  if(code==='wrong-origin')return Error('The Arena relay tab navigated to another site. No prompt was sent there.');
  if(code==='send-disabled')return Error('Arena’s send button stayed disabled. The model slug may be invalid — pick another in Settings.');
  return Error('Arena’s composer was not ready ('+code+'). Open arena.ai/direct to check the site.');
}

export async function arenaGenerate(config,key,messages,{signal,onText,onUsage,timeoutMs=240000}={}){
  const deadline=Date.now()+timeoutMs;
  checkStopped(signal,deadline);
  if(!config.model?.trim())throw Error('Choose an Arena model in Settings.');
  const prompt=arenaFlatten(messages);
  const id=await relayTabId();
  checkStopped(signal,deadline);
  return withFocus(id,async()=>{
    const documentId=await openDirect(id,config.model,signal,deadline);
    const prepared=await exec(id,driverSend,[prompt],documentId);
    if(prepared.error)throw sendError(prepared.error);
    checkStopped(signal,deadline);
    const baseline=await exec(id,driverRead,[],documentId);
    if(baseline.error)throw sendError(baseline.error);
    if(baseline.generating)throw Error('Arena is already generating. Wait for it to finish.');
    checkStopped(signal,deadline);
    const submitted=await exec(id,driverSubmit,[prompt],documentId);
    if(submitted.error)throw sendError(submitted.error);
    let last='',stable=0,sawGen=false;const start=Date.now();
    try{
      while(true){
        checkStopped(signal,deadline);
        const r=await exec(id,driverRead,[],documentId);
        if(r.error==='login-wall'||r.error==='terms-required')throw sendError(r.error);
        if(r.error)throw Error('Arena: '+r.error);
        if(r.generating)sawGen=true;
        const text=r.count>baseline.count?r.text:'';
        if(text!==last){last=text;stable=0;}else stable++;
        if(text.trim()&&r.idle&&stable>=2){
          // Rendered Markdown can shrink or rewrite earlier text; emit only the settled answer.
          onText?.(text);onUsage?.({transport:'arena'});return;
        }
        if(!sawGen&&!text.trim()&&r.idle&&Date.now()-start>20000)throw Error('Arena did not start a response. Check that you are signed in and still have daily credits.');
        await sleep(700);
      }
    }catch(error){
      if(signal?.aborted||Date.now()>=deadline)await exec(id,driverStop,[],documentId).catch(()=>{});
      throw error;
    }
  });
}
export async function arenaGenerateOnce(config,key,messages,{signal,timeoutMs=120000}={}){
  let text='';
  await arenaGenerate(config,key,messages,{signal,timeoutMs,onText:d=>{text+=d;}});
  return {text,sources:[],usage:null,raw:null};
}
export async function arenaListModels(){
  const id=await relayTabId();
  return withFocus(id,async()=>{
  const t=await chrome.tabs.get(id);
  if(!/\/direct/.test(t.url||'')){await chrome.tabs.update(id,{url:ORIGIN+'/direct'});await waitComplete(id,undefined,Date.now()+30000);}
  let ready;
  for(let i=0;i<30;i++){ready=await exec(id,driverReady);if(ready.error)throw sendError(ready.error);if(ready.composer)break;await sleep(500);}
  if(!ready?.composer)throw sendError('no-composer');
  await sleep(2500); // let React hydrate before the picker's pointer handlers exist
  let names=[];
  for(let i=0;i<8;i++){
    const opened=await exec(id,driverOpenPicker,[],ready.documentId);
    if(opened.error)throw sendError(opened.error);
    await sleep(1300);
    const r=await exec(id,driverReadModels,[],ready.documentId);
    if(r?.names?.length){names=r.names;break;}
  }
  const models=[...new Set(names.map(arenaSlug).filter(x=>/^[a-z0-9][a-z0-9.\-]*$/.test(x)))].sort();
  if(!models.length)throw Error('Could not read Arena’s model picker. Type a model slug from arena.ai/direct (e.g. deepseek-v4.1-flash-high), then press Test connection.');
  return models;
  });
}