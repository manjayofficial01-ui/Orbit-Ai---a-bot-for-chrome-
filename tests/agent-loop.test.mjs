import test from 'node:test';
import assert from 'node:assert/strict';
import {runAgentLoop,execAction,listTabs} from '../dist/agent-run.js';

const CFG={base:'https://api.test/v1',model:'m',format:'chat',temperature:'',maxTokens:'',tokenField:'max_completion_tokens',effort:'',search:false};
const fence=o=>'```orbit-actions\n'+JSON.stringify(o)+'\n```';

// Drives runAgentLoop against a scripted Chrome, provider and approval gate so loop control flow is testable outside a browser.
function harness({tabs,pageUrls,act,cancelAt=-1,throwOnAct=false,replies=[],tabUrls=[],snapshotFailsAfter=Infinity,format='chat',denyOrigins=[],navSequence=[],capturePermissionError=false}){
  // Copy the fixtures: tabs.update mutates the tab record, and the module-level TAB_A/TAB_B must not leak between tests.
  tabs=tabs.map(t=>({...t}));
  const seen={confirms:[],act:[],snapshots:0,bodies:[],events:[],captures:[],updates:[],history:[],requested:[]};
  let replyIndex=0,snapshotIndex=0,tabGetIndex=0,navUrl=null,navCount=0;
  const originals={chrome:globalThis.chrome,location:globalThis.location,fetch:globalThis.fetch};
  const page=i=>{const url=pageUrls[Math.min(i,pageUrls.length-1)];return {title:'Page '+url,url,text:'body text',token:'tk-'+url,fields:[{id:'0',label:'Query',kind:'input',length:0,value:''}],interactives:[{ref:'e0',role:'button',name:'Go'}]};};
  globalThis.location={href:'chrome-extension://test/index.html'};
  globalThis.chrome={
    tabs:{
      async query(q){ if(q&&q.active) return tabs.filter(t=>t.active); return tabs.map(t=>({...t})); },
      async get(id){
        const t=tabs.find(x=>x.id===id); if(!t) throw Error('No tab with id: '+id);
        // Chrome updates the tab record on navigation, so the mock does the same per call; scripted navigations pin the URL.
        if(navUrl!==null) return {...t,url:navUrl};
        if(!tabUrls.length) return {...t};
        return {...t,url:tabUrls[Math.min(tabGetIndex++,tabUrls.length-1)]};
      },
      async update(id,props){
        const t=tabs.find(x=>x.id===id); if(!t) throw Error('No tab with id: '+id);
        if(props?.url){t.url=props.url;navUrl=props.url;seen.updates.push({id,url:props.url});}
        return {...t,url:navUrl!==null?navUrl:t.url};
      },
      async captureVisibleTab(windowId,opts){
        seen.captures.push({windowId,opts});
        // Models Chrome refusing captures without activeTab or all-sites access until the blanket grant is requested.
        if(capturePermissionError&&!seen.requested.includes('<all_urls>'))throw Error("Either the '<all_urls>' or 'activeTab' permission is required.");
        return 'data:image/jpeg;base64,TESTSHOT';
      }
    },
    scripting:{
      async executeScript({target,func,args}){
        if(func.name==='snapshotPage'){
          if(seen.snapshots>=snapshotFailsAfter) throw Error('Cannot access a chrome:// URL');
          seen.snapshots++; return [{result:page(seen.snapshots-1),documentId:'doc-'+target.tabId}];
        }
        if(func.name==='navHistoryStep'){
          seen.history.push(args[0]);
          if(navSequence.length)navUrl=navSequence[Math.min(navCount++,navSequence.length-1)];
          return [{result:{ok:true,dir:args[0]}}];
        }
        if(func.name==='agentAct'){
          seen.act.push({tabId:target.tabId,action:args[1]});
          if(throwOnAct) throw Error('Cannot access a chrome:// URL');
          if(act&&act(args[1])) return [{result:act(args[1])}];
          return [{result:{ok:true,tool:args[1].tool,detail:'mocked'}}];
        }
        throw Error('Unexpected injected function '+func.name);
      }
    },
    permissions:{async request({origins}){seen.requested.push(...origins);return !origins.some(o=>denyOrigins.includes(o));},async contains({origins}){return !origins.some(o=>denyOrigins.includes(o)||(denyOrigins.length&&o==='<all_urls>'));}}
  };
  globalThis.fetch=async(_url,options)=>{
    const body=JSON.parse(options.body);
    seen.bodies.push(body);
    const text=replies[replyIndex]!==undefined?replies[replyIndex++]:'plain text finish';
    return new Response(JSON.stringify({choices:[{message:{content:text}}]}),{headers:{'content-type':'application/json'}});
  };
  return {
    seen,
    // The gate is injected the way the panel uses the real dialog; window.confirm is never touched.
    run:(extra={})=>runAgentLoop({cfg:{...CFG,format},key:'k',goal:'do it',onEvent:e=>seen.events.push(e),signal:undefined,approve:async message=>{seen.confirms.push(message);return seen.confirms.length-1!==cancelAt;},...extra}),
    restore(){ for(const [k,v] of Object.entries(originals)){ if(v===undefined) delete globalThis[k]; else globalThis[k]=v; } }
  };
}

