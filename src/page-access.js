export function pageOrigin(url){
 const u=new URL(url);
 if(!['http:','https:'].includes(u.protocol))throw Error('Choose a normal HTTP or HTTPS webpage. Chrome internal pages, extension pages and local files are not supported.');
 if(u.hostname==='chromewebstore.google.com'||(u.hostname==='chrome.google.com'&&u.pathname.startsWith('/webstore')))throw Error('Chrome forbids scripting the Chrome Web Store. Choose another webpage.');
 return `${u.protocol}//${u.hostname}/*`;
}
export function targetTabs(tabs,selfURL){return tabs.filter(t=>t.id&&t.url&&t.url!==selfURL).filter(t=>{try{pageOrigin(t.url);return true;}catch{return false;}}).sort((a,b)=>(b.lastAccessed||0)-(a.lastAccessed||0));}
export function inspectPage(){
 const selection=window.getSelection()?.toString()||'';
 let text='';
 if(selection.trim())text=selection.slice(0,24000);
 else if(document.body){const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while((n=walk.nextNode())&&text.length<24000){const p=n.parentElement;if(!p||p.closest('script,style,noscript,input,textarea,select,button,[contenteditable],[hidden],[aria-hidden="true"]'))continue;const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||!p.getClientRects().length)continue;const v=n.textContent.trim();if(v)text+=v+'\n';}}
 const token=crypto.randomUUID(),map=new Map(),fields=[];
 for(const el of document.querySelectorAll('textarea,input,[contenteditable="true"],[contenteditable=""]')){
  if(fields.length>=100)break;
  if(el.closest('[hidden],[aria-hidden="true"]')||!el.getClientRects().length||el.disabled||el.readOnly)continue;
  if(el.tagName==='INPUT'&&!['text','search','url'].includes(el.type))continue;
  const hints=[el.autocomplete,el.name,el.id,el.getAttribute('aria-label')].join(' ');
  if(/password|passwd|credit|cc-|card|cvc|cvv|otp|one-time|secret|token|api.?key/i.test(hints))continue;
  const style=getComputedStyle(el);if(style.visibility==='hidden'||style.display==='none')continue;
  const id=String(fields.length),value=el.isContentEditable?el.textContent:el.value;
  map.set(id,{el,value});
  const label=el.labels?.[0]?.textContent?.trim()||el.getAttribute('aria-label')||el.placeholder||el.name||el.id||el.tagName.toLowerCase();
  fields.push({id,label:label.slice(0,160),kind:el.tagName.toLowerCase(),length:value.length});
 }
 globalThis.__orbitPageEdit={token,map,url:location.href};
 return {title:document.title,url:location.href,text:text.slice(0,24000),token,fields};
}
export function writeField(token,id,text,expectedURL){
 const state=globalThis.__orbitPageEdit;
 if(!state||state.token!==token||state.url!==location.href||location.href!==expectedURL)return {error:'Page changed or another scan replaced this preview. Read/scan again.'};
 const entry=state.map.get(id);if(!entry?.el?.isConnected)return {error:'Field no longer exists. Read/scan again.'};
 const el=entry.el;
 if(el.disabled||el.readOnly||!el.getClientRects().length)return {error:'Field is no longer editable.'};
 if(el.tagName==='INPUT'&&!['text','search','url'].includes(el.type))return {error:'Field type changed; write blocked.'};
 if(/password|passwd|credit|cc-|card|cvc|cvv|otp|one-time|secret|token|api.?key/i.test([el.autocomplete,el.name,el.id,el.getAttribute('aria-label')].join(' ')))return {error:'Sensitive field; write blocked.'};
 if((el.isContentEditable?el.textContent:el.value)!==entry.value)return {error:'Field changed since scan. Read/scan again before replacing it.'};
 if(typeof text!=='string'||text.length>50000)return {error:'Replacement must be text under 50,000 characters.'};
 el.focus();
 if(el.isContentEditable){el.textContent=text;}
 else{const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,text);}
 el.dispatchEvent(new Event('input',{bubbles:true,composed:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
 state.map.delete(id);
 const value=el.isContentEditable?el.textContent:el.value;
 return value===text?{ok:true}:{error:'The site altered or rejected the text. Inspect the page; Orbit did not submit it.'};
}
export async function openPageTools(onReference){
 const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 const dialog=node('dialog'),title=node('h2','Page access & writing'),notice=node('p','Choose the webpage, grant its site access, then read/scan. Writing replaces one selected text field only after your confirmation. Website input handlers may autosave or send text.'),tabsSelect=node('select'),refresh=node('button','Refresh tabs'),grant=node('button','Grant access to this site'),scan=node('button','Read page & scan fields'),revoke=node('button','Revoke this site'),close=node('button','Close'),msg=node('p'),preview=node('textarea'),attach=node('button','Attach page to chat'),fields=node('select'),replacement=node('textarea'),apply=node('button','Review & write field');
 tabsSelect.setAttribute('aria-label','Target webpage');fields.setAttribute('aria-label','Target editable field');preview.setAttribute('aria-label','Page text preview');replacement.setAttribute('aria-label','Replacement text');preview.rows=9;replacement.rows=5;replacement.maxLength=50000;replacement.placeholder='Paste an answer or type the exact replacement here. This replaces the complete selected field.';for(const e of [tabsSelect,preview,fields,replacement]){e.style.width='100%';e.style.marginTop='12px';}attach.disabled=true;apply.disabled=true;let tabs=[],snapshot,documentId;
 function reset(){snapshot=null;documentId=null;fields.replaceChildren();preview.value='';attach.disabled=true;apply.disabled=true;}
 function selected(){const t=tabs.find(x=>String(x.id)===tabsSelect.value);if(!t)throw Error('No target webpage. Open a normal HTTP/HTTPS page, then refresh.');return t;}
 const run=fn=>async()=>{try{await fn();}catch(e){msg.textContent=e.message;}};
 async function loadTabs(){reset();const active=await chrome.tabs.query({active:true,lastFocusedWindow:true});tabs=targetTabs(await chrome.tabs.query({}),location.href);tabsSelect.replaceChildren();for(const t of tabs){const o=node('option',(t.title||new URL(t.url).hostname)+' — '+new URL(t.url).origin);o.value=String(t.id);tabsSelect.append(o);}if(active[0]&&tabs.some(t=>t.id===active[0].id))tabsSelect.value=String(active[0].id);msg.textContent=tabs.length?'Confirm the selected target, then grant access.':'No supported webpages found.';}
 tabsSelect.onchange=()=>{reset();msg.textContent='Target changed. Grant access and scan this page.';};refresh.onclick=run(loadTabs);
 // This call occurs synchronously within the button gesture, not after tabs.query/fetch.
 grant.onclick=run(async()=>{const t=selected(),pattern=pageOrigin(t.url);const ok=await chrome.permissions.request({origins:[pattern]});msg.textContent=ok?'Access granted. Click Read page & scan fields.':'Permission denied. No page content was read.';});
 revoke.onclick=run(async()=>{const t=selected();await chrome.permissions.remove({origins:[pageOrigin(t.url)]});reset();msg.textContent='Persistent site grant removed. A temporary toolbar activeTab grant, if present, may last until navigation/tab close.';});
 scan.onclick=run(async()=>{reset();const t=selected(),fresh=await chrome.tabs.get(t.id);if(fresh.url!==t.url){await loadTabs();throw Error('Target navigated. Confirm its current site and grant access again.');}pageOrigin(fresh.url);let results;try{results=await chrome.scripting.executeScript({target:{tabId:t.id},func:inspectPage});}catch(e){throw Error('Page access failed. Click Grant access to this site, approve Chrome’s prompt, then retry. Chrome internal/store pages and managed blocked sites cannot be accessed. '+e.message);}const r=results[0];if(!r?.result||!r.documentId)throw Error('No readable document returned.');snapshot=r.result;documentId=r.documentId;preview.value=snapshot.text;attach.disabled=!snapshot.text;for(const f of snapshot.fields){const o=node('option',f.label+' ('+f.kind+', '+f.length+' characters)');o.value=f.id;fields.append(o);}apply.disabled=!snapshot.fields.length;msg.textContent='Read '+snapshot.text.length+' characters; '+snapshot.fields.length+' eligible top-frame fields. Review before attaching or writing.';});
 attach.onclick=run(async()=>{if(!snapshot)throw Error('Read page first.');const ref={title:snapshot.title,url:snapshot.url,text:preview.value.slice(0,24000)};onReference(ref);dialog.close();});
 apply.onclick=run(async()=>{if(!snapshot||!documentId)throw Error('Read/scan first.');const t=selected(),f=snapshot.fields.find(f=>f.id===fields.value);if(!f)throw Error('Select an editable field.');const text=replacement.value;if(!text&&!confirm('The replacement is empty. Clear this field?'))return;const host=new URL(snapshot.url).origin;if(!confirm('Replace the entire field “'+f.label+'” on '+host+' with the following text?\n\n'+text+'\n\nThis does not click Submit. The website may autosave on input.'))return;const result=await chrome.scripting.executeScript({target:{tabId:t.id,documentIds:[documentId]},func:writeField,args:[snapshot.token,f.id,text,snapshot.url]});if(result[0]?.result?.error)throw Error(result[0].result.error);if(!result[0]?.result?.ok)throw Error('Write could not be confirmed. Inspect the page before trying again.');apply.disabled=true;msg.textContent='Text inserted. No submit button was clicked. Read/scan again before another write.';});
 const row=node('div');row.className='row';row.append(refresh,grant,scan,revoke);const writeLabel=node('h3','Write into an editable field');const bottom=node('div');bottom.className='row';bottom.append(attach,apply,close);dialog.append(title,notice,tabsSelect,row,msg,preview,writeLabel,fields,replacement,bottom);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});close.onclick=()=>dialog.close();dialog.showModal();await loadTabs();
}
export function snapshotPage(){
  const sel=window.getSelection()?.toString()||'';
  let text='';
  if(sel.trim()) text=sel.slice(0,12000);
  else if(document.body){
    const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let n;
    while((n=walk.nextNode())&&text.length<12000){
      const p=n.parentElement;
      if(!p||p.closest('script,style,noscript,input,textarea,select,button,[contenteditable],[hidden],[aria-hidden="true"]')) continue;
      const s=getComputedStyle(p);
      if(s.display==='none'||s.visibility==='hidden'||!p.getClientRects().length) continue;
      const v=n.textContent.trim();
      if(v) text+=v+'\n';
    }
  }
  const token=crypto.randomUUID(),map=new Map(),fields=[],interactives=[];
  const sens=/password|passwd|credit|cc-|card|cvc|cvv|otp|one-time|secret|token|api.?key/i;
  for(const el of document.querySelectorAll('textarea,input,[contenteditable="true"],[contenteditable=""]')){
    if(fields.length>=100) break;
    if(el.closest('[hidden],[aria-hidden="true"]')||!el.getClientRects().length||el.disabled||el.readOnly) continue;
    if(el.tagName==='INPUT'&&!['text','search','url','email','tel','number'].includes(el.type)) continue;
    const hints=[el.autocomplete,el.name,el.id,el.getAttribute('aria-label')].join(' ');
    if(sens.test(hints)) continue;
    const st=getComputedStyle(el);
    if(st.visibility==='hidden'||st.display==='none') continue;
    const id=String(fields.length),value=el.isContentEditable?el.textContent:el.value;
    map.set(id,{el,value,kind:'field'});
    const label=(el.labels?.[0]?.textContent?.trim()||el.getAttribute('aria-label')||el.placeholder||el.name||el.id||el.tagName.toLowerCase());
    fields.push({id,label:label.slice(0,160),kind:el.tagName.toLowerCase(),length:String(value||'').length});
  }
  const seen=new Set();
  const cands=document.querySelectorAll('a[href],button,input,select,textarea,summary,[role="button"],[tabindex]');
  for(const el of cands){
    if(interactives.length>=120) break;
    if(seen.has(el)) continue;
    seen.add(el);
    if(el.disabled) continue;
    if(el.closest('[hidden],[aria-hidden="true"]')) continue;
    if(!el.getClientRects().length) continue;
    const st=getComputedStyle(el);
    if(st.display==='none'||st.visibility==='hidden') continue;
    if(el.tagName==='INPUT'&&['hidden','password'].includes(el.type)) continue;
    let name=(el.getAttribute('aria-label')||el.textContent||el.value||el.title||el.placeholder||el.name||el.id||el.tagName).trim().replace(/\s+/g,' ').slice(0,120);
    if(!name) continue;
    const role=(el.getAttribute('role')||el.tagName.toLowerCase()+(el.type?'['+el.type+']':'')).slice(0,40);
    const ref='e'+interactives.length;
    map.set(ref,{el,kind:'interactive'});
    interactives.push({ref,role,name});
  }
  globalThis.__orbitPageEdit={token,map,url:location.href};
  return {title:document.title,url:location.href,text:text.slice(0,12000),token,fields,interactives};
}
export function agentAct(token,action,expectedURL){
  const st=globalThis.__orbitPageEdit;
  if(!st||st.token!==token||st.url!==location.href||location.href!==expectedURL) return {ok:false,error:'Page changed. Take a fresh snapshot.'};
  if(!action||typeof action!=='object') return {ok:false,error:'Bad action.'};
  const entry=action.tool==='snapshot'?null:st.map.get(String(action.ref||''));
  if(action.tool!=='snapshot'&&!entry?.el?.isConnected) return {ok:false,tool:action.tool,ref:action.ref,error:'Element gone. Take a fresh snapshot.'};
  const el=entry?.el;
  const visible=e=>{ if(!e.getClientRects().length) return false; const s=getComputedStyle(e); return s.display!=='none'&&s.visibility!=='hidden'; };
  const sens=e=>/password|passwd|credit|cc-|card|cvc|cvv|otp|one-time|secret|token|api.?key/i.test([e.autocomplete,e.name,e.id,e.getAttribute&&e.getAttribute('aria-label')].join(' '));
  try{
    if(action.tool==='click'){ if(!visible(el)) return {ok:false,tool:'click',ref:action.ref,error:'Element not visible.'}; el.scrollIntoView({block:'center'}); el.focus({preventScroll:true}); el.click(); return {ok:true,tool:'click',ref:action.ref,detail:el.tagName}; }
    if(action.tool==='focus'){ el.focus({preventScroll:false}); return {ok:true,tool:'focus',ref:action.ref}; }
    if(action.tool==='scroll'){ el.scrollIntoView({block:'center'}); return {ok:true,tool:'scroll',ref:action.ref}; }
    if(action.tool==='fill'||action.tool==='type'){
      if(entry.kind!=='field') return {ok:false,tool:action.tool,ref:action.ref,error:'Ref is not an editable field. Snapshot again.'};
      if(el.disabled||el.readOnly||!visible(el)) return {ok:false,tool:action.tool,ref:action.ref,error:'Field no longer editable.'};
      if(el.tagName==='INPUT'&&!['text','search','url','email','tel','number'].includes(el.type)) return {ok:false,tool:action.tool,ref:action.ref,error:'Field type changed; blocked.'};
      if(sens(el)) return {ok:false,tool:action.tool,ref:action.ref,error:'Sensitive field; blocked.'};
      if(typeof action.text!=='string'||action.text.length>50000) return {ok:false,tool:action.tool,ref:action.ref,error:'Text must be under 50,000 chars.'};
      const cur=el.isContentEditable?el.textContent:el.value;
      if(cur!==entry.value) return {ok:false,tool:action.tool,ref:action.ref,error:'Field changed since snapshot. Snapshot again.'};
      const next=action.tool==='fill'?action.text:(cur||'')+action.text;
      if(next.length>50000) return {ok:false,tool:action.tool,ref:action.ref,error:'Result too long.'};
      el.focus(); el.scrollIntoView({block:'center'});
      if(el.isContentEditable) el.textContent=next;
      else{ const p=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p,'value').set.call(el,next); }
      el.dispatchEvent(new Event('input',{bubbles:true,composed:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
      entry.value=next;
      const v=el.isContentEditable?el.textContent:el.value;
      return v===next?{ok:true,tool:action.tool,ref:action.ref,detail:String(next.length)+' chars'}:{ok:false,tool:action.tool,ref:action.ref,error:'Site rejected the text.'};
    }
    if(action.tool==='select'){
      if(el.tagName!=='SELECT') return {ok:false,tool:'select',ref:action.ref,error:'Ref is not a dropdown.'};
      if(el.disabled||!visible(el)) return {ok:false,tool:'select',ref:action.ref,error:'Dropdown not editable.'};
      const want=String(action.text||'').trim().toLowerCase();
      if(!want) return {ok:false,tool:'select',ref:action.ref,error:'No option given.'};
      let idx=-1;
      for(let i=0;i<el.options.length;i++){ const t=(el.options[i].text||'').trim().toLowerCase(),v=String(el.options[i].value||'').trim().toLowerCase(); if(t===want||v===want){idx=i;break;} }
      if(idx<0) for(let i=0;i<el.options.length;i++){ const t=(el.options[i].text||'').trim().toLowerCase(); if(t.includes(want)){idx=i;break;} }
      if(idx<0) return {ok:false,tool:'select',ref:action.ref,error:'Option not found.'};
      el.focus(); el.selectedIndex=idx;
      el.dispatchEvent(new Event('input',{bubbles:true,composed:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
      return {ok:true,tool:'select',ref:action.ref,detail:el.options[idx].text.slice(0,120)};
    }
    return {ok:false,error:'Unknown tool.'};
  }catch(e){ return {ok:false,tool:action.tool,ref:action.ref,error:String(e&&e.message||e).slice(0,300)}; }
}

export async function quickPageReference(depth='balanced'){
 const active=(await chrome.tabs.query({active:true,lastFocusedWindow:true}))[0];
 if(!active?.id||!active.url) throw Error('No active webpage found.');
 pageOrigin(active.url);
 const pattern=pageOrigin(active.url);
 if(!await chrome.permissions.contains({origins:[pattern]})){
  const granted=await chrome.permissions.request({origins:[pattern]});
  if(!granted) throw Error('Site access was not granted.');
 }
 let results;
 try{results=await chrome.scripting.executeScript({target:{tabId:active.id},func:inspectPage});}
 catch(e){throw Error('Chrome could not read this page. '+e.message);}
 const snapshot=results[0]?.result;
 if(!snapshot)throw Error('The page returned no readable context.');
 const limits={focused:8000,balanced:16000,deep:24000};
 return {title:snapshot.title||active.title||'Active page',url:snapshot.url||active.url,text:String(snapshot.text||'').slice(0,limits[depth]||16000),kind:'text'};
}

export async function captureActiveScreenshot(){
 const active=(await chrome.tabs.query({active:true,lastFocusedWindow:true}))[0];
 if(!active?.id||!active.url) throw Error('No active webpage found.');
 pageOrigin(active.url);
 const pattern=pageOrigin(active.url);
 if(!await chrome.permissions.contains({origins:[pattern]})){
  const granted=await chrome.permissions.request({origins:[pattern]});
  if(!granted) throw Error('Site access was not granted.');
 }
 let dataUrl;
 try{dataUrl=await chrome.tabs.captureVisibleTab(active.windowId,{format:'jpeg',quality:82});}
 catch(e){throw Error('Screenshot capture failed. Click the Orbit toolbar icon on the target page, then try again. '+e.message);}
 if(typeof dataUrl!=='string'||!dataUrl.startsWith('data:image/'))throw Error('Chrome did not return a screenshot.');
 if(dataUrl.length>3500000)throw Error('Screenshot is too large to attach. Reduce browser zoom or window size.');
 return {title:active.title||'Active page',url:active.url,dataUrl,kind:'screenshot'};
}
