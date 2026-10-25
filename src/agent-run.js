import {pageOrigin,targetTabs,snapshotPage,agentAct,navHistoryStep} from './page-access.js';
import {generateOnce} from './core.js';
import {AGENT_MAX_STEPS,AGENT_PROTOCOL_RETRIES,buildAgentSystemPrompt,buildAgentObservation,parseAgentActions,stripAgentFence,describeActions} from './agent.js';

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

export async function runAgentLoop({cfg,key,goal,onEvent,signal}){
  const {tab,tabs}=await resolveAgentTarget();
  pageOrigin(tab.url);
  const fresh=await chrome.tabs.get(tab.id);
  if(fresh.url!==tab.url) throw Error('Target navigated. Retry on its current page.');
  const grant=await chrome.permissions.request({origins:[pageOrigin(fresh.url)]});
  if(!grant) throw Error('Permission denied. No page content was read.');
  const tabRefs=listTabs(tabs);
  let activeTabId=tab.id;
  let snap=await takeSnapshot(activeTabId);
  let snapshot=snap.snapshot, activeDocumentId=snap.documentId, activeUrl=fresh.url;
  const switchTab=async ref=>{
    const entry=tabRefs.find(t=>t.ref===String(ref||''));
    if(!entry) return {tool:'read-tab',ref,ok:false,error:'Unknown tab ref. Use the refs from the latest observation.'};
    if(entry.id===activeTabId) return {tool:'read-tab',ref,ok:true,detail:'already reading this tab'};
    let target;
    try{ target=await chrome.tabs.get(entry.id); }
    catch{ return {tool:'read-tab',ref,ok:false,error:'That tab was closed.'}; }
    if(!target.url){ return {tool:'read-tab',ref,ok:false,error:'That tab has no readable URL.'}; }
    try{ pageOrigin(target.url); }catch(e){ return {tool:'read-tab',ref,ok:false,error:e.message}; }
    const pattern=pageOrigin(target.url);
    let granted=await chrome.permissions.contains({origins:[pattern]});
    if(!granted) granted=await chrome.permissions.request({origins:[pattern]});
    if(!granted) return {tool:'read-tab',ref,ok:false,error:'Site access for '+new URL(target.url).hostname+' was not granted; the tab was not read.'};
    try{
      const next=await takeSnapshot(target.id);
      activeTabId=target.id; snapshot=next.snapshot; activeDocumentId=next.documentId; activeUrl=snapshot.url||target.url;
    }catch(e){ return {tool:'read-tab',ref,ok:false,error:e.message}; }
    return {tool:'read-tab',ref,ok:true,detail:'now reading '+String(target.title||new URL(target.url).hostname).slice(0,120)};
  };
  const syncOrigin=async()=>{ try{ const t=await chrome.tabs.get(activeTabId); if(t?.url) activeUrl=t.url; }catch{} };
  const snapshotAfterNavigation=async(url)=>{
    let pattern;try{pattern=pageOrigin(url);}catch{return {error:'The new page ('+String(url).slice(0,80)+') is not a normal webpage Orbit can script.'};}
    let granted=await chrome.permissions.contains({origins:[pattern]});
    if(!granted)granted=await chrome.permissions.request({origins:[pattern]});
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
    const pattern=u.protocol+'//'+u.hostname+'/*';
    let granted=await chrome.permissions.contains({origins:[pattern]});
    if(!granted)granted=await chrome.permissions.request({origins:[pattern]});
    if(!granted)return {tool:'goto',ok:false,error:'Site access for '+u.hostname+' was not granted; nothing was opened.'};
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
    if(res.snap){snapshot=res.snap.snapshot;activeDocumentId=res.snap.documentId;activeUrl=res.snap.snapshot.url||committed;return {tool:'goto',ok:true,detail:'loaded '+new URL(committed).hostname};}
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
    if(res.snap){snapshot=res.snap.snapshot;activeDocumentId=res.snap.documentId;activeUrl=res.snap.snapshot.url||newUrl;return {tool:'nav-history',ok:true,detail:'went '+dir+' to '+String(newUrl).slice(0,120)};}
    await syncOrigin();
    return {tool:'nav-history',ok:true,detail:'went '+dir+'; page still loading — snapshot again'};
  };
  const history=[{role:'system',content:buildAgentSystemPrompt()},{role:'user',content:'Goal: '+String(goal||'').slice(0,4000)+'\n'+buildAgentObservation(snapshot,[],tabRefs)}];
  const transcript=[];
  let stepResults=[];
  let protocolRetries=0;
  let stepShots=[],stepShotBytes=0;
  const captureShot=async()=>{
    try{
      const t=await chrome.tabs.get(activeTabId);
      if(t.active===false) return {tool:'screenshot',ok:false,error:'The target tab is not the visible tab of its window, so a capture would show a different page. Make the tab visible, then retry.'};
      const dataUrl=await chrome.tabs.captureVisibleTab(t.windowId,{format:'jpeg',quality:82});
      if(typeof dataUrl!=='string'||!dataUrl.startsWith('data:image/')) return {tool:'screenshot',ok:false,error:'Chrome returned no screenshot.'};
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
    const ok=confirm('Orbit agent step '+step+' on '+new URL(activeUrl).origin+':\n\n'+desc+(legend?'\n\nTabs:\n'+legend:'')+'\n\nRun these '+parsed.actions.length+' action(s)? Cancel stops the run.');
    if(!ok){
      onEvent?.({type:'cancelled',step,text:'User cancelled at step '+step+'.'});
      return {done:false,transcript,steps:step,cancelled:true,url:activeUrl};
    }
    const results=[];
    stepShots=[];stepShotBytes=0;
    for(const a of parsed.actions){
      signal?.throwIfAborted?.();
      const r=a.tool==='read-tab'?await switchTab(a.ref):a.tool==='screenshot'?await captureShot():a.tool==='goto'?await gotoUrl(a.text):a.tool==='nav-history'?await navHistory(a.text):await execAction(activeTabId,activeDocumentId,snapshot,a);
      results.push(r);
      onEvent?.({type:'action',step,text:r.tool+' '+(r.ref||'')+': '+(r.ok?'ok'+(r.detail?' — '+r.detail:''):'FAILED — '+r.error)});
      if(!r.ok) break;
      // Any navigation (tab switch, goto, back/forward) invalidates every ref the model saw, so it ends the step like read-tab.
      const endsStep=r.ok&&(a.tool==='goto'||a.tool==='nav-history'||(a.tool==='read-tab'&&r.detail!=='already reading this tab'));
      if(endsStep){
        const left=parsed.actions.length-results.length;
        if(left) results.push({tool:'deferred',ref:'',ok:false,error:'The navigation ended this step. The '+left+' remaining action(s) were not run: their refs belong to the previous page and do not exist here. Re-propose them against the new snapshot.'});
        break;
      }
    }
    stepResults=results;
    const navigated=results.some(r=>r.ok&&(r.tool==='goto'||r.tool==='nav-history'||(r.tool==='read-tab'&&r.detail!=='already reading this tab')));
    if(!navigated){
      if(results.some(r=>r.tool==='snapshot'&&r.ok)){
        snap=await takeSnapshot(activeTabId);
        snapshot=snap.snapshot; activeDocumentId=snap.documentId;
      } else {
        try{ const s2=await takeSnapshot(activeTabId); snapshot=s2.snapshot; activeDocumentId=s2.documentId; }
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
    let observation=buildAgentObservation(snapshot,stepResults,tabRefs);
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
