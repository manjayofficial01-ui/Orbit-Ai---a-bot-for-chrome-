import test from 'node:test';
import assert from 'node:assert/strict';
import {AGENT_MAX_STEPS,AGENT_TOOLS,parseAgentActions,validateAgentAction,stripAgentFence,describeActions,buildAgentObservation,buildAgentSystemPrompt,extractFencedJson} from '../dist/agent.js';
import {requestAgentBody,generateOnce} from '../dist/core.js';

test('parses orbit-actions fence',()=>{ const r=parseAgentActions('hi\n```orbit-actions\n{"actions":[{"tool":"click","ref":"e1"}]}\n```'); assert.equal(r.actions[0].tool,'click'); });
test('rejects too many actions',()=>{ const r=parseAgentActions('```orbit-actions\n{"actions":[{"tool":"click","ref":"e1"},{"tool":"click","ref":"e2"},{"tool":"click","ref":"e3"},{"tool":"click","ref":"e4"}]}\n```'); assert.match(r.error,/at most 3/); });
test('rejects unknown tool',()=>{ assert.match(validateAgentAction({tool:'delete',ref:'e1'}),/Unknown tool/); });
test('requires ref',()=>{ assert.match(validateAgentAction({tool:'click'}),/needs a "ref"/); });
test('fill needs text',()=>{ assert.match(validateAgentAction({tool:'fill',ref:'0'}),/needs a "text"/); });
test('done single',()=>{ const r=parseAgentActions('```orbit-actions\n{"tool":"done","text":"all set"}\n```'); assert.equal(r.done,true); });
test('plain text means done',()=>{ const r=parseAgentActions('Just a summary, no fence.'); assert.equal(r.done,true); assert.equal(r.actions,null); });
test('ignores normal code fence',()=>{ const r=parseAgentActions('here is code:\n```js\nconsole.log(1)\n```'); assert.equal(r.actions,null); });
test('strip fence',()=>{ assert.equal(stripAgentFence('answer\n```orbit-actions\n{}\n```\ntail').includes('orbit-actions'),false); });
test('describe truncates',()=>{ assert.match(describeActions([{tool:'fill',ref:'0',text:'x'.repeat(500)}]),/500 chars/); });
test('observation wraps untrusted',()=>{ const o=buildAgentObservation({title:'T',url:'https://a.test/',text:'hello',fields:[{id:'0',label:'Name',kind:'input',length:0}],interactives:[{ref:'e0',role:'button',name:'Go'}]},[{tool:'click',ref:'e0',ok:true}]); assert.match(o,/<untrusted_page>/); assert.match(o,/Editable fields/); });
test('caps at 8 steps',()=>assert.equal(AGENT_MAX_STEPS,8));
test('v2.3 agentic tools validate correctly',()=>{
  assert.ok(AGENT_TOOLS.includes('extract')&&AGENT_TOOLS.includes('hover')&&AGENT_TOOLS.includes('press')&&AGENT_TOOLS.includes('wait'));
  assert.equal(validateAgentAction({tool:'extract'}),null);
  assert.equal(validateAgentAction({tool:'wait'}),null);
  assert.equal(validateAgentAction({tool:'wait',text:'500'}),null);
  assert.match(validateAgentAction({tool:'wait',text:'50'}),/100 to 800/);
  assert.match(validateAgentAction({tool:'wait',text:'900'}),/100 to 800/);
  assert.match(validateAgentAction({tool:'wait',ref:'e1'}),/no ref/);
});
test('press keys: safe keys always; Enter allowed but flagged in the approval description',()=>{
  assert.equal(validateAgentAction({tool:'press',ref:'e1',text:'Tab'}),null);
  assert.equal(validateAgentAction({tool:'press',ref:'e1',text:'ArrowDown'}),null);
  assert.equal(validateAgentAction({tool:'press',ref:'e1',text:'Enter'}),null);
  assert.match(validateAgentAction({tool:'press',ref:'e1',text:'a'}),/press text must be one of/);
  assert.match(validateAgentAction({tool:'press',ref:'e1'}),/press text must be one of/);
  assert.match(validateAgentAction({tool:'press',text:'Tab'}),/needs a "ref"/);
  assert.match(describeActions([{tool:'press',ref:'e1',text:'Enter'}]),/can submit the focused form/,'the approval description must warn about Enter');
  assert.doesNotMatch(describeActions([{tool:'press',ref:'e1',text:'Tab'}]),/can submit/);
});
test('goto and nav-history validate destinations and document the operator loop',()=>{
  assert.ok(AGENT_TOOLS.includes('goto')&&AGENT_TOOLS.includes('nav-history'));
  assert.equal(validateAgentAction({tool:'goto',text:'https://b.test/landing'}),null);
  assert.equal(validateAgentAction({tool:'goto',text:'http://localhost:3000/x'}),null);
  assert.match(validateAgentAction({tool:'goto'}),/needs a "text" URL/);
  assert.match(validateAgentAction({tool:'goto',text:'notaurl'}),/valid URL/);
  assert.match(validateAgentAction({tool:'goto',text:'chrome://settings'}),/plain http\(s\) URLs/);
  assert.match(validateAgentAction({tool:'goto',text:'https://user:pw@b.test/'}),/plain http\(s\) URLs/);
  assert.match(validateAgentAction({tool:'goto',text:'https://b.test/',ref:'e1'}),/takes no ref/);
  assert.equal(validateAgentAction({tool:'nav-history',text:'back'}),null);
  assert.equal(validateAgentAction({tool:'nav-history',text:'forward'}),null);
  assert.match(validateAgentAction({tool:'nav-history',text:'up'}),/"back" or "forward"/);
  assert.match(validateAgentAction({tool:'nav-history',ref:'e1'}),/takes no ref/);
  assert.match(describeActions([{tool:'goto',text:'https://b.test/landing'}]),/go to https:\/\/b\.test\/landing/);
  assert.match(describeActions([{tool:'nav-history',text:'back'}]),/navigate back in history/);
  assert.match(buildAgentSystemPrompt(),/- goto:/);
  assert.match(buildAgentSystemPrompt(),/- nav-history:/);
  assert.match(buildAgentSystemPrompt(),/Enter can submit the focused form/);
});
test('hover needs a ref; scroll accepts page-level amounts or a ref',()=>{
  assert.equal(validateAgentAction({tool:'hover',ref:'e1'}),null);
  assert.match(validateAgentAction({tool:'hover'}),/needs a "ref"/);
  assert.equal(validateAgentAction({tool:'scroll',text:'top'}),null);
  assert.equal(validateAgentAction({tool:'scroll',text:'-400'}),null);
  assert.equal(validateAgentAction({tool:'scroll',ref:'e1'}),null);
  assert.match(validateAgentAction({tool:'scroll',text:'1300'}),/±1200/);
  assert.match(validateAgentAction({tool:'scroll',text:'lots'}),/±1200/);
  assert.match(validateAgentAction({tool:'scroll',ref:'e1',text:'top'}),/takes no text/);
});
test('observation surfaces field values, dropdown options and link hrefs',()=>{
  const o=buildAgentObservation({title:'T',url:'https://a.test/',text:'x',fields:[{id:'0',label:'Country',kind:'select',length:'0',options:[{label:'Nepal',value:'np'},{label:'India',value:'in'}]},{id:'1',label:'Query',kind:'input',length:'4',value:'test'}],interactives:[{ref:'e0',role:'a',name:'Docs',href:'https://a.test/docs'}]},[]);
  assert.match(o,/options: \[Nepal \| India\]/);
  assert.match(o,/holds "test"/);
  assert.match(o,/e0\] a: Docs -> https:\/\/a\.test\/docs/);
});
test('describe covers the new tools',()=>{
  assert.match(describeActions([{tool:'extract'}]),/structured outline/);
  assert.match(describeActions([{tool:'wait',text:'400'}]),/wait 400 ms/);
  assert.match(describeActions([{tool:'press',ref:'e1',text:'Tab'}]),/press Tab/);
  assert.match(describeActions([{tool:'hover',ref:'e1'}]),/hover/);
  assert.match(describeActions([{tool:'scroll',text:'top'}]),/scroll top/);
});
test('read-tab validated against tab refs from the observation',()=>{
  assert.equal(validateAgentAction({tool:'read-tab',ref:'tab2'}),null);
  assert.match(validateAgentAction({tool:'read-tab',ref:'e2'}),/Open tabs/);
  assert.match(validateAgentAction({tool:'read-tab'}),/Open tabs/);
  assert.match(validateAgentAction({tool:'read-tab',ref:'tab2',text:'x'}),/takes no text/);
  assert.match(describeActions([{tool:'read-tab',ref:'tab1'}]),/switch to open tab/);
});
test('screenshot validates as a ref-less capture tool',()=>{
  assert.ok(AGENT_TOOLS.includes('screenshot'));
  assert.equal(validateAgentAction({tool:'screenshot'}),null);
  assert.match(validateAgentAction({tool:'screenshot',ref:'e1'}),/takes no ref/);
  assert.match(validateAgentAction({tool:'screenshot',text:'x'}),/takes no text/);
  assert.match(describeActions([{tool:'screenshot'}]),/capture the visible page/);
  assert.match(buildAgentSystemPrompt(),/- screenshot:/);
  assert.match(buildAgentSystemPrompt(),/vision-capable/);
});
test('observation lists open tabs inside the untrusted wrapper',()=>{
  const o=buildAgentObservation({title:'T',url:'https://a.test/',text:'x'},[],[{ref:'tab0',id:1,title:'Search results',url:'https://s.test/?q=1'},{ref:'tab1',id:2,title:'Docs',url:'https://d.test/guide'}]);
  assert.match(o,/Open tabs:/);
  assert.match(o,/tab0\] Search results — https:\/\/s\.test\/\?q=1/);
  assert.ok(o.indexOf('Open tabs:')<o.indexOf('</untrusted_page>'));
});
test('nonstream body',()=>{ const b=requestAgentBody({base:'https://api.openai.com/v1',model:'m',format:'chat',temperature:'',maxTokens:'',effort:'',search:false},[{role:'user',content:'hi'}]); assert.equal(b.stream,false); });
test('agent body disables search',()=>{ const b=requestAgentBody({base:'https://api.openai.com/v1',model:'m',format:'responses',temperature:'',maxTokens:'',effort:'',search:true},[{role:'user',content:'hi'}]); assert.equal(b.tools,undefined); });
test('generateOnce posts nonstream',async()=>{ const old=globalThis.fetch; let seen; globalThis.fetch=async(u,o)=>{ seen={u,o}; return new Response(JSON.stringify({choices:[{message:{content:'ok'}}]}),{headers:{'content-type':'application/json'}}); }; try{ const r=await generateOnce({base:'https://api.openai.com/v1',model:'m',format:'chat',temperature:'',maxTokens:'',effort:'',search:false},'',[{role:'user',content:'hi'}],{}); assert.equal(r.text,'ok'); assert.match(seen.o.body,/"stream":false/); }finally{ globalThis.fetch=old; } });
