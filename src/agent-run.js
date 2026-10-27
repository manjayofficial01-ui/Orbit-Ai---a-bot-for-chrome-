import {pageOrigin,targetTabs,snapshotPage,agentAct,navHistoryStep,captureVisibleTabImage,secretFill,ensureSiteAccess} from './page-access.js';
import {generateOnce} from './core.js';
import {AGENT_MAX_STEPS,AGENT_PROTOCOL_RETRIES,AGENT_TOOLS,buildAgentSystemPrompt,buildAgentObservation,parseAgentActions,stripAgentFence,describeActions,snapshotForModel,allActionsSafeReadOnly} from './agent.js';
import {routeSkills,narrowTools,skillInstructions} from './skills.js';
import {addMemory} from './memory.js';
import {askConfirm} from './dialogs.js';

export async function resolveAgentTarget(){
  const active=await chrome.tabs.query({active:true,lastFocusedWindow:true});
  const tabs=targetTabs(await chrome.tabs.query({}),location.href);
  if(!tabs.length) throw Error('No supported webpages found. Open a normal HTTP/HTTPS page first.');
  const preferred=active[0]&&tabs.some(t=>t.id===active[0].id)?active[0]:tabs[0];
  return {tab:preferred,tabs};
}

export async function takeSnapshot(tabId){
  let results;
  try{ results=await chrome.scripting.executeScript({target:{tabId},func:snapshotPage}); }
  catch(e){ throw Error('Page access failed. Click the Orbit toolbar icon on the page, grant the site, then retry. '+e.message); }
  const r=results[0];
  if(!r?.result||!r?.documentId) throw Error('No readable document returned. The page may block scripting.');
  return {snapshot:r.result,documentId:r.documentId};
}

export async function execAction(tabId,documentId,snapshot,action){
  if(action.tool==='snapshot') return {tool:'snapshot',ok:true,detail:'re-read'};
  let result;
  try{
    result=await chrome.scripting.executeScript({target:{tabId,documentIds:[documentId]},func:agentAct,args:[snapshot.token,action,action.tool==='done'?undefined:snapshot.url]});
  }catch(e){ return {tool:action.tool,ref:action.ref,ok:false,error:'The page could not be acted on ('+String(e&&e.message||e).slice(0,200)+'). Snapshot or read a tab again.'}; }
  const out=result?.[0]?.result||{ok:false,error:'No result from page.'};
  return {tool:action.tool,ref:action.ref,ok:!!out.ok,error:out.error,detail:out.detail};
}

function explainStep(actions){
  return describeActions(actions);
}

export function listTabs(tabs){
  return tabs.slice(0,15).map((t,i)=>({ref:'tab'+i,id:t.id,title:String(t.title||'').slice(0,80),url:String(t.url||'').slice(0,160)}));
}

/**
 * Orbit's workspace: the few files a run can keep and read back next time.
 *
 * OpenDuet gives each Bot a real `/workspace` on its own computer. An extension has no
 * filesystem, so this is the nearest honest equivalent: a small, bounded set of named
 * text files in extension storage, written only through the approval gate like any
 * other action. The bounds are the point — an unbounded "workspace" in a 10 MB quota
 * is a way to fill the user's storage with model output.
 */
export const WORKSPACE_KEY='orbitWorkspace';
export const WORKSPACE_LIMITS={files:24,fileChars:20000,totalChars:120000};
const WORKSPACE_NAME=/^[a-z0-9][a-z0-9._-]{0,63}$/i;

async function loadWorkspace(){
  try{ const stored=await chrome.storage.local.get(WORKSPACE_KEY); const files=stored?.[WORKSPACE_KEY]; return files&&typeof files==='object'?files:{}; }
  catch{ return {}; }
}
function workspaceSize(files){ return Object.values(files).reduce((n,v)=>n+String(v||'').length,0); }

