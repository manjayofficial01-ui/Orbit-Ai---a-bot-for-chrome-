// Arena's Terms prohibit automated access without permission; a signed-in session is not permission.
import {arenaFlatten} from './core.js';

const ORIGIN='https://arena.ai';
const ORIGIN_HOST='arena.ai';
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
// an arena.ai tab the user opened themselves. The tab may legitimately sit on a Google
// sign-in host mid-OAuth — that is still the relay tab, and abandoning it would strand
// the person's sign-in.
async function relayTabId(){
  let id=null;
  try{({arenaRelayTab:id}=await chrome.storage.session.get('arenaRelayTab'));}catch{}
  if(id!=null){try{const t=await chrome.tabs.get(id);const u=new URL(t.url);if(u.origin!==ORIGIN&&!/google\.[a-z.]+$/i.test(u.hostname))id=null;}catch{id=null;}}
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

// ---- Injected drivers. Self-contained: chrome.scripting serializes each one alone, so
// no driver may reference a helper outside its own body. Selector facts are anchored to
// what working arena.ai automation reads from the live DOM (2026): composer
// `textarea[name="message"]`, send `button[aria-label="Send message"]` guarded by both
// `disabled` and `aria-disabled`, messages in an `<ol>` whose DOM order may run opposite
// to the visual order (`flex-col-reverse`), user bubbles right-aligned
// (`justify-end`/`self-end`) inside the same prose-bearing containers as answers, and a
// navigation to /c/<chat-id> after send — which is why the read loop never pins a
// documentId. —
function driverReady(){
  if(location.origin!=='https://arena.ai')return {error:'wrong-origin'};
  const ta=document.querySelector('textarea[name="message"], form textarea, textarea[placeholder]');
  const dlg=[...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].map(d=>d.textContent||'').join(' ');
  if(/Terms of Use.*Privacy Policy|By clicking ["“]Agree/i.test(dlg))return {error:'terms-required'};
  const loginWall=/free account is required|log in or create account/i.test(dlg)&&/continue with/i.test(dlg);
  return {composer:!!ta,loginWall,url:location.href};
}
function driverSend(prompt){
  if(location.origin!=='https://arena.ai')return {error:'wrong-origin'};
  const ta=document.querySelector('textarea[name="message"], form textarea, textarea[placeholder]');
  if(!ta)return {error:'no-composer'};
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',keyCode:27,which:27,bubbles:true}));
  ta.focus();
  // React-safe assignment: reset the value tracker, use the native setter, then a real
  // InputEvent — the same pattern working arena.ai tooling uses.
  const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
  if(ta._valueTracker)ta._valueTracker.setValue('');
  setter.call(ta,prompt);
  ta.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:prompt}));
  ta.dispatchEvent(new Event('change',{bubbles:true}));
  return (async()=>{
    await new Promise(r=>setTimeout(r,300)); // let any popover finish dismissing
    let btn=null;
    for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,200));btn=document.querySelector('button[aria-label="Send message"]');if(btn&&!btn.disabled&&btn.getAttribute('aria-disabled')!=='true')break;}
    if(!btn)return {error:'no-send'};
    if(btn.disabled||btn.getAttribute('aria-disabled')==='true')return {error:'send-disabled'};
    return {ok:true};
  })();
}
function driverSubmit(prompt){
  if(location.origin!=='https://arena.ai')return {error:'wrong-origin'};
  const ta=document.querySelector('textarea[name="message"], form textarea, textarea[placeholder]');
  if(!ta||ta.value!==prompt)return {error:'composer-changed'};
  const btn=document.querySelector('button[aria-label="Send message"]');
  if(!btn||btn.disabled||btn.getAttribute('aria-disabled')==='true')return {error:'send-disabled'};
  btn.click();
  return {ok:true};
}
function driverRead(){
  if(location.origin!=='https://arena.ai')return {error:'wrong-origin'};
  const dlg=[...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].map(d=>d.textContent||'').join(' ');
  if(/Terms of Use.*Privacy Policy|By clicking ["“]Agree/i.test(dlg))return {error:'terms-required'};
  if(/free account is required|log in or create account/i.test(dlg)&&/continue with/i.test(dlg))return {error:'login-wall'};
  const main=document.querySelector('main')||document.body;
  // The transcript is an ordered list; with flex-col-reverse the DOM order runs opposite
  // to the visual order, so candidates are ordered by computed flex direction, never by
  // document order alone. User and answer bubbles both carry prose classes — a bubble is
  // the person's when it is right-aligned. The census travels with every read so a site
  // redesign is diagnosable from the error text alone.
  const list=main.querySelector('ol')||main;
  let roots=[...list.children];
  if(!roots.length)roots=[...main.querySelectorAll('div')].filter(d=>d.querySelector('.prose, .markdown, [class*="prose"]'));
  const msgs=[];
  for(const root of roots){
    const prose=root.querySelector('.prose, .markdown, [class*="prose"]');
    const text=String((prose||root).innerText||'');
    if(!text.trim())continue;
    const cls=typeof root.className==='string'?root.className:'';
    msgs.push({user:/\b(justify-end|self-end)\b/.test(cls),root,text});
  }
  if(!msgs.length){
    // Shadow-piercing fallback, only paid for when the shallow read found nothing.
    const found=[];
    const walk=node=>{if(!node||typeof node.querySelectorAll!=='function')return;
      for(const el of node.querySelectorAll('.prose, .markdown, [class*="prose"]'))found.push(el);
      for(const el of node.querySelectorAll('*'))if(el.shadowRoot)walk(el.shadowRoot);};
    walk(main);
    for(const prose of found){const text=String(prose.innerText||'');if(text.trim())msgs.push({user:false,root:prose,text});}
  }
  const reversed=/column-reverse/.test(String(getComputedStyle(list).flexDirection||''));
  const ordered=reversed?[...msgs].reverse():msgs;
  let lastAssistant=null,lastUser='';
  for(const m of ordered){if(m.user)lastUser=m.text;else lastAssistant=m;}
  const isStop=b=>/\bstop\b/i.test(b.getAttribute('aria-label')||'')||(/\bstop\b/i.test(b.textContent||'')&&String(b.textContent||'').trim().length<=12);
  const stopBtn=[...document.querySelectorAll('button')].find(isStop);
  const sendBtn=document.querySelector('button[aria-label="Send message"]');
  const sendIdle=!!sendBtn&&!sendBtn.disabled&&sendBtn.getAttribute('aria-disabled')!=='true';
  const alert=document.querySelector('[role="alert"]');
  const errText=alert?(alert.textContent||'').trim():'';
  const generating=!!stopBtn||!!document.querySelector('[data-testid="pending-chat"]');
  const census='list='+(list!==main?'ol':'none')+' roots='+roots.length+' msgs='+msgs.length+(reversed?' rev=1':'');
  return {text:lastAssistant?lastAssistant.text:'',userText:String(lastUser||'').slice(0,400),count:msgs.length,
    generating,idle:sendIdle&&!generating,census,
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
  const ta=document.querySelector('textarea[name="message"], form textarea, textarea[placeholder]');
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
// Sign-in watcher. Read-only by design: it reports what the page shows and never
// clicks — not the Continue with Google button, not Agree. The person completes
// every auth screen themselves.
function driverAuthState(){
  if(location.origin!=='https://arena.ai')return {error:'off-origin',url:location.href};
  const dlg=[...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].map(d=>d.textContent||'').join(' ');
  if(/Terms of Use.*Privacy Policy|By clicking ["“]Agree/i.test(dlg))return {error:'terms-required'};
  if(/free account is required|log in or create account/i.test(dlg)&&/continue with/i.test(dlg))return {wall:'login'};
  return {composer:!!document.querySelector('textarea[name="message"], form textarea, textarea[placeholder]')};
}

async function openDirect(id,model,signal,deadline){
  checkStopped(signal,deadline);
  // Orbit replays the whole transcript, so every request needs a fresh Arena conversation.
  await chrome.tabs.update(id,{url:ORIGIN+'/text/direct?model_a='+encodeURIComponent(model)});
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
  if(code==='login-wall'){const e=Error('Arena wants a sign-in. Sign in with Google in the Arena tab Orbit opens, then try again — a run pauses as a sign-in card and resumes on its own.');e.arenaLogin=true;return e;}
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
    // Baseline and submit may pin the pre-send document; the reads after submit never
    // do — Arena navigates the conversation to /c/<id>, and the drivers' origin guards
    // make following the live document safe.
    const baseline=await exec(id,driverRead,[],documentId);
    if(baseline.error)throw sendError(baseline.error);
    if(baseline.generating)throw Error('Arena is already generating. Wait for it to finish.');
    checkStopped(signal,deadline);
    const submitted=await exec(id,driverSubmit,[prompt],documentId);
    if(submitted.error)throw sendError(submitted.error);
    let last='',stable=0,sawNew=false,census='';const start=Date.now();
    try{
      while(true){
        checkStopped(signal,deadline);
        const r=await exec(id,driverRead);
        if(r.error==='login-wall'||r.error==='terms-required')throw sendError(r.error);
        if(r.error)throw Error('Arena: '+r.error);
        census=r.census||census;
        const text=String(r.text||'').trim();
        // Fresh means a NEW assistant answer: not the pre-send page, never the echo of
        // the prompt itself.
        const fresh=text&&text!==String(baseline.text||'').trim()&&text!==prompt.trim();
        if(fresh){sawNew=true;if(text!==last){last=text;stable=0;}else stable++;}
        if(fresh&&!r.generating&&r.idle&&stable>=4){
          // One confirmation read: a streaming pause must not be mistaken for the end.
          await sleep(900);
          const again=String((await exec(id,driverRead).catch(()=>null))?.text||'').trim();
          if(again===last){
            // Rendered Markdown can rewrite earlier text; emit only the settled answer.
            onText?.(last);onUsage?.({transport:'arena'});return;
          }
          last=again;stable=0;
        }
        if(!sawNew&&r.idle&&Date.now()-start>20000)throw Error('Arena did not start a response. Check that you are signed in and still have daily credits.');
        await sleep(700);
      }
    }catch(error){
      if(/timed out/.test(String(error.message||''))&&census)error.message+=' ['+census+']';
      if(signal?.aborted||Date.now()>=deadline)await exec(id,driverStop).catch(()=>{});
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
  if(!/\/direct/.test(t.url||'')){await chrome.tabs.update(id,{url:ORIGIN+'/text/direct'});await waitComplete(id,undefined,Date.now()+30000);}
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

// ---------------------------------------------------------------------------
// Sign-in. Orbit brings the relay tab forward and watches for the login wall to
// clear; the person clicks "Continue with Google" and completes every Google
// screen themselves. Nothing here clicks, types, or accepts anything for them.
// ---------------------------------------------------------------------------

/** Bring the relay tab to the foreground for sign-in. Never navigates mid-OAuth. */
export async function arenaOpenForSignIn(){
  const id=await relayTabId();
  const t=await chrome.tabs.get(id);
  const url=String(t.url||'');
  let host='';try{host=new URL(url).hostname;}catch{}
  const midOAuth=/google\./i.test(host)||host===ORIGIN_HOST;
  if(host!==ORIGIN_HOST&&!midOAuth){await chrome.tabs.update(id,{url:ORIGIN+'/text/direct'});}
  await chrome.tabs.update(id,{active:true});
  return id;
}

/**
 * Watch the relay tab until the login wall is gone. `off-origin` (Google owns the
 * tab) keeps waiting; a Terms dialog is thrown back untouched; once the tab is on
 * arena.ai with no wall, it lands on /direct and looks for the composer.
 */
export async function arenaWaitSignedIn({signal,timeoutMs=300000}={}){
  const id=await relayTabId();
  const deadline=Date.now()+timeoutMs;
  let landed=false;
  while(true){
    if(signal?.aborted)throw Error('Stopped.');
    if(Date.now()>=deadline)throw Error('Sign-in timed out. Finish it in the Arena tab, then try again.');
    await sleep(2000);
    let st=null;
    try{st=await exec(id,driverAuthState);}catch{continue;} // a navigation can kill the document mid-poll
    if(!st||st.error==='off-origin')continue;
    if(st.error==='terms-required')throw sendError('terms-required');
    if(st.wall==='login')continue;
    if(st.composer)return {signedIn:true};
    if(!landed){landed=true;await chrome.tabs.update(id,{url:ORIGIN+'/text/direct'}).catch(()=>{});}
  }
}

/** Read the relay tab's auth state without creating or focusing anything. Throws when there is no usable relay tab — the dock treats that as "not connected". */
export async function arenaAuthPeek(){
  let id=null;
  try{({arenaRelayTab:id}=await chrome.storage.session.get('arenaRelayTab'));}catch{}
  if(id==null)throw Error('no relay tab yet');
  const t=await chrome.tabs.get(id);
  if(!String(t.url||'').startsWith(ORIGIN))return {wall:'off-origin'};
  return await exec(id,driverAuthState);
}

/** The dock's read-only look at the relay tab: auth state plus the latest assistant answer and the latest prompt, so Orbit can notice answers it never sent — including ones the person typed themselves. Throws when there is no usable relay tab. */
export async function arenaDockPeek(){
  let id=null;
  try{({arenaRelayTab:id}=await chrome.storage.session.get('arenaRelayTab'));}catch{}
  if(id==null)throw Error('no relay tab yet');
  const t=await chrome.tabs.get(id);
  if(!String(t.url||'').startsWith(ORIGIN))return {wall:'off-origin'};
  const st=await exec(id,driverAuthState);
  if(st?.error||st?.wall)return st;
  const r=await exec(id,driverRead).catch(()=>null);
  return {...st,answer:String(r?.text||''),userText:String(r?.userText||''),census:r?.census||''};
}