const TAB_A={id:7,url:'https://a.test/one',title:'A',active:true,lastAccessed:200,windowId:77};
const TAB_B={id:8,url:'https://b.test/two',title:'B',active:false,lastAccessed:100,windowId:77};

test('a malformed action block gets a free retry instead of consuming an agent step',async()=>{
  const h=harness({tabs:[TAB_A],pageUrls:['https://a.test/one'],replies:[
    fence({actions:[{tool:'teleport',ref:'e0'}]}),
    fence({actions:[{tool:'done',text:'finished'}]})
  ]});
  try{
    const res=await h.run();
    assert.equal(res.done,true);
    assert.equal(res.steps,1,'two model turns were used but only one real step');
    assert.equal(h.seen.confirms.length,0,'an invalid block must not reach the approval gate');
    assert.match(h.seen.bodies.at(-1).messages.at(-1).content,/action block was invalid/);
  } finally { h.restore(); }
});

test('free retries are bounded, then invalid blocks do consume steps',async()=>{
  const h=harness({tabs:[TAB_A],pageUrls:['https://a.test/one'],replies:[
    fence({actions:[{tool:'teleport',ref:'e0'}]}),
    fence({actions:[{tool:'teleport',ref:'e0'}]}),
    fence({actions:[{tool:'teleport',ref:'e0'}]}),
    fence({actions:[{tool:'done',text:'finished'}]})
  ]});
  try{
    const res=await h.run();
    assert.equal(res.done,true);
    assert.equal(res.steps,2,'the third invalid block burned a step');
  } finally { h.restore(); }
});

test('the approval prompt names the page the actions will actually run on',async()=>{
  const h=harness({tabs:[TAB_A],pageUrls:['https://a.test/one','https://b.test/two','https://b.test/two'],tabUrls:['https://a.test/one','https://b.test/two'],replies:[
    fence({actions:[{tool:'click',ref:'e0'}]}),
    fence({actions:[{tool:'click',ref:'e0'}]}),
    fence({actions:[{tool:'done',text:'finished'}]})
  ]});
  try{
    const res=await h.run();
    assert.equal(res.done,true);
    assert.equal(h.seen.confirms.length,2);
    assert.match(h.seen.confirms[0],/https:\/\/a\.test/, 'first approval names the original site');
    assert.ok(!h.seen.confirms[1].includes('a.test'),'after navigating, the stale origin must not be shown');
    assert.match(h.seen.confirms[1],/https:\/\/b\.test/,'second approval names the page the actions run on');
    assert.equal(res.url,'https://b.test/two');
  } finally { h.restore(); }
});

test('the approval origin still follows the tab when the re-snapshot fails',async()=>{
  // Chrome's tab record updates on navigation even when the injected snapshot cannot run, so it is the authority for the approval dialog.
  const h=harness({tabs:[TAB_A],pageUrls:['https://a.test/one'],tabUrls:['https://a.test/one','https://c.test/three'],snapshotFailsAfter:1,replies:[
    fence({actions:[{tool:'click',ref:'e0'}]}),
    fence({actions:[{tool:'click',ref:'e0'}]}),
    fence({actions:[{tool:'done',text:'finished'}]})
  ]});
  try{
    const res=await h.run();
    assert.equal(res.done,true,'a failed snapshot must not abort the run');
    assert.equal(h.seen.confirms.length,2);
    assert.match(h.seen.confirms[1],/https:\/\/c\.test/,'the approval dialog must name the navigated site, not the stale one');
    assert.ok(!h.seen.confirms[1].includes('a.test'),'the stale origin must be gone');
    assert.match(h.seen.bodies.at(-1).messages.at(-1).content,/Post-action snapshot failed/);
  } finally { h.restore(); }
});