export async function listWorkspaceFiles(){
  const files=await loadWorkspace();
  const names=Object.keys(files).sort();
  return names.length?names.map(n=>n+' ('+String(files[n]).length+' chars)'):[];
}
export async function readWorkspaceFile(name){
  const files=await loadWorkspace();
  const key=String(name||'').trim();
  return Object.prototype.hasOwnProperty.call(files,key)?String(files[key]):null;
}
export async function writeWorkspaceFile(name,text){
  const key=String(name||'').trim();
  if(!WORKSPACE_NAME.test(key))return {error:'Filename must be letters, numbers, dots, dashes or underscores, with an extension.'};
  const body=String(text??'');
  if(body.length>WORKSPACE_LIMITS.fileChars)return {error:'That file is over the '+WORKSPACE_LIMITS.fileChars+'-character limit for one file.'};
  const files=await loadWorkspace();
  const existing=Object.prototype.hasOwnProperty.call(files,key);
  if(!existing&&Object.keys(files).length>=WORKSPACE_LIMITS.files)return {error:'The workspace already holds '+WORKSPACE_LIMITS.files+' files. Delete one before adding another.'};
  const next={...files,[key]:body};
  if(workspaceSize(next)>WORKSPACE_LIMITS.totalChars)return {error:'The workspace is full ('+WORKSPACE_LIMITS.totalChars+' characters total).'};
  try{ await chrome.storage.local.set({[WORKSPACE_KEY]:next}); }
  catch(e){ return {error:'The workspace could not be saved: '+String(e&&e.message||e).slice(0,160)}; }
  return {ok:true,detail:(existing?'updated ':'saved ')+key+' ('+body.length+' chars)'};
}

/**
 * Ask the person for ONE value, in a masked box, and hand it straight to the page.
 *
 * This is OpenDuet's `computer_request_secret`, which the operator prompt has been
 * telling the model to call since this build's first phase. Without this dialog the
 * tool was a promise the UI did not keep: the model said "type it into the masked box"
 * and no box appeared. The value never touches the transcript, the conversation
 * history, storage, or the model's context — it goes from this input to
 * `secretFill` and nowhere else.
 *
 * Resolves the string, or null when the person cancels or dismisses the dialog.
 */
export function askSecret(label){
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');
    dialog.className='secret-dialog';
    dialog.setAttribute('aria-labelledby','secretTitle');
    const head=document.createElement('h2');head.id='secretTitle';head.textContent='Orbit needs one value';
    const note=document.createElement('p');
    note.textContent='Type '+String(label||'the value').slice(0,80)+'. It goes straight into the page field, is never sent to the model, and is not saved anywhere.';
    const input=document.createElement('input');
    input.type='password';input.autocomplete='off';input.spellcheck=false;
    input.setAttribute('aria-label',String(label||'Secret value'));
    const row=document.createElement('div');row.className='row';
    const fill=document.createElement('button');fill.textContent='Fill the field';fill.className='primary';
    const cancel=document.createElement('button');cancel.textContent='Cancel';
    row.append(fill,cancel);
    dialog.append(head,note,input,row);
    const finish=value=>{input.value='';dialog.close();dialog.remove();resolve(value);};
    fill.onclick=()=>{const value=input.value;if(!value){input.focus();return;}finish(value);};
    cancel.onclick=()=>finish(null);
    dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
    dialog.addEventListener('close',()=>{if(dialog.isConnected)finish(null);});
    input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();fill.click();}});
    document.body.append(dialog);
    dialog.showModal();
    input.focus();
  });
}

/**
 * Pause the run while the person does something only they can do.
 *
 * A sign-in, a code sent to a phone, a CAPTCHA: the operator prompt tells the model to
 * call `computer_request_help` rather than write "please sign in and let me know", and
 * this is the other half of that promise. The person acts in their own tab, then hands
 * control back, and the loop takes a fresh snapshot before it acts again.
 *
 * Resolves true to continue, false to stop the run.
 */
export function askHandover(reason){
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');
    dialog.className='handover-dialog';
    dialog.setAttribute('aria-labelledby','handoverTitle');
    const head=document.createElement('h2');head.id='handoverTitle';head.textContent='Orbit is waiting for you';
    const note=document.createElement('p');note.textContent=String(reason||'Complete the step on the page, then hand it back.').slice(0,2000);
    const hint=document.createElement('p');hint.className='handover-hint';
    hint.textContent='Orbit will not act while you have control. When you are done, hand it back and it will read the page again before continuing.';
    const row=document.createElement('div');row.className='row';
    const back=document.createElement('button');back.textContent='Hand it back';back.className='primary';
    const stop=document.createElement('button');stop.textContent='Stop the run';
    row.append(back,stop);
    dialog.append(head,note,hint,row);
    const finish=value=>{dialog.close();dialog.remove();resolve(value);};
    back.onclick=()=>finish(true);
    stop.onclick=()=>finish(false);
    dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});
    dialog.addEventListener('close',()=>{if(dialog.isConnected)finish(false);});
    document.body.append(dialog);
    dialog.showModal();
    back.focus();
  });
}

