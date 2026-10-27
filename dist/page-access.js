import {askConfirm} from './dialogs.js';
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
 title.id='pageTitleTools';dialog.setAttribute('aria-labelledby','pageTitleTools');
 tabsSelect.setAttribute('aria-label','Target webpage');fields.setAttribute('aria-label','Target editable field');preview.setAttribute('aria-label','Page text preview');replacement.setAttribute('aria-label','Replacement text');preview.rows=9;replacement.rows=5;replacement.maxLength=50000;replacement.placeholder='Paste an answer or type the exact replacement here. This replaces the complete selected field.';for(const e of [tabsSelect,preview,fields,replacement]){e.style.width='100%';e.style.marginTop='12px';}attach.disabled=true;apply.disabled=true;let tabs=[],snapshot,documentId,fetched;
 const urlInput=node('input'),fetchBtn=node('button','Fetch URL as text'),digestBtn=node('button','Attach digest of all tabs');
 urlInput.type='url';urlInput.placeholder='…or paste any https:// URL to fetch as plain text (no scripts run)';urlInput.setAttribute('aria-label','URL to fetch');urlInput.style.width='100%';urlInput.style.marginTop='12px';
 function reset(){snapshot=null;documentId=null;fetched=null;fields.replaceChildren();preview.value='';attach.disabled=true;apply.disabled=true;}
 function selected(){const t=tabs.find(x=>String(x.id)===tabsSelect.value);if(!t)throw Error('No target webpage. Open a normal HTTP/HTTPS page, then refresh.');return t;}
 const run=fn=>async()=>{try{await fn();}catch(e){msg.textContent=e.message;}};
 async function loadTabs(){reset();const active=await chrome.tabs.query({active:true,lastFocusedWindow:true});tabs=targetTabs(await chrome.tabs.query({}),location.href);tabsSelect.replaceChildren();for(const t of tabs){const o=node('option',(t.title||new URL(t.url).hostname)+' — '+new URL(t.url).origin);o.value=String(t.id);tabsSelect.append(o);}if(active[0]&&tabs.some(t=>t.id===active[0].id))tabsSelect.value=String(active[0].id);msg.textContent=tabs.length?'Confirm the selected target, then grant access.':'No supported webpages found.';}
 tabsSelect.onchange=()=>{reset();msg.textContent='Target changed. Grant access and scan this page.';};refresh.onclick=run(loadTabs);
 digestBtn.onclick=run(async()=>{
   const list=targetTabs(await chrome.tabs.query({}),location.href).slice(0,12);
   if(!list.length)throw Error('No supported webpages found.');
   const patterns=[...new Set(list.map(t=>pageOrigin(t.url)))];
   const granted=await chrome.permissions.request({origins:patterns});
   if(!granted)throw Error('Site access was not granted; nothing was read.');
   msg.textContent='Reading '+list.length+' tab(s)…';
   const parts=[];let used=0,read=0;
   for(const t of list){
     try{
       const fresh=await chrome.tabs.get(t.id);
       if(!fresh.url)continue;
       const results=await chrome.scripting.executeScript({target:{tabId:t.id},func:digestScan});
       const s=results[0]?.result;
       if(!s?.text)continue;
       const chunk=String(fresh.title||s.title||'').slice(0,80)+' — '+fresh.url+'\n'+s.text;
       if(used+chunk.length>24000)break;
       parts.push(chunk);used+=chunk.length;read++;
     }catch{}
   }
   if(!parts.length)throw Error('No tab text could be read.');
   reset();
   fetched={title:'Open tabs digest ('+read+' tab'+(read===1?'':'s')+')',url:''};
   preview.value=parts.join('\n\n---\n\n');attach.disabled=false;
   msg.textContent='Read '+read+' tab(s), '+used+' characters total, in one reference. Review, then attach.';
 });
 // This call occurs synchronously within the button gesture, not after tabs.query/fetch.
 grant.onclick=run(async()=>{const t=selected(),pattern=pageOrigin(t.url);const ok=await chrome.permissions.request({origins:[pattern]});msg.textContent=ok?'Access granted. Click Read page & scan fields.':'Permission denied. No page content was read.';});
 revoke.onclick=run(async()=>{const t=selected();await chrome.permissions.remove({origins:[pageOrigin(t.url)]});reset();msg.textContent='Persistent site grant removed. A temporary toolbar activeTab grant, if present, may last until navigation/tab close.';});
 scan.onclick=run(async()=>{reset();const t=selected(),fresh=await chrome.tabs.get(t.id);if(fresh.url!==t.url){await loadTabs();throw Error('Target navigated. Confirm its current site and grant access again.');}pageOrigin(fresh.url);let results;try{results=await chrome.scripting.executeScript({target:{tabId:t.id},func:inspectPage});}catch(e){throw Error('Page access failed. Click Grant access to this site, approve Chrome’s prompt, then retry. Chrome internal/store pages and managed blocked sites cannot be accessed. '+e.message);}const r=results[0];if(!r?.result||!r.documentId)throw Error('No readable document returned.');snapshot=r.result;documentId=r.documentId;preview.value=snapshot.text;attach.disabled=!snapshot.text;for(const f of snapshot.fields){const o=node('option',f.label+' ('+f.kind+', '+f.length+' characters)');o.value=f.id;fields.append(o);}apply.disabled=!snapshot.fields.length;msg.textContent='Read '+snapshot.text.length+' characters; '+snapshot.fields.length+' eligible top-frame fields. Review before attaching or writing.';});
 attach.onclick=run(async()=>{if(!snapshot&&!fetched)throw Error('Read or fetch first.');const source=snapshot?{title:snapshot.title,url:snapshot.url}:{title:fetched.title,url:fetched.url};onReference({...source,text:preview.value.slice(0,24000),kind:'text'});dialog.close();});
 fetchBtn.onclick=run(async()=>{
   let raw=urlInput.value.trim();
   if(!raw){const t=tabs.find(x=>String(x.id)===tabsSelect.value);raw=t?t.url:'';}
   if(!raw)throw Error('Paste a URL, or select a webpage first.');
   let u;try{u=new URL(raw);}catch{throw Error('That does not look like a valid URL.');}
   if(u.username||u.password)throw Error('URLs with embedded credentials are not fetched.');
   if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw Error('Only https:// URLs (or local http servers) can be fetched.');
   const pattern=u.protocol+'//'+u.hostname+'/*';
   if(!await chrome.permissions.contains({origins:[pattern]})){const okp=await chrome.permissions.request({origins:[pattern]});if(!okp)throw Error('Site access was not granted; nothing was fetched.');}
   msg.textContent='Fetching '+u.origin+' as text…';
   const res=await fetch(u.href,{credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(20000)});
   if(!res.ok)throw Error('Fetch returned HTTP '+res.status+'.');
   const type=res.headers.get('content-type')||'';
   if(type&&!/text\/|json|xml|javascript/i.test(type))throw Error('Not a text page (content-type '+type.split(';')[0]+'); nothing was attached.');
   const reader=res.body?.getReader();
   if(!reader)throw Error('The response had no readable body.');
   let n=0;const parts=[];
   try{ while(true){ const {done,value}=await reader.read(); if(done)break; n+=value.length; if(n>2000000)throw Error('Page exceeds the 2 MB fetch limit; nothing was attached.'); parts.push(value); } }
   finally{ try{ await reader.cancel(); }catch{} }
   const bytes=new Uint8Array(n);let off=0;for(const p of parts){bytes.set(p,off);off+=p.length;}
   const label=(/charset=["']?([\w-]+)/i.exec(type)?.[1]||'utf-8').toLowerCase();
   let body;
   try{ body=new TextDecoder(/^[a-z0-9_-]+$/.test(label)?label:'utf-8',{fatal:false}).decode(bytes); }
   catch{ body=new TextDecoder('utf-8',{fatal:false}).decode(bytes); }
   let text=body,title=u.hostname;
   if(/html/i.test(type)||/^\s*<(!doctype|html)/i.test(body)){
     const doc=new DOMParser().parseFromString(body,'text/html');
     doc.querySelectorAll('script,style,noscript,template,svg').forEach(n=>n.remove());
     title=String(doc.title||u.hostname).slice(0,200);
     text=doc.body?doc.body.textContent:'';
   }
   text=text.replace(/[ \t]{2,}/g,' ').replace(/\n{3,}/g,'\n\n').trim().slice(0,24000);
   if(!text)throw Error('No readable text was found at that URL.');
   reset();
   fetched={title,url:u.href};
   preview.value=text;attach.disabled=false;
   msg.textContent='Fetched '+text.length+' characters from '+u.hostname+'. Review, then attach.';
 });
 apply.onclick=run(async()=>{if(!snapshot||!documentId)throw Error('Read/scan first.');const t=selected(),f=snapshot.fields.find(f=>f.id===fields.value);if(!f)throw Error('Select an editable field.');const text=replacement.value;if(!text&&!await askConfirm({title:'Clear this field?',body:'The replacement is empty, so writing would remove what the field holds.',confirmLabel:'Clear it',cancelLabel:'Keep',danger:true}))return;const host=new URL(snapshot.url).origin;if(!await askConfirm({title:'Replace the entire field?',body:'On '+host+', replace “'+f.label+'” with the text shown below. This does not click Submit. The website may autosave on input.',detail:text,confirmLabel:'Replace field',cancelLabel:'Keep',danger:true}))return;const result=await chrome.scripting.executeScript({target:{tabId:t.id,documentIds:[documentId]},func:writeField,args:[snapshot.token,f.id,text,snapshot.url]});if(result[0]?.result?.error)throw Error(result[0].result.error);if(!result[0]?.result?.ok)throw Error('Write could not be confirmed. Inspect the page before trying again.');apply.disabled=true;msg.textContent='Text inserted. No submit button was clicked. Read/scan again before another write.';});
 const row=node('div');row.className='row';row.append(refresh,grant,scan,revoke);const fetchRow=node('div');fetchRow.className='row';fetchRow.append(fetchBtn,digestBtn);const writeLabel=node('h3','Write into an editable field');const bottom=node('div');bottom.className='row';bottom.append(attach,apply,close);dialog.append(title,notice,tabsSelect,row,urlInput,fetchRow,msg,preview,writeLabel,fields,replacement,bottom);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});close.onclick=()=>dialog.close();dialog.showModal();await loadTabs();
}
export function snapshotPage(){
  const sel='a[href],button,input,textarea,select,summary,[role="button"],[role="link"],[role="textbox"],[role="combobox"],[role="listbox"],[role="checkbox"],[role="radio"],[role="menuitem"],[role="tab"],[role="switch"],[contenteditable="true"],[contenteditable=""],[tabindex]:not([tabindex="-1"])';
  const clip=(s,n=90)=>String(s??'').replace(/\s+/g,' ').trim().slice(0,n);
  const visible=e=>!!(e.getClientRects().length);
  const sens=e=>/password|passwd|credit|cc-|card|cvc|cvv|otp|one-time|secret|token|api.?key/i.test([e.autocomplete,e.name,e.id,e.getAttribute&&e.getAttribute('aria-label')].join(' '));
  const labelOf=e=>clip(e.getAttribute('aria-label')||e.getAttribute('placeholder')||e.getAttribute('title')||(e.labels&&e.labels[0]?e.labels[0].textContent:'')||e.getAttribute('name')||e.id||e.textContent||e.tagName.toLowerCase(),90);
  const selText=window.getSelection()?.toString()||'';
  let text='';
  if(selText.trim()) text=selText.slice(0,12000);
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
  const seen=new Set(),light=[],deep=[];
  for(const e of document.querySelectorAll(sel)){seen.add(e);light.push(e);}
  // Shadow DOM: custom elements are the realistic hosts; the sweep per root is bounded.
  let hosts=[document];
  for(let depth=0;depth<3&&hosts.length;depth++){
    const next=[];
    for(const host of hosts){
      let swept=0;
      for(const e of host.querySelectorAll('*')){
        if(swept++>4000) break;
        if(e.localName&&e.localName.includes('-')&&e.shadowRoot){
          for(const c of e.shadowRoot.querySelectorAll(sel)){if(!seen.has(c)){seen.add(c);deep.push(c);}}
          next.push(e.shadowRoot);
        }
      }
    }
    hosts=next;
  }
  const token=crypto.randomUUID(),map=new Map(),fields=[],interactives=[];
  const candidates=light.concat(deep);
  for(const el of candidates){
    if(fields.length>=100) break;
    if(el.closest('[hidden],[aria-hidden="true"]')||!el.getClientRects().length||el.disabled||el.readOnly) continue;
    if(!(el.tagName==='TEXTAREA'||el.isContentEditable||(el.tagName==='INPUT'&&['text','search','url','email','tel','number'].includes(el.type))||el.tagName==='SELECT')) continue;
    if(sens(el)) continue;
    const st=getComputedStyle(el);
    if(st.visibility==='hidden'||st.display==='none') continue;
    const id=String(fields.length),value=el.isContentEditable?el.textContent:el.value;
    map.set(id,{el,value,kind:'field'});
    const entry={id,label:labelOf(el).slice(0,160),kind:el.tagName.toLowerCase(),length:String(value||'').length};
    if(entry.kind!=='select'&&typeof value==='string'&&value) entry.value=clip(value,40);
    if(el.tagName==='SELECT') entry.options=[...el.options].slice(0,20).map(o=>({label:clip(o.text,40),value:String(o.value||'').slice(0,60)}));
    fields.push(entry);
  }
  for(const el of candidates){
    if(interactives.length>=120) break;
    if(el.disabled) continue;
    if(el.closest('[hidden],[aria-hidden="true"]')) continue;
    if(!el.getClientRects().length) continue;
    const st=getComputedStyle(el);
    if(st.display==='none'||st.visibility==='hidden') continue;
    if(el.tagName==='INPUT'&&['hidden','password'].includes(el.type)) continue;
    if(el.tagName==='SELECT'||el.tagName==='TEXTAREA'||el.isContentEditable) continue;
    let name=clip(el.getAttribute('aria-label')||el.textContent||el.value||el.title||el.placeholder||el.name||el.id||el.tagName,120);
    if(!name) continue;
    const role=clip(el.getAttribute('role')||el.tagName.toLowerCase()+(el.type?'['+el.type+']':''),40);
    const ref='e'+interactives.length;
    map.set(ref,{el,kind:'interactive',label:clip(el.getAttribute('aria-label')||el.textContent||el.value||el.title||'',60),tag:el.tagName});
    const entry={ref,role,name};
    if(el.tagName==='A') entry.href=clip(el.href,100);
    interactives.push(entry);
  }
  globalThis.__orbitPageEdit={token,map,url:location.href};
  return {title:document.title,url:location.href,text:text.slice(0,12000),token,fields,interactives};
}
export async function agentAct(token,action,expectedURL){
  const st=globalThis.__orbitPageEdit;
  if(!st||st.token!==token||st.url!==location.href||location.href!==expectedURL) return {ok:false,error:'Page changed. Take a fresh snapshot.'};
  if(!action||typeof action!=='object') return {ok:false,error:'Bad action.'};
  const KEYS=['Tab','Escape','Enter','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
  const clip=(s,n=90)=>String(s??'').replace(/\s+/g,' ').trim().slice(0,n);
  const visible=e=>!!(e.getClientRects().length);
  const sens=e=>/password|passwd|credit|cc-|card|cvc|cvv|otp|one-time|secret|token|api.?key/i.test([e.autocomplete,e.name,e.id,e.getAttribute&&e.getAttribute('aria-label')].join(' '));
  const frame=()=>new Promise(res=>{if(document.hidden)return res();let done=false;const go=()=>{if(!done){done=true;res();}};requestAnimationFrame(go);setTimeout(go,80);});
  const settleQuiet=cap=>new Promise(res=>{
    if(document.hidden)return void setTimeout(res,120);
    let quiet,done=false;
    const finish=()=>{if(done)return;done=true;mo.disconnect();clearTimeout(hard);clearTimeout(quiet);res();};
    const mo=new MutationObserver(()=>{clearTimeout(quiet);quiet=setTimeout(finish,110);});
    const hard=setTimeout(finish,cap);
    mo.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});
    quiet=setTimeout(finish,Math.min(160,cap));
  });
  const outline=()=>{
    const out=[],seenH=new Set(),seenL=new Set();
    for(const h of document.querySelectorAll('h1,h2,h3,h4')){if(out.length>200)break;const t=clip(h.textContent,90);if(t&&!seenH.has(t)){seenH.add(t);out.push('H '+t);}}
    const tables=[...document.querySelectorAll('table')].filter(visible).slice(0,3);
    for(const [i,table] of tables.entries()){
      const head=[...table.querySelectorAll('thead th,tr:first-child th')].slice(0,8).map(th=>clip(th.textContent,30));
      const rows=[...table.querySelectorAll('tbody tr')].slice(0,6).map(tr=>[...tr.querySelectorAll('td,th')].slice(0,8).map(td=>clip(td.textContent,34)));
      if(rows.length)out.push('TABLE t'+(i+1)+(head.length?' ['+head.join('; ')+']':'')+'\n'+rows.map(r=>r.join(' ; ')).join('\n'));
    }
    let items=0;
    for(const li of document.querySelectorAll('li')){if(items>=44)break;if(!visible(li)||li.querySelector('li'))continue;const t=clip(li.textContent,120);if(t.length>2&&!seenL.has(t)){seenL.add(t);out.push('I '+t);items++;}}
    let links=0;
    for(const a of document.querySelectorAll('a[href]')){if(links>=34)break;if(!visible(a))continue;const t=clip(a.textContent,70);if(t.length>1&&!seenL.has(t)){seenL.add(t);out.push('L '+t+' -> '+clip(a.href,90));links++;}}
    return out.join('\n').slice(0,2600);
  };
  const noRefTools=['snapshot','extract','wait'];
  const needsRef=!noRefTools.includes(action.tool)&&(action.tool!=='scroll'||!!action.ref);
  const entry=needsRef?st.map.get(String(action.ref||'')):null;
  if(needsRef&&!entry?.el?.isConnected) return {ok:false,tool:action.tool,ref:action.ref,error:'Element gone. Take a fresh snapshot.'};
  const el=entry?.el;
  const staleCheck=()=>entry.tag!==undefined&&(entry.tag!==el.tagName||(entry.label&&clip(el.getAttribute('aria-label')||el.textContent||el.value||'',60)!==entry.label));
  try{
    if(action.tool==='snapshot') return {ok:true,tool:'snapshot',detail:'re-read'};
    if(action.tool==='extract'){const data=outline();return {ok:true,tool:'extract',detail:data||'Nothing extractable found'};}
    if(action.tool==='wait'){const ms=Math.max(100,Math.min(800,Number(action.text)||300));await new Promise(r=>setTimeout(r,ms));return {ok:true,tool:'wait',detail:'waited '+ms+' ms'};}
    // OpenDuet-era: read what the page says now (after a form submit, filter, pagination, etc.).
    if(action.tool==='computer_read'){
      const readText=String(action.text||'').slice(0,6000);
      // Verify the model is citing something observable in the live page before reporting it.
      const scan=document.body?document.body.textContent.slice(0,15000):'';
      const cited=scan?readText.split(' ').filter(w=>w.length>6).some(w=>scan.includes(w)):true;
      const headings=outline();
      const data=[headings,readText].filter(Boolean).join('\n\n').slice(0,8000);
      return {ok:!!cited,tool:'computer_read',ref:action.ref,detail:(cited?'verified: '+data:'observation not verifiable on current page — snapshot again')}+('\n'+data.slice(0,3000));
    }
    // The workspace and the two human-handover tools are handled in the panel
    // (agent-run.js), not here: a workspace needs extension storage, and a masked dialog
    // cannot exist inside the page. Reaching this means the caller routed them wrong, so
    // say that rather than pretending the work happened.
    if(action.tool==='computer_list_files'||action.tool==='computer_read_file'||action.tool==='computer_write_file'){
      return {ok:false,tool:action.tool,error:'The workspace is handled in the panel, not on the page.'};
    }
    if(action.tool==='computer_request_help'||action.tool==='computer_request_secret'){
      return {ok:false,tool:action.tool,error:'This needs a dialog, which the page cannot show. It is handled in the panel.'};
    }
    if(action.tool==='scroll'&&!action.ref){
      const v=String(action.text||'').trim();
      if(v==='top')scrollTo({top:0,behavior:'instant'});
      else if(v==='bottom')scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'});
      else{const n=Number(v);if(!Number.isFinite(n))return {ok:false,tool:'scroll',error:'Bad scroll amount.'};scrollBy({top:Math.max(-1200,Math.min(1200,n)),behavior:'instant'});}
      await settleQuiet(600);
      return {ok:true,tool:'scroll',detail:'scrolled '+v};
    }
    if(staleCheck()) return {ok:false,tool:action.tool,ref:action.ref,error:'Target changed since snapshot. Snapshot again.'};
    if(action.tool==='click'||action.tool==='hover'){
      if(!visible(el)) return {ok:false,tool:action.tool,ref:action.ref,error:'Element not visible.'};
      el.scrollIntoView({block:'center',inline:'nearest'});
      await frame();
      const r=el.getBoundingClientRect(),x=Math.round(r.left+r.width/2),y=Math.round(r.top+r.height/2);
      if(action.tool==='hover'){
        for(const t of ['pointerover','mouseover','mouseenter','mousemove'])el.dispatchEvent(new PointerEvent(t,{bubbles:true,clientX:x,clientY:y}));
        await settleQuiet(600);
        return {ok:true,tool:'hover',ref:action.ref,detail:'hovered '+clip(el.getAttribute('aria-label')||el.textContent||'',40)};
      }
      await frame();
      const attempt=()=>{
        let hit=null,blocker=null;
        for(const [px,py] of [[x,y],[r.left+2,r.top+2],[r.right-2,r.top+2],[r.left+2,r.bottom-2],[r.right-2,r.bottom-2]]){
          const ix=Math.round(px),iy=Math.round(py);
          if(ix<0||iy<0||ix>=innerWidth||iy>=innerHeight)continue;
          const over=document.elementFromPoint(ix,iy);
          if(over===el||el.contains(over)){hit=[ix,iy];break;}
          if(!blocker&&over)blocker=over;
        }
        return {hit,blocker};
      };
      let aim=attempt();
      if(!aim.hit&&aim.blocker){await settleQuiet(350);aim=attempt();}
      if(!el.isConnected)return {ok:false,tool:'click',ref:action.ref,error:'Element gone.'};
      if(!aim.hit){
        if(aim.blocker){const b=clip(aim.blocker.tagName.toLowerCase()+(aim.blocker.id?'#'+aim.blocker.id:'')+' '+(aim.blocker.getAttribute('aria-label')||aim.blocker.textContent||''),70);return {ok:false,tool:'click',ref:action.ref,error:'Covered by '+b+' — that has to be closed first.'};}
        return {ok:false,tool:'click',ref:action.ref,error:'Target is off screen.'};
      }
      el.focus({preventScroll:true});
      el.click();
      await settleQuiet(600);
      return {ok:true,tool:'click',ref:action.ref,detail:el.tagName.toLowerCase()};
    }
    if(action.tool==='press'){
      if(!KEYS.includes(action.text)) return {ok:false,tool:'press',ref:action.ref,error:'Key blocked. Only '+KEYS.join(', ')+'.'};
      el.focus();
      for(const t of ['keydown','keyup'])el.dispatchEvent(new KeyboardEvent(t,{key:action.text,bubbles:true}));
      await settleQuiet(400);
      return {ok:true,tool:'press',ref:action.ref,detail:action.text};
    }
    if(action.tool==='focus'){el.focus({preventScroll:false});return {ok:true,tool:'focus',ref:action.ref};}
    if(action.tool==='scroll'){el.scrollIntoView({block:'center'});await settleQuiet(300);return {ok:true,tool:'scroll',ref:action.ref};}
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
      el.focus();el.scrollIntoView({block:'center'});
      if(el.isContentEditable)el.textContent=next;
      else{const p=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(el,next);}
      el.dispatchEvent(new Event('input',{bubbles:true,composed:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
      entry.value=next;
      const v=el.isContentEditable?el.textContent:el.value;
      await settleQuiet(600);
      return v===next?{ok:true,tool:action.tool,ref:action.ref,detail:String(next.length)+' chars'}:{ok:false,tool:action.tool,ref:action.ref,error:'Site rejected the text.'};
    }
    if(action.tool==='select'){
      if(el.tagName!=='SELECT') return {ok:false,tool:'select',ref:action.ref,error:'Ref is not a dropdown.'};
      if(el.disabled||!visible(el)) return {ok:false,tool:'select',ref:action.ref,error:'Dropdown not editable.'};
      const want=String(action.text||'').trim().toLowerCase();
      if(!want) return {ok:false,tool:'select',ref:action.ref,error:'No option given.'};
      let idx=-1;
      for(let i=0;i<el.options.length;i++){const t=(el.options[i].text||'').trim().toLowerCase(),v=String(el.options[i].value||'').trim().toLowerCase();if(t===want||v===want){idx=i;break;}}
      if(idx<0)for(let i=0;i<el.options.length;i++){const t=(el.options[i].text||'').trim().toLowerCase();if(t.includes(want)){idx=i;break;}}
      if(idx<0) return {ok:false,tool:'select',ref:action.ref,error:'Option not found.'};
      el.focus();el.selectedIndex=idx;
      el.dispatchEvent(new Event('input',{bubbles:true,composed:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
      await settleQuiet(600);
      return {ok:true,tool:'select',ref:action.ref,detail:el.options[idx].text.slice(0,120)};
    }
    return {ok:false,error:'Unknown tool.'};
  }catch(e){ return {ok:false,tool:action.tool,ref:action.ref,error:String(e&&e.message||e).slice(0,300)}; }
}
/**
 * Write ONE value into a field the operator loop is not allowed to fill itself.
 *
 * This is the only path in the extension that writes to a field the sensitive-field
 * check refuses: a password, a one-time code, a card number. The value arrives from a
 * masked dialog in the panel, is handed straight to the page here, and is never
 * returned, logged, stored, or put in the model's context. The result says only
 * whether the field took it.
 *
 * Everything the ordinary write path checks still applies: same document, element
 * still connected and visible, and the page's own input/change events fire so a
 * framework-controlled field updates rather than silently ignoring the value.
 */
export function secretFill(token,ref,value,expectedURL){
  const st=globalThis.__orbitPageEdit;
  if(!st||st.token!==token||st.url!==location.href||location.href!==expectedURL)return {error:'Page changed. Take a fresh snapshot.'};
  const entry=st.map.get(String(ref||''));
  if(!entry?.el?.isConnected)return {error:'Element gone. Take a fresh snapshot.'};
  const el=entry.el;
  if(el.disabled||el.readOnly)return {error:'Field is not editable.'};
  if(!el.getClientRects().length)return {error:'Field is not visible; scroll it into view first.'};
  if(typeof value!=='string'||!value)return {error:'No value was given.'};
  if(value.length>4000)return {error:'Value is too long for one field.'};
  try{
    el.focus();
    if(el.isContentEditable)el.textContent=value;
    else{const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);}
    el.dispatchEvent(new Event('input',{bubbles:true,composed:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    const written=el.isContentEditable?el.textContent:el.value;
    // Length only: the value itself must never travel back out of the page.
    return written===value?{ok:true,detail:'filled '+value.length+' characters'}:{error:'The site altered or rejected the value.'};
  }catch(e){return {error:String(e&&e.message||e).slice(0,200)};}
}

export function navHistoryStep(dir){  if(dir==='back')history.back();
  else if(dir==='forward')history.forward();
  return {ok:true,dir:dir==='forward'?'forward':'back'};
}
export function digestScan(){
  let text='';
  // display/visibility are layout-independent: a background tab may never have painted, so no layout-dependent check (getClientRects) is usable here.
  // display:none is not inherited into the computed style of a descendant, so an ancestor climb is required to catch CSS-hidden wrappers.
  const hiddenByStyle=el=>{for(let a=el;a&&a!==document.documentElement;a=a.parentElement){const s=getComputedStyle(a);if(s.display==='none'||s.visibility==='hidden'||s.contentVisibility==='hidden')return true;}return false;};
  if(document.body){
    const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let n;
    while((n=walk.nextNode())&&text.length<2000){
      const p=n.parentElement;
      if(!p||p.closest('script,style,noscript,input,textarea,select,button,[contenteditable],[hidden],[aria-hidden="true"]'))continue;
      if(hiddenByStyle(p))continue;
      const v=n.textContent.trim();
      if(v)text+=v+' ';
    }
  }
  return {title:document.title,url:location.href,text:text.replace(/\s+/g,' ').trim().slice(0,1800)};
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

export async function captureVisibleTabImage(windowId){
 let dataUrl;
 try{dataUrl=await chrome.tabs.captureVisibleTab(windowId,{format:'jpeg',quality:82});}
 catch(e){
  const msg=String(e&&e.message||e);
  // Chrome's capture API ignores per-origin grants: it accepts only a fresh activeTab gesture or all-sites host access.
  if(/activeTab|all_urls/i.test(msg)){
   let blanket=false;
   try{blanket=await chrome.permissions.request({origins:['<all_urls>']});}catch{}
   if(!blanket)throw Error('Screenshots need one-time all-sites access, which Chrome requires for captures. Retry from the Screenshot button and approve the Chrome prompt — or click the Orbit toolbar icon on the page, then retry.');
   try{dataUrl=await chrome.tabs.captureVisibleTab(windowId,{format:'jpeg',quality:82});}
   catch(e2){throw Error('Screenshot capture failed. Click the Orbit toolbar icon on the page, then retry. '+String(e2&&e2.message||e2));}
  }else throw Error('Screenshot capture failed. Click the Orbit toolbar icon on the page, then retry. '+msg);
 }
 if(typeof dataUrl!=='string'||!dataUrl.startsWith('data:image/'))throw Error('Chrome did not return a screenshot.');
 return dataUrl;
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
 const dataUrl=await captureVisibleTabImage(active.windowId);
 if(dataUrl.length>3500000)throw Error('Screenshot is too large to attach. Reduce browser zoom or window size.');
 return {title:active.title||'Active page',url:active.url,dataUrl,kind:'screenshot'};
}