test('a mid-batch tab switch defers the remaining actions instead of reusing stale refs',async()=>{
  const h=harness({tabs:[TAB_A,TAB_B],pageUrls:['https://a.test/one','https://b.test/two'],replies:[
    fence({actions:[{tool:'read-tab',ref:'tab1'},{tool:'click',ref:'e0'}]}),
    fence({actions:[{tool:'done',text:'finished'}]})
  ]});
  try{
    const res=await h.run();
    assert.equal(res.done,true);
    assert.deepEqual(h.seen.act.map(a=>a.tabId),[],'no page action may run against a ref from the previous tab');
    assert.match(h.seen.bodies.at(-1).messages.at(-1).content,/belong to the previous page/);
    assert.match(h.seen.confirms[0],/switch to open tab \[tab1\]/);
    assert.match(h.seen.confirms[0],/B — https:\/\/b\.test\/two/,'the approval dialog must resolve the tab ref');
  } finally { h.restore(); }
});

test('an injected-action failure is reported to the model rather than aborting the run',async()=>{
  const h=harness({tabs:[TAB_A],pageUrls:['https://a.test/one'],throwOnAct:true,replies:[
    fence({actions:[{tool:'click',ref:'e0'}]}),
    fence({actions:[{tool:'done',text:'finished'}]})
  ]});
  try{
    const res=await h.run();
    assert.equal(res.done,true,'the loop survives an executeScript rejection');
    assert.match(h.seen.bodies.at(-1).messages.at(-1).content,/FAILED[\s\S]*Cannot access a chrome/);
  } finally { h.restore(); }
});

test('cancelling at the approval gate stops execution without acting',async()=>{
  const h=harness({tabs:[TAB_A],pageUrls:['https://a.test/one'],cancelAt:0,replies:[
    fence({actions:[{tool:'click',ref:'e0'}]})
  ]});
  try{
    const res=await h.run();
    assert.equal(res.cancelled,true);
    assert.equal(h.seen.act.length,0);
  } finally { h.restore(); }
});

test('a declined tab switch is a safe failure and the run continues',async()=>{
  const h=harness({tabs:[TAB_A,TAB_B],pageUrls:['https://a.test/one'],replies:[
    fence({actions:[{tool:'read-tab',ref:'tab9'}]}),
    fence({actions:[{tool:'done',text:'finished'}]})
  ]});
  try{
    const res=await h.run();
    assert.equal(res.done,true);
    assert.match(h.seen.bodies.at(-1).messages.at(-1).content,/Unknown tab ref/);
    assert.equal(h.seen.act.length,0,'a failed switch runs no page actions');
  } finally { h.restore(); }
});

test('execAction bounds a missing page result as a failure',async()=>{
  const originals={chrome:globalThis.chrome};
  globalThis.chrome={scripting:{async executeScript(){return [];}}};
  try{
    const r=await execAction(1,'doc',{token:'t',url:'https://a.test/'},{tool:'click',ref:'e0'});
    assert.equal(r.ok,false);
    assert.match(r.error,/No result from page/);
  } finally { globalThis.chrome=originals.chrome; }
});

test('listTabs bounds the tab corpus and labels refs for the observation',()=>{
  const tabs=Array.from({length:20},(_,i)=>({id:i+1,url:`https://s${i}.test/`,title:'T'+i}));
  const out=listTabs(tabs);
  assert.equal(out.length,15);
  assert.equal(out[0].ref,'tab0');
  assert.match(out[1].title,/T1/);
});

test('a screenshot action is gated, captured, and attached to the next observation',async()=>{
  const h=harness({tabs:[TAB_A],pageUrls:['https://a.test/one'],replies:[
    fence({actions:[{tool:'screenshot'}]}),
    fence({actions:[{tool:'done',text:'I saw the image'}]})
  ]});
  try{
    const res=await h.run();
    assert.equal(res.done,true);
    assert.equal(h.seen.captures.length,1);
    assert.equal(h.seen.captures[0].windowId,77,'capture must target the active tab\'s window');
    assert.equal(h.seen.captures[0].opts.quality,82);
    assert.match(h.seen.confirms[0],/screenshot/,'a capture passes through the same approval gate as every action');
    const last=h.seen.bodies.at(-1).messages.at(-1).content;
    assert.ok(Array.isArray(last),'the observation after a capture must carry image parts');
    assert.ok(last.some(p=>p.type==='text'&&/screenshot captured this step/.test(p.text)));
    assert.deepEqual(last.filter(p=>p.type==='image_url').map(p=>p.image_url.url),['data:image/jpeg;base64,TESTSHOT']);
    assert.equal(last.filter(p=>p.type==='image_url').length,1);
  } finally { h.restore(); }
});

