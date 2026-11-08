import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {arenaFlatten,requestBody} from '../src/core.js';
import {arenaSlug} from '../src/arena.js';

const root=new URL('../',import.meta.url);
const [app,html,core,arena]=await Promise.all([
  readFile(new URL('src/app.js',root),'utf8'),
  readFile(new URL('dist/index.html',root),'utf8'),
  readFile(new URL('src/core.js',root),'utf8'),
  readFile(new URL('src/arena.js',root),'utf8')
]);

function runDriver(name,document,origin='https://arena.ai',extra={}){
  const source=arena.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`))[0];
  return runInNewContext(`(${source})()`,{...extra,document,location:{href:origin+'/direct',origin}});
}

function relayHarness({reads=[],onDriver=()=>{},initialUrl='https://arena.ai/direct?model_a=max'}={}){
  let clock=0,index=0,url=initialUrl;
  const calls=[];
  const chrome={
    storage:{session:{get:async()=>({arenaRelayTab:7}),set:async()=>{}}},
    tabs:{
      get:async()=>({id:7,url,status:'complete',windowId:1}),
      query:async()=>[{id:8,active:true,windowId:1}],
      update:async(_id,props)=>{if(props.url)url=props.url;return {id:7,url};},
      create:async()=>({id:7,url})
    },
    scripting:{executeScript:async({func,target})=>{
      calls.push({name:func.name,target});onDriver(func.name);
      let result={ok:true};
      if(func.name==='driverReady')result={composer:true,url};
      if(func.name==='driverRead')result=reads[Math.min(index++,reads.length-1)]||{text:'',count:0,idle:true,generating:false};
      return [{result,documentId:'doc-7'}];
    }}
  };
  const source=arena.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
  const relay=runInNewContext(source+'\n({arenaGenerate,arenaGenerateOnce,relayTarget})',{
    chrome,arenaFlatten,AbortSignal,URL,Date:{now:()=>clock},
    setTimeout:fn=>{clock+=1000;fn();}
  });
  return {relay,calls};
}

test('every injected Arena driver refuses a different origin without touching its DOM',()=>{
  const document=new Proxy({},{get:()=>{throw Error('DOM must not be touched');}});
  for(const name of ['driverReady','driverSend','driverSubmit','driverRead','driverStop','driverOpenPicker','driverReadModels']){
    assert.equal(runDriver(name,document,'https://other.test').error,'wrong-origin',name);
  }
  // The auth watcher reports a different kind of refusal: off-origin means "Google owns
  // the tab right now — keep waiting", so it is a state, not a failure.
  assert.equal(runDriver('driverAuthState',document,'https://accounts.google.com/x').error,'off-origin','driverAuthState');
});

test('the auth-state driver reports walls without ever clicking anything',()=>{
  let clicks=0;
  const makeDocument=dialogText=>({
    querySelectorAll:selector=>selector==='button'?[{textContent:'Continue with Google',click:()=>clicks++}]:[{textContent:dialogText}],
    querySelector:()=>({tagName:'TEXTAREA'}),
    dispatchEvent(){}
  });
  const wall=runDriver('driverAuthState',makeDocument('A free account is required. Log in or create account to continue with Google.'));
  assert.equal(wall.wall,'login'); // property asserts: the result object is built in the vm realm
  assert.equal(clicks,0,'the driver saw the Google button and did not click it');
  const terms=runDriver('driverAuthState',makeDocument('Terms of Use & Privacy Policy By clicking "Agree"'));
  assert.equal(terms.error,'terms-required');
  const ready=runDriver('driverAuthState',makeDocument(''));
  assert.equal(ready.composer,true);
});

test('preparing the composer never clicks Send before the outer cancellation check',async()=>{
  let clicks=0;
  class TextArea{set value(v){this.text=v;}focus(){}dispatchEvent(){}}
  const ta=new TextArea();
  const document={dispatchEvent(){},querySelector:selector=>selector.startsWith('textarea')?ta:{disabled:false,getAttribute:()=>null,click:()=>clicks++}};
  const source=arena.match(/function driverSend\([\s\S]*?\n\}/)[0];
  await runInNewContext(`(${source})('hello')`,{
    document,HTMLTextAreaElement:TextArea,location:{origin:'https://arena.ai'},
    KeyboardEvent:class{},Event:class{},InputEvent:class{},setTimeout:fn=>fn()
  });
  assert.equal(ta.text,'hello');
  assert.equal(clicks,0);
});

test('generateOnce honors the caller’s timeout before any relay work',async()=>{
  const h=relayHarness();
  await assert.rejects(h.relay.arenaGenerateOnce({model:'max'},'',[{role:'user',content:'hi'}],{timeoutMs:0}),/timed out/);
  assert.equal(h.calls.length,0);
});

test('already stopped relay requests cannot submit or open a tab',async()=>{
  const h=relayHarness();
  await assert.rejects(h.relay.arenaGenerate({model:'max'},'',[{role:'user',content:'hi'}],{signal:AbortSignal.abort()}),/Stopped/);
  assert.equal(h.calls.length,0);
});

test('stopping while preparing the composer prevents submission',async()=>{
  const controller=new AbortController();
  const h=relayHarness({onDriver:name=>{if(name==='driverSend')controller.abort();}});
  await assert.rejects(h.relay.arenaGenerate({model:'max'},'',[{role:'user',content:'hi'}],{signal:controller.signal}),/Stopped/);
  assert.ok(!h.calls.some(c=>c.name==='driverSubmit'));
});

test('an unchanged previous Arena response cannot be returned as a new answer',async()=>{
  const h=relayHarness({reads:[{text:'old answer',count:1,idle:true,generating:false}]});
  await assert.rejects(h.relay.arenaGenerateOnce({model:'max'},'',[{role:'user',content:'new question'}]),/did not start/);
});

test('rendered markdown replacements produce the complete answer instead of corrupted deltas',async()=>{
  const h=relayHarness({reads:[
    {text:'',count:0,idle:true,generating:false},
    {text:'**bold',count:1,idle:false,generating:true},
    {text:'bold',count:1,idle:true,generating:false}
  ]});
  const result=await h.relay.arenaGenerateOnce({model:'max'},'',[{role:'user',content:'new question'}]);
  assert.equal(result.text,'bold');
  for(const call of h.calls.filter(c=>['driverSend','driverSubmit'].includes(c.name))){
    assert.equal(call.target.documentIds?.[0],'doc-7','pre-send calls pin the prepared document');
  }
  const reads=h.calls.filter(c=>c.name==='driverRead');
  assert.ok(reads.length>1,'the settle loop ran more than one read');
  assert.equal(reads.at(-1).target.documentIds,undefined,'settle-loop reads follow the live document — the chat navigates to /c/<id> after send');
  assert.equal(reads[0].target.documentIds?.[0],'doc-7','the pre-send baseline read may pin the prepared document');
});

test('Arena legal consent is handed back without clicking Agree',()=>{
  let clicks=0;
  const document={
    querySelectorAll:selector=>selector==='button'?[{textContent:'Agree',click:()=>clicks++}]:[{textContent:'Terms of Use & Privacy Policy By clicking "Agree"'}],
    querySelector:()=>null,
    body:{querySelectorAll:()=>[]}
  };
  const ready=runDriver('driverReady',document);
  assert.equal(clicks,0);
  const result=runDriver('driverRead',document);
  assert.equal(clicks,0);
  assert.equal(ready.error,'terms-required');
  assert.equal(result.error,'terms-required');
});

test('a lone user message goes to the composer verbatim',()=>{
  assert.equal(arenaFlatten([{role:'user',content:'Reply with exactly: OK'}]),'Reply with exactly: OK');
});

test('system instructions and history collapse into one attributed transcript',()=>{
  const out=arenaFlatten([
    {role:'system',content:'You are Orbit.'},
    {role:'user',content:'Hello'},
    {role:'assistant',content:'Hi there'},
    {role:'user',content:'Continue'}
  ]);
  assert.match(out,/<instructions>\nYou are Orbit\.\n<\/instructions>/);
  assert.match(out,/User: Hello/);
  assert.match(out,/Assistant: Hi there/);
  assert.match(out,/User: Continue/);
  assert.match(out,/Continue the conversation as Assistant/);
});

test('OpenAI text parts are accepted but images are refused clearly',()=>{
  assert.equal(arenaFlatten([{role:'user',content:[{type:'input_text',text:'read this'}]}]),'read this');
  assert.throws(()=>arenaFlatten([{role:'user',content:[{type:'text',text:'look'},{type:'image_url',image_url:{url:'data:image/png;base64,x'}}]}]),/text-only/);
  assert.throws(()=>arenaFlatten([{role:'user',content:[{type:'input_image',image_url:'data:image/png;base64,x'}]}]),/text-only/);
});

test('empty and oversized transcripts are rejected',()=>{
  assert.throws(()=>arenaFlatten([]),/Nothing to send/);
  assert.throws(()=>arenaFlatten([{role:'user',content:''}]),/Nothing to send/);
  assert.throws(()=>arenaFlatten([{role:'user',content:'x'.repeat(70000)}]),/60,000-character/);
  assert.throws(()=>arenaFlatten([{role:'system',content:'x'.repeat(70000)},{role:'user',content:'go'}]),/60,000-character/);
});

test('requestBody validates the Arena transport without an OpenAI body',()=>{
  const body=requestBody({transport:'arena',model:'deepseek-v4.1-flash-high'},[{role:'user',content:'hi'}]);
  assert.equal(body.model,'deepseek-v4.1-flash-high');
  assert.equal(body.stream,true);
  assert.throws(()=>requestBody({transport:'arena',model:''},[{role:'user',content:'hi'}]),/Choose an Arena model/);
});

test('picker display names map to URL slugs',()=>{
  assert.equal(arenaSlug('Max'),'max');
  assert.equal(arenaSlug('  deepseek-v4.1-flash-high  '),'deepseek-v4.1-flash-high');
  assert.equal(arenaSlug('Gemini-4-Argon-High'),'gemini-4-argon-high');
});

test('Arena is a first-class, keyless preset wired through the transport',()=>{
  assert.match(app,/arena:'https:\/\/arena\.ai'/);
  assert.match(html,/<option value="arena">Arena \(arena\.ai\)<\/option>/);
  assert.match(html,/id="arenaNote"/);
  assert.match(core,/config\.transport==='arena'/);
  assert.match(app,/state\.provider==='arena'\?\{transport:'arena'/);
  // Keyless: the three key gates must all exempt the Arena transport.
  assert.equal((app.match(/cfg\.transport!=='arena'\)throw Error\('Open Settings and save your API key once/g)||[]).length,2);
  assert.match(app,/c\.transport!=='arena'\)throw Error\('Enter an API key/);
  assert.match(app,/cfg\.transport!=='arena'\)throw Error\('Save your API key in Settings/);
  assert.match(arena,/export async function arenaAuthPeek\(\)/,'the dock can peek at the relay tab without creating or focusing it');
});

// The sign-in watcher against a scripted tab: the URL field is what driverAuthState
// "sees", real timers interleave the test's mid-wait changes, and every tab.update is
// recorded so the tests can prove nothing but activation/navigation ever happens.
function signinHarness({startUrl='https://accounts.google.com/o/oauth2/auth'}={}){
  let url=startUrl,poll=0;
  const calls=[],updates=[];
  const chrome={
    storage:{session:{get:async()=>({arenaRelayTab:7}),set:async()=>{}}},
    tabs:{
      get:async()=>({id:7,url,status:'complete',windowId:1}),
      query:async()=>[{id:8,active:true,windowId:1}],
      update:async(_id,props)=>{updates.push({...props});if(props.url)url=props.url;return {id:7,url};}, // spread: vm-realm objects never deepStrictEqual test-realm literals
      create:async()=>({id:7,url})
    },
    scripting:{executeScript:async({func})=>{
      calls.push(func.name);
      if(func.name!=='driverAuthState')return [{result:{composer:true,url},documentId:'doc-7'}];
      poll++;
      if(!url.startsWith('https://arena.ai'))return [{result:{error:'off-origin',url},documentId:'doc-7'}];
      if(url.includes('login-wall'))return [{result:{wall:'login'},documentId:'doc-7'}];
      if(url.includes('terms-wall'))return [{result:{error:'terms-required'},documentId:'doc-7'}];
      return [{result:{composer:!url.includes('no-composer')},documentId:'doc-7'}];
    }}
  };
  const source=arena.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
  const relay=runInNewContext(source+'\n({arenaOpenForSignIn,arenaWaitSignedIn})',{
    chrome,arenaFlatten,AbortSignal,URL,Date,
    setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms||0,2)) // real timers at ~2 ms so the test can change the page mid-wait
  });
  return {relay,calls,updates,setUrl:u=>{url=u;},polls:()=>poll};
}

test('the sign-in watcher waits through Google and resolves once the wall is gone',async()=>{
  const h=signinHarness();
  const done=h.relay.arenaWaitSignedIn({timeoutMs:5000});
  await new Promise(r=>setTimeout(r,15));
  assert.ok(h.polls()>0,'it polls while Google owns the tab');
  h.setUrl('https://arena.ai/direct?model_a=max'); // the person finished signing in
  const res=await done;
  assert.equal(res.signedIn,true);
  assert.ok(h.calls.every(n=>n==='driverAuthState'),'only the read-only auth driver runs during sign-in');
  assert.equal(h.updates.filter(u=>u.url).length,0,'a mid-OAuth tab is never navigated or clicked');
});

test('a login wall is waited out; landing on arena without a composer lands on /direct once',async()=>{
  const h=signinHarness({startUrl:'https://arena.ai/login-wall'});
  const done=h.relay.arenaWaitSignedIn({timeoutMs:5000});
  await new Promise(r=>setTimeout(r,15));
  h.setUrl('https://arena.ai/direct?model_a=max');
  assert.equal((await done).signedIn,true);
  const h2=signinHarness({startUrl:'https://arena.ai/direct?no-composer=1'});
  const done2=h2.relay.arenaWaitSignedIn({timeoutMs:5000});
  await new Promise(r=>setTimeout(r,15));
  h2.setUrl('https://arena.ai/direct?model_a=max');
  assert.equal((await done2).signedIn,true);
  assert.deepEqual(h2.updates.filter(u=>u.url).map(u=>u.url),['https://arena.ai/text/direct'],'exactly one landing navigation');
});

test('a Terms dialog during sign-in is handed back untouched and the watcher stops',async()=>{
  const h=signinHarness({startUrl:'https://arena.ai/terms-wall'});
  await assert.rejects(h.relay.arenaWaitSignedIn({timeoutMs:5000}),/Terms of Use/);
  assert.equal(h.updates.filter(u=>u.url).length,0,'nothing is clicked or navigated past a Terms dialog');
});

test('the watcher times out honestly instead of waiting forever',async()=>{
  const h=signinHarness({startUrl:'https://accounts.google.com/o/oauth2/auth'});
  await assert.rejects(h.relay.arenaWaitSignedIn({timeoutMs:120}),/timed out/);
  assert.ok(h.polls()>1);
});

test('open-for-sign-in brings the tab forward and only navigates a tab that left arena',async()=>{
  const h=signinHarness({startUrl:'https://accounts.google.com/o/oauth2/auth'});
  assert.equal(await h.relay.arenaOpenForSignIn(),7);
  assert.deepEqual(h.updates,[{active:true}],'mid-OAuth: activation only, no URL change');
  const h2=signinHarness({startUrl:'https://example.com/other'});
  await h2.relay.arenaOpenForSignIn();
  assert.deepEqual(h2.updates.filter(u=>u.url).map(u=>u.url),['https://arena.ai/text/direct'],'a lost tab is brought home');
  assert.ok(h2.updates.some(u=>u.active===true),'and it is foregrounded for the person');
});

// A small DOM stub with just enough selector support for driverRead: tag names, class
// words, [class*="x"] and [attr="x"] matches, innerText, and a computed flex direction.
function buildArenaDoc({domOrder=['assistant','user'],reversed=true,ariaDisabled=false,stop=false}={}){
  const mk=(tag,cls='')=>({tagName:tag.toUpperCase(),className:cls,innerText:'',textContent:'',children:[],attrs:{},shadowRoot:null,
    getAttribute(n){return this.attrs[n]??null;}});
  const bubble=(cls,text)=>{const root=mk('div',cls);const prose=mk('div','prose');prose.innerText=text;root.children.push(prose);return root;};
  const ol=mk('ol','mt-8 flex flex-col'+(reversed?'-reverse':''));
  for(const kind of domOrder)ol.children.push(kind==='user'?bubble('group self-end justify-end','What is Orbit?'):bubble('bg-surface-primary min-w-0 flex-1','THE ANSWER BODY'));
  const main=mk('main');
  main.children.push(ol);
  const send=mk('button');send.attrs={'aria-label':'Send message'};send.textContent='Send';if(ariaDisabled)send.attrs['aria-disabled']='true';
  main.children.push(send);
  if(stop){const b=mk('button');b.textContent='Stop';main.children.push(b);}
  const body=mk('body');body.children.push(main);
  const all=n=>{const out=[];const walk=x=>{for(const c of x.children){out.push(c);walk(c);}};walk(n);return out;};
  const matchEl=(n,sel)=>{
    for(const part of sel.split(',').map(x=>x.trim())){
      let rest=part,ok=true;
      const mTag=/^([a-zA-Z][a-zA-Z0-9-]*)/.exec(rest);
      if(mTag){if(n.tagName.toLowerCase()!==mTag[1].toLowerCase())ok=false;rest=rest.slice(mTag[0].length);}
      if(ok)for(const m of [...rest.matchAll(/\[([a-zA-Z-]+)(?:(\*?)="([^"]*)")?\]/g)]){
        const actual=m[1]==='class'?String(n.className||''):(n.getAttribute(m[1])??null);
        if(m[2]===undefined){if(m[3]!==undefined&&String(actual??'')!==m[3])ok=false;}
        else if(!String(actual??'').includes(m[3]))ok=false;
        rest=rest.replace(m[0],'');
      }
      if(ok)for(const mC of rest.matchAll(/\.([a-zA-Z0-9_-]+)/g))
        if(!new RegExp('(?:^|\s)'+mC[1]+'(?:\s|$)').test(String(n.className||'')))ok=false;
      if(ok)return true;
    }
    return false;
  };
  const withWalk=n=>{n.querySelectorAll=sel=>all(n).filter(x=>matchEl(x,sel));n.querySelector=sel=>n.querySelectorAll(sel)[0]||null;return n;};
  const doc=withWalk(body);
  for(const x of all(body))withWalk(x);
  doc.computed=()=>({flexDirection:reversed?'column-reverse':'column'});
  return doc;
}

test('driverRead classifies bubbles and reads the last assistant in visual order',()=>{
  // flex-col-reverse: DOM order is [assistant, user], but the visual order is user, then assistant.
  const doc=buildArenaDoc({domOrder:['assistant','user'],reversed:true});
  const r=runDriver('driverRead',doc,'https://arena.ai',{getComputedStyle:doc.computed});
  assert.equal(r.text,'THE ANSWER BODY','the newest assistant answer wins, not the DOM-last node');
  assert.equal(r.userText,'What is Orbit?','the person prompt travels with the read');
  assert.match(r.census,/list=ol/);
  assert.match(r.census,/rev=1/);
  assert.equal(r.idle,true);
  assert.equal(r.generating,false);
});

test('driverRead survives column order and never returns the prompt echo',()=>{
  const doc=buildArenaDoc({domOrder:['user','assistant'],reversed:false});
  const r=runDriver('driverRead',doc,'https://arena.ai',{getComputedStyle:doc.computed});
  assert.equal(r.text,'THE ANSWER BODY');
  const onlyUser=buildArenaDoc({domOrder:['user'],reversed:false});
  const r2=runDriver('driverRead',onlyUser,'https://arena.ai',{getComputedStyle:onlyUser.computed});
  assert.equal(r2.text,'','a lone user bubble is never returned as an answer');
});

test('aria-disabled and a stop button change the read contract',()=>{
  const doc=buildArenaDoc({domOrder:['assistant','user'],reversed:true,ariaDisabled:true,stop:true});
  const r=runDriver('driverRead',doc,'https://arena.ai',{getComputedStyle:doc.computed});
  assert.equal(r.generating,true);
  assert.equal(r.idle,false,'aria-disabled on send counts as busy, exactly like disabled');
});

test('driverSubmit refuses an aria-disabled send button',()=>{
  const doc=buildArenaDoc({domOrder:['assistant','user'],reversed:true,ariaDisabled:true});
  const main=doc.querySelector('main');
  const ta={tagName:'TEXTAREA',className:'',children:[],attrs:{},value:'What is Orbit?',getAttribute(n){return this.attrs[n]??null;}};
  main.children.push(ta); // the composer: without it driverSubmit refuses with composer-changed
  const source=arena.match(/function driverSubmit\([\s\S]*?\n\}/)[0];
  const out=runInNewContext(`(${source})('What is Orbit?')`,{document:doc,location:{href:'https://arena.ai/c/abc',origin:'https://arena.ai'}});
  assert.equal(out.error,'send-disabled');
});

test('the echo of the prompt never settles as an answer',async()=>{
  const h=relayHarness({reads:[{text:'What is Orbit?',count:1,idle:true,generating:false,census:'list=ol roots=2 msgs=2 rev=1'}]});
  await assert.rejects(h.relay.arenaGenerateOnce({model:'max'},'',[{role:'user',content:'What is Orbit?'}]),/did not start/);
});

test('a timeout error carries the DOM census for diagnosis',async()=>{
  const reads=[{text:'a'.repeat(50),count:1,idle:true,generating:false,census:'list=ol roots=2 msgs=2'},{text:'b'.repeat(50),count:2,idle:true,generating:false,census:'list=ol roots=3 msgs=3'}];
  const h=relayHarness({reads,onDriver:name=>{if(name==='driverRead')reads.reverse();}});
  await assert.rejects(h.relay.arenaGenerateOnce({model:'max'},'',[{role:'user',content:'q'}]),/timed out.*\[list=ol/);
});
test('relayTarget prefers the embedded arena frame in a workspace tab',async()=>{
  const chrome={
    runtime:{getURL:()=>'chrome-extension://orbit/index.html'},
    storage:{session:{get:async()=>({arenaRelayTab:7}),set:async()=>{}}},
    tabs:{get:async()=>({id:7,url:'https://arena.ai/text/direct',status:'complete'}),query:async q=>q&&q.url?[{id:5,url:'chrome-extension://orbit/index.html'}]:[{id:8}],update:async()=>({}),create:async()=>({id:7})},
    webNavigation:{getAllFrames:async({tabId})=>tabId===5?[{frameId:0,url:'chrome-extension://orbit/index.html'},{frameId:2,url:'https://arena.ai/text/direct?model_a=max'}]:[]},
    scripting:{executeScript:async()=>[{result:{composer:true}}]}
  };
  const source=arena.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
  const relay=runInNewContext(source+'\n({relayTarget})',{chrome,URL,Date,setTimeout:fn=>{fn();}});
  const target=await relay.relayTarget();
  assert.deepEqual({kind:target.kind,tabId:target.tabId,frameId:target.frameId},{kind:'frame',tabId:5,frameId:2});
});
// (source extraction below mirrors the harness: strip imports and export keywords)

test('relayTarget falls back to the dedicated relay tab without a workspace',async()=>{
  const chrome={
    runtime:{getURL:()=>'chrome-extension://orbit/index.html'},
    storage:{session:{get:async()=>({arenaRelayTab:7}),set:async()=>{}}},
    tabs:{get:async()=>({id:7,url:'https://arena.ai/text/direct',status:'complete'}),query:async q=>q&&q.url?[]:[{id:8}],update:async()=>({}),create:async()=>({id:7})},
    webNavigation:{getAllFrames:async()=>[]},
    scripting:{executeScript:async()=>[{result:{composer:true}}]}
  };
  const source=arena.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
  const relay=runInNewContext(source+'\n({relayTarget})',{chrome,URL,Date,setTimeout:fn=>{fn();}});
  const target=await relay.relayTarget();
  assert.deepEqual({kind:target.kind,id:target.id},{kind:'tab',id:7});
});
