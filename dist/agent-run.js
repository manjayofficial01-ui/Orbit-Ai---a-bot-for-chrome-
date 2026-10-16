import {pageOrigin,targetTabs,snapshotPage,agentAct} from './page-access.js';
import {generateOnce} from './core.js';
import {AGENT_MAX_STEPS,buildAgentSystemPrompt,buildAgentObservation,parseAgentActions,stripAgentFence,describeActions} from './agent.js';

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
  const result=await chrome.scripting.executeScript({target:{tabId,documentIds:[documentId]},func:agentAct,args:[snapshot.token,action,action.tool==='done'?undefined:snapshot.url]});
  const out=result[0]?.result||{ok:false,error:'No result from page.'};
  return {tool:action.tool,ref:action.ref,ok:!!out.ok,error:out.error,detail:out.detail};
}

function explainStep(actions){
  return describeActions(actions);
}

export async function runAgentLoop({cfg,key,goal,onEvent,signal}){
  const {tab}=await resolveAgentTarget();
  pageOrigin(tab.url);
  const fresh=await chrome.tabs.get(tab.id);
  if(fresh.url!==tab.url) throw Error('Target navigated. Retry on its current page.');
  const url=fresh.url;
  const grant=await chrome.permissions.request({origins:[pageOrigin(url)]});
  if(!grant) throw Error('Permission denied. No page content was read.');
  let snap=await takeSnapshot(tab.id);
  let snapshot=snap.snapshot;
  const documentId=snap.documentId;
  const history=[{role:'system',content:buildAgentSystemPrompt()},{role:'user',content:'Goal: '+String(goal||'').slice(0,4000)+'\n'+buildAgentObservation(snapshot,[])}];
  const transcript=[];
  let stepResults=[];
  for(let step=1;step<=AGENT_MAX_STEPS;step++){
    signal?.throwIfAborted?.();
    onEvent?.({type:'step',step,text:'Thinking (step '+step+' of '+AGENT_MAX_STEPS+')…'});
    const out=await generateOnce(cfg,key,history,{signal});
    const raw=out.text||'';
    const parsed=parseAgentActions(raw);
    if(parsed.error){
      history.push({role:'assistant',content:raw},{role:'user',content:'Your action block was invalid: '+parsed.error+' Reply with a corrected block or plain-text question.'});
      onEvent?.({type:'invalid',step,text:parsed.error});
      continue;
    }
    if(!parsed.actions){
      const clean=stripAgentFence(raw).trim()||raw.trim();
      transcript.push(clean);
      onEvent?.({type:'answer',step,text:clean});
      return {done:true,transcript,steps:step,url};
    }
    if(parsed.done){
      const doneText=parsed.actions[0].text||stripAgentFence(raw);
      transcript.push(doneText);
      onEvent?.({type:'done',step,text:doneText});
      return {done:true,transcript,steps:step,url};
    }
    const desc=explainStep(parsed.actions);
    const ok=confirm('Orbit agent step '+step+' on '+new URL(url).origin+':\n\n'+desc+'\n\nRun these '+parsed.actions.length+' action(s)? Cancel stops the run.');
    if(!ok){
      onEvent?.({type:'cancelled',step,text:'User cancelled at step '+step+'.'});
      return {done:false,transcript,steps:step,cancelled:true,url};
    }
    const results=[];
    for(const a of parsed.actions){
      signal?.throwIfAborted?.();
      const r=await execAction(tab.id,documentId,snapshot,a);
      results.push(r);
      onEvent?.({type:'action',step,text:r.tool+' '+(r.ref||'')+': '+(r.ok?'ok':'FAILED — '+r.error)});
      if(!r.ok) break;
    }
    stepResults=results;
    if(results.some(r=>r.tool==='snapshot'&&r.ok)){
      snap=await takeSnapshot(tab.id);
      snapshot=snap.snapshot;
    } else {
      try{ const s2=await takeSnapshot(tab.id); snapshot=s2.snapshot; }
      catch(e){ history.push({role:'assistant',content:raw},{role:'user',content:'Post-action snapshot failed: '+e.message}); continue; }
    }
    transcript.push('[step '+step+'] '+desc+'\n'+results.map(r=>'- '+r.tool+' '+(r.ref||'')+': '+(r.ok?'ok':'FAILED — '+r.error)).join('\n'));
    history.push({role:'assistant',content:raw});
    history.push({role:'user',content:buildAgentObservation(snapshot,stepResults)});
    onEvent?.({type:'observation',step,text:'Page re-read: '+snapshot.text.length+' chars, '+(snapshot.fields?.length||0)+' fields.'});
  }
  return {done:false,transcript,steps:AGENT_MAX_STEPS,url,hitLimit:true};
}