test('no capture is taken when the target tab is not the visible tab of its window',async()=>{
  const h=harness({tabs:[TAB_A,TAB_B],pageUrls:['https://a.test/one','https://b.test/two'],replies:[
    fence({actions:[{tool:'read-tab',ref:'tab1'}]}),
    fence({actions:[{tool:'screenshot'}]}),
    fence({actions:[{tool:'done',text:'ok'}]})
  ]});
  try{
    const res=await h.run();
    assert.equal(res.done,true);
    assert.equal(h.seen.captures.length,0,'a background tab must not be captured as if it were visible');
    assert.match(h.seen.bodies.at(-1).messages.at(-1).content,/not the visible tab/);
  } finally { h.restore(); }
});

test('earlier step screenshots are pruned so the request stays within budget',async()=>{
  const h=harness({tabs:[TAB_A],pageUrls:['https://a.test/one'],replies:[
    fence({actions:[{tool:'screenshot'}]}),
    fence({actions:[{tool:'screenshot'}]}),
    fence({actions:[{tool:'done',text:'ok'}]})
  ]});
  try{
    const res=await h.run();
    assert.equal(res.done,true);
    assert.equal(h.seen.captures.length,2);
    const messages=h.seen.bodies.at(-1).messages;
    const images=messages.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(p=>p.type==='image_url');
    assert.equal(images.length,1,'only the latest capture rides along');
    assert.ok(messages.some(m=>typeof m.content==='string'&&m.content.includes('no longer attached')),'the older image observation must degrade to a text note, not vanish');
  } finally { h.restore(); }
});

test('a capture taken before a tab switch is discarded instead of misattributed to the new page',async()=>{
  const h=harness({tabs:[TAB_A,TAB_B],pageUrls:['https://a.test/one','https://b.test/two'],replies:[
    fence({actions:[{tool:'screenshot'},{tool:'read-tab',ref:'tab1'}]}),
    fence({actions:[{tool:'done',text:'ok'}]})
  ]});
  try{
    const res=await h.run();
    assert.equal(res.done,true);
    assert.equal(h.seen.captures.length,1,'the pre-switch capture did happen');
    const messages=h.seen.bodies.at(-1).messages;
    const images=messages.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(p=>p.type==='image_url'||p.type==='input_image');
    assert.equal(images.length,0,'the old page\'s pixels must not ride on the new page\'s observation');
    assert.ok(messages.some(m=>typeof m.content==='string'&&m.content.includes('discarded')),'the model must be told the capture was dropped');
  } finally { h.restore(); }
});

test('a dropped capture is reported when the post-action re-snapshot fails',async()=>{
  const h=harness({tabs:[TAB_A],pageUrls:['https://a.test/one'],snapshotFailsAfter:2,replies:[
    fence({actions:[{tool:'click',ref:'e0'}]}),
    fence({actions:[{tool:'screenshot'}]}),
    fence({actions:[{tool:'done',text:'ok'}]})
  ]});
  try{
    const res=await h.run();
    assert.equal(res.done,true);
    const last=h.seen.bodies.at(-1).messages;
    const dropped=last.some(m=>typeof m.content==='string'&&m.content.includes('also dropped'));
    assert.ok(dropped||h.seen.bodies.some(b=>b.messages.some(m=>typeof m.content==='string'&&m.content.includes('also dropped'))),
      'the failure message must mention the dropped capture');
  } finally { h.restore(); }
});

test('the responses format attaches the capture as input_image parts',async()=>{
  const h=harness({tabs:[TAB_A],pageUrls:['https://a.test/one'],format:'responses',replies:[
    fence({actions:[{tool:'screenshot'}]}),
    fence({actions:[{tool:'done',text:'ok'}]})
  ]});
  try{
    const res=await h.run();
    assert.equal(res.done,true);
    assert.ok(h.seen.bodies.at(-1).input,'responses-format requests carry the history under input');
    const last=h.seen.bodies.at(-1).input.at(-1).content;
    assert.ok(Array.isArray(last));
    assert.ok(last.some(p=>p.type==='input_text'&&/screenshot captured this step/.test(p.text)));
    assert.deepEqual(last.filter(p=>p.type==='input_image').map(p=>p.image_url),['data:image/jpeg;base64,TESTSHOT']);
  } finally { h.restore(); }
});