/**
 * The per-step approval gate, as a real dialog.
 *
 * This used to be window.confirm() — which the Chrome side panel silently answers
 * "false" — so in the panel every proposed step was "declined by you" and the agent
 * could never click, scroll or fill anything. The dialog here works in every surface;
 * tests inject `approve` into runAgentLoop instead of mocking window.confirm.
 */
export async function askStepApproval(message) {
  return askConfirm({
    title: 'Orbit wants to act',
    body: 'Approve this step? Stopping ends the run.',
    detail: message,
    confirmLabel: 'Approve step',
    cancelLabel: 'Stop the run',
  });
}

export async function runAgentLoop({cfg,key,goal,onEvent,signal,approve,autoSafe=false,autopilot=false}){
  const {tab,tabs}=await resolveAgentTarget();
  pageOrigin(tab.url);
  const fresh=await chrome.tabs.get(tab.id);
  if(fresh.url!==tab.url) throw Error('Target navigated. Retry on its current page.');
  const grant=await ensureSiteAccess(pageOrigin(fresh.url));
  if(!grant) throw Error('Permission denied. No page content was read.');
  const tabRefs=listTabs(tabs);
  let activeTabId=tab.id;
  let snap=await takeSnapshot(activeTabId);
  let snapshot=snap.snapshot, activeDocumentId=snap.documentId, activeUrl=fresh.url;
  let snapshotId=1; // OpenDuet snapshot-provenance: refs and observations are bound to the snapshotId that produced them.
  const switchTab=async ref=>{
    const entry=tabRefs.find(t=>t.ref===String(ref||''));
    if(!entry) return {tool:'read-tab',ref,ok:false,error:'Unknown tab ref. Use the refs from the latest observation.'};
    if(entry.id===activeTabId) return {tool:'read-tab',ref,ok:true,detail:'already reading this tab'};
    let target;
    try{ target=await chrome.tabs.get(entry.id); }
    catch{ return {tool:'read-tab',ref,ok:false,error:'That tab was closed.'}; }
    if(!target.url){ return {tool:'read-tab',ref,ok:false,error:'That tab has no readable URL.'}; }
    try{ pageOrigin(target.url); }catch(e){ return {tool:'read-tab',ref,ok:false,error:e.message}; }
    const granted=await ensureSiteAccess(pageOrigin(target.url));
    if(!granted) return {tool:'read-tab',ref,ok:false,error:'Site access for '+new URL(target.url).hostname+' was not granted; the tab was not read.'};
    try{
      const next=await takeSnapshot(target.id);
      activeTabId=target.id; snapshot=next.snapshot; activeDocumentId=next.documentId; activeUrl=snapshot.url||target.url; snapshotId++;
    }catch(e){ return {tool:'read-tab',ref,ok:false,error:e.message}; }
    return {tool:'read-tab',ref,ok:true,detail:'now reading '+String(target.title||new URL(target.url).hostname).slice(0,120)};
  };
  const syncOrigin=async()=>{ try{ const t=await chrome.tabs.get(activeTabId); if(t?.url) activeUrl=t.url; }catch{} };
  const snapshotAfterNavigation=async(url)=>{
    let pattern;try{pattern=pageOrigin(url);}catch{return {error:'The new page ('+String(url).slice(0,80)+') is not a normal webpage Orbit can script.'};}
    const granted=await ensureSiteAccess(pattern);
    if(!granted)return {error:'Site access for '+new URL(url).hostname+' was not granted; the page opened but was not read.'};
    const wantOrigin=new URL(url).origin;
    for(let i=0;i<16;i++){
      signal?.throwIfAborted?.();
      try{
        const s=await takeSnapshot(activeTabId);
        // tabs.update resolves at navigation start: the first readable document can still be the previous page.
        let snapOrigin=null;try{snapOrigin=new URL(s.snapshot.url||url).origin;}catch{}
        if(snapOrigin&&snapOrigin!==wantOrigin){await new Promise(r=>setTimeout(r,500));continue;}
        return {snap:s};
      }catch{await new Promise(r=>setTimeout(r,500));}
    }
    return {};
  };
  const gotoUrl=async(raw)=>{
    let u;try{u=new URL(String(raw||'').trim());}catch{return {tool:'goto',ok:false,error:'goto text must be a valid URL.'};}
    if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return {tool:'goto',ok:false,error:'goto only accepts plain http(s) URLs without credentials.'};
    if(!await ensureSiteAccess(u.protocol+'//'+u.hostname+'/*'))return {tool:'goto',ok:false,error:'Site access for '+u.hostname+' was not granted; nothing was opened.'};
    let prevUrl='';try{prevUrl=(await chrome.tabs.get(activeTabId)).url||'';}catch{}
    try{await chrome.tabs.update(activeTabId,{url:u.href});}
    catch(e){return {tool:'goto',ok:false,error:'Navigation failed: '+String(e&&e.message||e).slice(0,160)};}
    // Wait for the commit: the tab record moves off the previous URL (a redirect lands on its final URL, which then gets its own grant check).
    let committed=null;
    if(prevUrl!==u.href){
      for(let i=0;i<12;i++){
        signal?.throwIfAborted?.();
        await new Promise(r=>setTimeout(r,400));
        try{const t=await chrome.tabs.get(activeTabId);if(t.url&&t.url!==prevUrl){committed=t.url;break;}}catch{}
      }
    }else committed=u.href;
    if(committed===null){await syncOrigin();return {tool:'goto',ok:true,detail:'navigating to '+u.hostname+' is slow; snapshot again shortly'};}
    const res=await snapshotAfterNavigation(committed);
    if(res.error)return {tool:'goto',ok:false,error:res.error};
    if(res.snap){snapshot=res.snap.snapshot;activeDocumentId=res.snap.documentId;activeUrl=res.snap.snapshot.url||committed;snapshotId++;return {tool:'goto',ok:true,detail:'loaded '+new URL(committed).hostname};}
    await syncOrigin();
    return {tool:'goto',ok:true,detail:'navigated to '+new URL(committed).hostname+'; still loading — wait or snapshot again'};
  };
  const navHistory=async(dir)=>{
    let startUrl='';try{startUrl=(await chrome.tabs.get(activeTabId)).url||'';}catch{}
    try{await chrome.scripting.executeScript({target:{tabId:activeTabId},func:navHistoryStep,args:[dir]});}
    catch(e){return {tool:'nav-history',ok:false,error:'Could not navigate '+dir+': '+String(e&&e.message||e).slice(0,160)};}
    let newUrl=null;
    for(let i=0;i<12;i++){
      signal?.throwIfAborted?.();
      await new Promise(r=>setTimeout(r,400));
      try{const t=await chrome.tabs.get(activeTabId);if(t.url&&t.url!==startUrl){newUrl=t.url;break;}}catch{}
    }
    if(newUrl===null)return {tool:'nav-history',ok:false,error:'No '+dir+' navigation happened (start or end of history).'};
    const res=await snapshotAfterNavigation(newUrl);
    if(res.error)return {tool:'nav-history',ok:false,error:res.error};
    if(res.snap){snapshot=res.snap.snapshot;activeDocumentId=res.snap.documentId;activeUrl=res.snap.snapshot.url||newUrl;snapshotId++;return {tool:'nav-history',ok:true,detail:'went '+dir+' to '+String(newUrl).slice(0,120)};}
    await syncOrigin();
    return {tool:'nav-history',ok:true,detail:'went '+dir+'; page still loading — snapshot again'};
  };
  // Skill routing: offer the model only the tools this kind of work needs. An unmatched
  // goal keeps the whole set — narrowing is for recognised work, never a restriction.
  const matchedSkills=routeSkills(goal);
  const offeredTools=narrowTools(matchedSkills,AGENT_TOOLS);
  const history=[{role:'system',content:buildAgentSystemPrompt({tools:offeredTools,skillBrief:skillInstructions(matchedSkills)})},{role:'user',content:'Goal: '+String(goal||'').slice(0,4000)+'\n'+buildAgentObservation(snapshotForModel(snapshot,snapshotId),[],tabRefs)}];
  if(matchedSkills.length) onEvent?.({type:'skills',text:'Matched: '+matchedSkills.map(s=>s.title).join(', ')});
  const transcript=[];
  let stepResults=[];
  let protocolRetries=0;
  let stepShots=[],stepShotBytes=0;
  const captureShot=async()=>{
    try{
      const t=await chrome.tabs.get(activeTabId);
      if(t.active===false) return {tool:'screenshot',ok:false,error:'The target tab is not the visible tab of its window, so a capture would show a different page. Make the tab visible, then retry.'};
      const dataUrl=await captureVisibleTabImage(t.windowId);
      if(dataUrl.length>3500000) return {tool:'screenshot',ok:false,error:'Screenshot is too large; shrink the window or zoom, then retry.'};
      if(stepShots.length>=2||stepShotBytes+dataUrl.length>3000000) return {tool:'screenshot',ok:false,error:'Only up to two captures (3 MB total) attach per step; work from the attached image.'};
      stepShots.push(dataUrl);stepShotBytes+=dataUrl.length;
      return {tool:'screenshot',ok:true,detail:'captured; the image is attached to your next observation'};
    }catch(e){ return {tool:'screenshot',ok:false,error:'Capture failed ('+String(e&&e.message||e).slice(0,160)+').'}; }
  };
  for(let step=1;step<=AGENT_MAX_STEPS;step++){
    signal?.throwIfAborted?.();
    onEvent?.({type:'step',step,text:'Thinking (step '+step+' of '+AGENT_MAX_STEPS+')…'});
    const out=await generateOnce(cfg,key,history,{signal});
    const raw=out.text||'';
    const parsed=parseAgentActions(raw);
    if(parsed.error){
      history.push({role:'assistant',content:raw},{role:'user',content:'Your action block was invalid: '+parsed.error+' Reply with a corrected block or plain-text question.'});
      onEvent?.({type:'invalid',step,text:parsed.error});
      // A malformed block is a formatting failure, not page work: it must not consume one of the eight action steps.
      if(protocolRetries<AGENT_PROTOCOL_RETRIES){ protocolRetries++; step--; }
      continue;
    }
    if(!parsed.actions){
      const clean=stripAgentFence(raw).trim()||raw.trim();
      transcript.push(clean);
      onEvent?.({type:'answer',step,text:clean});
      return {done:true,transcript,steps:step,url:activeUrl};
    }
    if(parsed.done){
      const doneText=parsed.actions[0].text||stripAgentFence(raw);
      transcript.push(doneText);
      onEvent?.({type:'done',step,text:doneText});
      return {done:true,transcript,steps:step,url:activeUrl};
    }
    const desc=explainStep(parsed.actions);
    const legend=parsed.actions.filter(a=>a.tool==='read-tab')
      .map(a=>{const e=tabRefs.find(t=>t.ref===a.ref);return a.ref+' = '+(e?e.title+' — '+e.url:'unknown tab');}).join('\n');
    const summary='Orbit agent step '+step+' on '+new URL(activeUrl).origin+':\n\n'+desc+(legend?'\n\nTabs:\n'+legend:'');
    // Hands-free reading (opt-in): a step whose actions are all read-only runs without
    // the dialog, and says so in the transcript. Anything that changes the page asks,
    // always — with hands-free off, every step asks, as before.
    let ok;
    // Autopilot (opt-in): run everything on its own except a form-submitting Enter,
    // which still asks — submitting is the one action this project never takes silently.
    // Secret and hand-back requests pause by design even under autopilot.
    const enterAhead=parsed.actions.some(a=>a.tool==='press'&&a.text==='Enter');
    if(autopilot===true&&!enterAhead){
      ok=true;
      onEvent?.({type:'auto-approved',step,text:'Autopilot: ran without asking — '+parsed.actions.map(a=>a.tool).join(', ')});
    }else if(autoSafe===true&&allActionsSafeReadOnly(parsed.actions)){
      ok=true;
      onEvent?.({type:'auto-approved',step,text:'Read-only step ran without asking (hands-free reading is on): '+parsed.actions.map(a=>a.tool).join(', ')});
    }else{
      ok=await (approve?approve(summary):askStepApproval(summary));
    }
    if(!ok){
      onEvent?.({type:'cancelled',step,text:'User cancelled at step '+step+'.'});
      // OpenDuet NO_ANSWER_CAME contract: record the refusal in history before returning,
      // so the conversation does not end in silence if the loop is resumed.
      transcript.push('[refused] Step '+step+' was declined by you.');
      return {done:false,transcript,steps:step,cancelled:true,url:activeUrl};
    }
    const results=[];
    stepShots=[];stepShotBytes=0;
    for(const a of parsed.actions){
      signal?.throwIfAborted?.();
      let r;
      if(a.tool==='read-tab')r=await switchTab(a.ref);
      else if(a.tool==='screenshot')r=await captureShot();
      else if(a.tool==='goto')r=await gotoUrl(a.text);
      else if(a.tool==='nav-history')r=await navHistory(a.text);
      else if(a.tool==='computer_request_secret'){
        // Announce the pause before the dialog opens, so a task card can show "Needs input"
        // while the person is being asked — a question nobody can see stops a run silently.
        onEvent?.({type:'needs-input',step,text:'Waiting for you to enter '+String(a.text||'a value').slice(0,80)});
        // The value goes from the masked dialog to the page and nowhere else: it is not
        // pushed to `results`, the transcript, the history, or storage.
        const value=await askSecret(a.text);
        if(value===null){ r={tool:a.tool,ref:a.ref,ok:false,error:'The person cancelled the value entry, so nothing was filled.'}; }
        else{
          let out;
          try{ out=await chrome.scripting.executeScript({target:{tabId:activeTabId,documentIds:[activeDocumentId]},func:secretFill,args:[snapshot.token,a.ref,value,snapshot.url]}); }
          catch(e){ out=[{result:{error:'The page could not be written to ('+String(e&&e.message||e).slice(0,160)+').'}}]; }
          const written=out?.[0]?.result||{error:'No result from page.'};
          r={tool:a.tool,ref:a.ref,ok:!!written.ok,error:written.error,detail:written.detail};
        }
      }
      else if(a.tool==='computer_request_help'){
        onEvent?.({type:'needs-input',step,text:'Waiting for you on the page'});
        const go=await askHandover(a.text);
        if(!go){ onEvent?.({type:'cancelled',step,text:'Stopped while waiting for you.'}); transcript.push('[stopped] The run was stopped while waiting for you to hand control back.'); return {done:false,transcript,steps:step,cancelled:true,url:activeUrl}; }
        // Re-read before acting: the person just changed the page, so every ref is stale.
        try{ const after=await takeSnapshot(activeTabId); snapshot=after.snapshot; activeDocumentId=after.documentId; snapshotId++; }
        catch(e){ r={tool:a.tool,ref:a.ref,ok:false,error:'Control was handed back but the page could not be read: '+e.message}; }
        if(!r) r={tool:a.tool,ref:a.ref,ok:true,detail:'control handed back; the page was re-read'};
      }
      else if(a.tool==='computer_list_files'){
        const names=await listWorkspaceFiles();
        r={tool:a.tool,ok:true,detail:names.length?names.join('\n'):'The workspace is empty.'};
      }
      else if(a.tool==='computer_read_file'){
        const content=await readWorkspaceFile(a.ref);
        r=content===null?{tool:a.tool,ref:a.ref,ok:false,error:'There is no file named '+a.ref+' in the workspace. Call computer_list_files to see what is really there.'}:{tool:a.tool,ref:a.ref,ok:true,detail:content};
      }
      else if(a.tool==='computer_write_file'){
        const saved=await writeWorkspaceFile(a.ref,a.text);
        r={tool:a.tool,ref:a.ref,ok:!!saved.ok,error:saved.error,detail:saved.detail};
      }
      else if(a.tool==='memory_save'){
        // The approval gate already showed this proposed fact to the person (it is an
        // ordinary action in the step). Persist it through the host's guarded writer.
        let host='this page';try{host=new URL(activeUrl).hostname;}catch{}
        const saved=await addMemory({content:a.text,provenance:'Observed by Orbit during a task on '+host,formedBy:'operator'});
        r=saved.ok
          ?{tool:a.tool,ok:true,detail:saved.duplicate?'already in memory — nothing new saved':'saved to memory; the person can review it in Settings'}
          :{tool:a.tool,ok:false,error:saved.error};
      }
      else if(a.tool==='computer_read')r=await execAction(activeTabId,activeDocumentId,snapshot,a);
      else if(a.tool==='snapshot')r={tool:'snapshot',ok:true,detail:'re-read'};
      else r=await execAction(activeTabId,activeDocumentId,snapshot,a);
      results.push(r);
      onEvent?.({type:'action',step,text:r.tool+' '+(r.ref||'')+': '+(r.ok?'ok'+(r.detail?' — '+r.detail:''):'FAILED — '+r.error)});
      if(!r.ok) break;
      // Any navigation (tab switch, goto, back/forward) invalidates every ref the model saw, so it ends the step like read-tab.
      // computer_read verifies its observation and ends the step when verifiable (OpenDuet snapshot-provenance contract).
      const endsStep=r.ok&&(a.tool==='goto'||a.tool==='nav-history'||(a.tool==='read-tab'&&r.detail!=='already reading this tab')||(a.tool==='computer_read'&&r.ok));
      if(endsStep){
        const left=parsed.actions.length-results.length;
        if(left) results.push({tool:'deferred',ref:'',ok:false,error:'The '+a.tool+' ended this step. The '+left+' remaining action(s) were not run: their refs belong to the previous page and do not exist here. Re-propose them against the new snapshot.'});
        break;
      }
    }
    stepResults=results;
    const navigated=results.some(r=>r.ok&&(r.tool==='goto'||r.tool==='nav-history'||(r.tool==='read-tab'&&r.detail!=='already reading this tab')));
    if(!navigated){
      if(results.some(r=>r.tool==='snapshot'&&r.ok)){
        snap=await takeSnapshot(activeTabId);
        snapshot=snap.snapshot; activeDocumentId=snap.documentId; snapshotId++;
      } else {
        try{ const s2=await takeSnapshot(activeTabId); snapshot=s2.snapshot; activeDocumentId=s2.documentId; snapshotId++; }
        catch(e){
          await syncOrigin();
          // The step's own results (e.g. a denied site grant on nav-history) must reach the model even when the re-snapshot fails.
          const sr=stepResults.length?'\nStep results: '+stepResults.map(r=>'- '+r.tool+' '+(r.ref||'')+': '+(r.ok?'ok':'FAILED — '+r.error)).join('\n'):'';
          history.push({role:'assistant',content:raw},{role:'user',content:'Post-action snapshot failed: '+e.message+sr+(stepShots.length?' A screenshot captured this step was also dropped; capture again once the page settles.':'')});
          continue;
        }
      }
    }
    await syncOrigin();
    transcript.push('[step '+step+'] '+desc+'\n'+results.map(r=>'- '+r.tool+' '+(r.ref||'')+': '+(r.ok?'ok':'FAILED — '+r.error)).join('\n'));
    history.push({role:'assistant',content:raw});
    let observation=buildAgentObservation(snapshotForModel(snapshot,snapshotId),stepResults,tabRefs);
    if(stepShots.length&&navigated){
      // The capture predates the navigation and shows the previous page; attaching it to this observation would misattribute it.
      observation+='\nA screenshot captured before the navigation was discarded (it showed the previous page). Capture again on the current page if you need it.';
      history.push({role:'user',content:observation});
    }else if(stepShots.length){
      // Earlier step images are pruned so an eight-step run cannot stack captures past the request budget.
      for(const m of history){ if(Array.isArray(m.content)){ const textPart=m.content.find(p=>p&&(p.type==='text'||p.type==='input_text')); m.content=(textPart?.text||'')+'\n[the screenshot from this earlier step is no longer attached; capture again if you need it]'; } }
      observation+='\nA screenshot captured this step is attached to this message as image data.';
      history.push({role:'user',content:cfg.format==='responses'
        ?[{type:'input_text',text:observation},...stepShots.map(d=>({type:'input_image',image_url:d,detail:'auto'}))]
        :[{type:'text',text:observation},...stepShots.map(d=>({type:'image_url',image_url:{url:d,detail:'auto'}}))]});
    }else history.push({role:'user',content:observation});
    onEvent?.({type:'observation',step,text:'Page re-read: '+snapshot.text.length+' chars, '+(snapshot.fields?.length||0)+' fields.'});
  }
  return {done:false,transcript,steps:AGENT_MAX_STEPS,url:activeUrl,hitLimit:true};
}