test('goto navigates with the destination in the approval and ends the step',async()=>{
  const h=harness({tabs:[TAB_A],pageUrls:['https://a.test/one','https://b.test/landing'],replies:[
    fence({actions:[{tool:'goto',text:'https://b.test/landing'},{tool:'click',ref:'e0'}]}),
    fence({actions:[{tool:'done',text:'ok'}]})
  ]});
  try{
    const res=await h.run();
    assert.equal(res.done,true);
    assert.equal(h.seen.updates.length,1,'exactly one navigation');
    assert.equal(h.seen.updates[0].url,'https://b.test/landing');
    assert.equal(h.seen.act.length,0,'actions batched after a navigation must be deferred, not run against stale refs');
    assert.match(h.seen.confirms[0],/go to https:\/\/b\.test\/landing/,'the approval dialog must show the destination URL');
    const last=h.seen.bodies.at(-1).messages.at(-1).content;
    assert.match(last,/b\.test/,'the next observation must be the destination page');
    assert.match(last,/belong to the previous page/,'the model must be told the batched action was deferred');
    assert.equal(res.url,'https://b.test/landing');
  } finally { h.restore(); }
});

test('nav-history goes back, grants nothing extra, and reads the previous page',async()=>{
  const h=harness({tabs:[TAB_A],pageUrls:['https://a.test/one','https://b.test/back'],navSequence:['https://b.test/back'],replies:[
    fence({actions:[{tool:'nav-history',text:'back'}]}),
    fence({actions:[{tool:'done',text:'ok'}]})
  ]});
  try{
    const res=await h.run();
    assert.equal(res.done,true);
    assert.deepEqual(h.seen.history,['back']);
    assert.equal(h.seen.updates.length,0,'history navigation must not open new URLs');
    assert.equal(h.seen.act.length,0);
    assert.match(h.seen.bodies.at(-1).messages.at(-1).content,/b\.test\/back/);
    assert.equal(res.url,'https://b.test/back');
  } finally { h.restore(); }
});

test('a denied destination grant blocks goto before any navigation',async()=>{
  const h=harness({tabs:[TAB_A],pageUrls:['https://a.test/one'],denyOrigins:['https://b.test/*'],replies:[
    fence({actions:[{tool:'goto',text:'https://b.test/landing'}]}),
    fence({actions:[{tool:'done',text:'ok'}]})
  ]});
  try{
    const res=await h.run();
    assert.equal(res.done,true);
    assert.equal(h.seen.updates.length,0,'no navigation may happen without the destination grant');
    assert.match(h.seen.bodies.at(-1).messages.at(-1).content,/was not granted; nothing was opened/);
    assert.equal(res.url,'https://a.test/one','the target tab is unchanged');
  } finally { h.restore(); }
});

test('goto never accepts the previous document as the destination',async()=>{
  // Models the F2 race: tabs.update resolves at navigation start, so the first readable snapshot is still the old page.
  const h=harness({tabs:[TAB_A],pageUrls:['https://a.test/one','https://a.test/one','https://b.test/landing'],replies:[
    fence({actions:[{tool:'goto',text:'https://b.test/landing'}]}),
    fence({actions:[{tool:'done',text:'ok'}]})
  ]});
  try{
    const res=await h.run();
    assert.equal(res.done,true);
    assert.equal(h.seen.snapshots,3,'the stale first post-navigation snapshot must be rejected and retried');
    const last=h.seen.bodies.at(-1).messages.at(-1).content;
    assert.match(last,/b\.test/,'the observation must describe the destination');
    assert.equal(res.url,'https://b.test/landing');
  } finally { h.restore(); }
});

test('a denied nav-history origin reaches the model even when the re-snapshot fails',async()=>{
  const h=harness({tabs:[TAB_A],pageUrls:['https://a.test/one'],snapshotFailsAfter:1,denyOrigins:['https://b.test/*'],navSequence:['https://b.test/back'],replies:[
    fence({actions:[{tool:'nav-history',text:'back'}]}),
    fence({actions:[{tool:'done',text:'ok'}]})
  ]});
  try{
    const res=await h.run();
    assert.equal(res.done,true);
    const last=h.seen.bodies.at(-1).messages.at(-1).content;
    assert.match(last,/Post-action snapshot failed/);
    assert.match(last,/Site access for b\.test was not granted; the page opened but was not read/,'the step result must not be swallowed by the snapshot failure (review B1)');
  } finally { h.restore(); }
});

test('a capture refused without all-sites access asks once, then retries',async()=>{
  const h=harness({tabs:[TAB_A],pageUrls:['https://a.test/one'],capturePermissionError:true,replies:[
    fence({actions:[{tool:'screenshot'}]}),
    fence({actions:[{tool:'done',text:'ok'}]})
  ]});
  try{
    const res=await h.run();
    assert.equal(res.done,true);
    assert.equal(h.seen.requested.filter(o=>o==='<all_urls>').length,1,'the blanket grant must be requested exactly once');
    assert.equal(h.seen.captures.length,2,'exactly one capture attempt and one retry');
    const last=h.seen.bodies.at(-1).messages.at(-1).content;
    assert.ok(Array.isArray(last)&&last.some(p=>p.type==='image_url'),'the retried capture must still attach to the observation');
  } finally { h.restore(); }
});

test('declining all-sites access reports the honest path and does not retry',async()=>{
  const h=harness({tabs:[TAB_A],pageUrls:['https://a.test/one'],capturePermissionError:true,denyOrigins:['<all_urls>'],replies:[
    fence({actions:[{tool:'screenshot'}]}),
    fence({actions:[{tool:'done',text:'ok'}]})
  ]});
  try{
    const res=await h.run();
    assert.equal(res.done,true);
    assert.equal(h.seen.captures.length,1,'no retry without the grant');
    assert.match(h.seen.bodies.at(-1).messages.at(-1).content,/one-time all-sites access/);
  } finally { h.restore(); }
});

test('hands-free reading (opt-in) runs read-only steps without the gate',async()=>{
  const h=harness({tabs:[TAB_A],pageUrls:['https://a.test/one'],replies:[fence({actions:[{tool:'scroll',text:'-300'},{tool:'extract'}]})]});
  const res=await h.run({autoSafe:true});
  assert.equal(h.seen.confirms.length,0,'a read-only step must not stop to ask');
  assert.ok(h.seen.events.some(e=>e.type==='auto-approved'),'the transcript must say the step ran hands-free');
  assert.ok(h.seen.act.some(a=>a.action.tool==='scroll'),'the scroll still executed');
  assert.equal(res.done,true);
});
test('hands-free reading never skips the gate for a state-changing action',async()=>{
  const h=harness({tabs:[TAB_A],pageUrls:['https://a.test/one'],replies:[fence({actions:[{tool:'scroll',text:'-300'},{tool:'click',ref:'e0'}]})]});
  await h.run({autoSafe:true});
  assert.equal(h.seen.confirms.length,1,'a click must always ask, hands-free or not');
});
test('without the opt-in, read-only steps still ask',async()=>{
  const h=harness({tabs:[TAB_A],pageUrls:['https://a.test/one'],replies:[fence({actions:[{tool:'scroll',text:'-300'},{tool:'extract'}]})]});
  await h.run({});
  assert.equal(h.seen.confirms.length,1,'hands-free is opt-in: the default gate asks for every step');
});

test('autopilot (opt-in) runs a mutating step without the gate',async()=>{
  const h=harness({tabs:[TAB_A],pageUrls:['https://a.test/one'],replies:[fence({actions:[{tool:'click',ref:'e0'},{tool:'scroll',text:'-300'}]})]});
  await h.run({autopilot:true});
  assert.equal(h.seen.confirms.length,0,'autopilot clicks without asking');
  assert.ok(h.seen.events.some(e=>e.type==='auto-approved'&&/Autopilot/.test(e.text)));
  assert.ok(h.seen.act.some(a=>a.action.tool==='click'));
});
test('autopilot still asks before a form-submitting Enter',async()=>{
  const h=harness({tabs:[TAB_A],pageUrls:['https://a.test/one'],replies:[fence({actions:[{tool:'click',ref:'e0'},{tool:'press',ref:'e0',text:'Enter'}]})]});
  await h.run({autopilot:true});
  assert.equal(h.seen.confirms.length,1,'Enter is the one action autopilot never takes silently');
});
