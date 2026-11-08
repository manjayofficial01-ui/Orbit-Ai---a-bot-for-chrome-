// verify-arena.mjs — dev-only live check of the Arena tab relay in real Chrome.
//   node scripts/verify-arena.mjs [--headful] [--keep]
// Loads the built extension, drives Settings → Arena, lists models from the live picker,
// and sends one probe. Anonymous Chrome hits arena.ai's login wall, so the happy path stops
// there by design; this verifies the relay mechanics and the sign-in guidance end to end.
// Uses a throwaway profile and a fixture manifest with the arena host pre-granted (headless
// cannot click permission prompts). The shipped manifest's optional-permission model is untouched.
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,existsSync,readFileSync,writeFileSync,cpSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const HEADFUL=process.argv.includes('--headful');
const OUT=join(tmpdir(),'arena-verify');
if(existsSync(OUT)&&!process.argv.includes('--keep'))rmSync(OUT,{recursive:true,force:true});
mkdirSync(OUT,{recursive:true});
const FIXTURE=join(OUT,'ext');cpSync(join(root,'dist'),FIXTURE,{recursive:true});
const mf=JSON.parse(readFileSync(join(FIXTURE,'manifest.json'),'utf8'));
mf.host_permissions=['https://arena.ai/*'];
writeFileSync(join(FIXTURE,'manifest.json'),JSON.stringify(mf,null,2));
const CHROME=[process.env.CHROME_PATH,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean).find(p=>existsSync(p));
if(!CHROME){console.error('Chrome not found');process.exit(2);}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const PORT=9342;
const child=spawn(CHROME,[...(HEADFUL?[]:['--headless=new']),`--user-data-dir=${join(OUT,'profile')}`,`--remote-debugging-port=${PORT}`,'--no-first-run','--no-default-browser-check','--window-size=1280,900','about:blank'],{stdio:['ignore','pipe','pipe']});
const kill=()=>{try{if(process.platform==='win32')execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'});else child.kill('SIGKILL');}catch{}};
process.on('exit',kill);
let version=null;for(let i=0;i<50;i++){try{version=await(await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();break;}catch{await sleep(400);}}
if(!version){console.error('no CDP');process.exit(2);}
const ws=new WebSocket(version.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r));
let seq=0;const pending=new Map();const errors=[];
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails?.exception?.description||'exc');});
const send=(method,params={},sessionId)=>new Promise(res=>{const id=++seq;pending.set(id,res);ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
const attach=async t=>(await send('Target.attachToTarget',{targetId:t,flatten:true})).result.sessionId;
const ev=async(sid,fn)=>{const r=await send('Runtime.evaluate',{expression:`(async()=>{${fn}})()`,awaitPromise:true,returnByValue:true},sid);if(r.error)return{__error:r.error.message};if(r.result?.exceptionDetails)return{__exception:r.result.exceptionDetails.text};return r.result?.result?.value;};
const results=[];const record=(n,ok,d)=>{results.push({n,ok});console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};
const clickTrusted=async(sid,sel)=>{const r=await ev(sid,`const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView({block:'center'});const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};`);if(!r)return false;await send('Input.dispatchMouseEvent',{type:'mousePressed',x:r.x,y:r.y,button:'left',clickCount:1},sid);await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x,y:r.y,button:'left',clickCount:1},sid);return true;};

const extId=(await send('Extensions.loadUnpacked',{path:FIXTURE})).result?.id;
if(!extId){console.error('loadUnpacked failed');process.exit(2);}
const uiT=(await send('Target.createTarget',{url:`chrome-extension://${extId}/index.html`})).result.targetId;
const ui=await attach(uiT);await send('Runtime.enable',{},ui);await send('Page.enable',{},ui);
await send('Emulation.setDeviceMetricsOverride',{width:420,height:900,deviceScaleFactor:1,mobile:false},ui);
await sleep(1500);
record('extension boots',!!(await ev(ui,`return !!document.getElementById('prompt');`)));

// The Arena dock: visible by default, no iframe anywhere, and it mirrors the relay.
const dock=await ev(ui,`return {visible:!document.getElementById('arenaDock').hidden,status:document.getElementById('arenaDockStatus').textContent,bodyHidden:document.getElementById('arenaDockBody').hidden,iframe:!!document.querySelector('iframe'),messagesRow:getComputedStyle(document.getElementById('messages')).gridRowStart};`);
record('the Arena dock renders (own grid row, never an embed)',dock?.visible===true&&typeof dock.status==='string'&&dock.iframe===false&&dock.messagesRow==='4',JSON.stringify(dock));
record('the dock offers Pull into Orbit',!!(await ev(ui,`return !!document.getElementById('arenaDockPull');`)));

// Open settings, switch to Arena, check the keyless UI.
await ev(ui,`document.getElementById('settings').click();const p=document.getElementById('provider');p.value='arena';p.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,300));return true;`);
const uiState=await ev(ui,`return {base:document.getElementById('base').value,baseRO:document.getElementById('base').readOnly,keyDisabled:document.getElementById('key').disabled,noteVisible:!document.getElementById('arenaNote').hidden,noteText:document.getElementById('arenaNote').textContent.slice(0,60),connectRow:!document.getElementById('arenaConnectRow').hidden,connectBtn:!!document.getElementById('arenaConnect')};`);
record('Arena UI is keyless (base fixed, key disabled, note shown, Connect Arena present)',uiState?.base==='https://arena.ai'&&uiState.baseRO&&uiState.keyDisabled&&uiState.noteVisible&&uiState.connectRow&&uiState.connectBtn,JSON.stringify(uiState));
const settings=await ev(ui,`const ids=['format','temperature','maxTokens','tokenField','effort','search','xsearch','code'];const arenaDisabled=ids.every(id=>document.getElementById(id).disabled);const p=document.getElementById('provider');p.value='google';p.dispatchEvent(new Event('change',{bubbles:true}));const apiRestored=ids.every(id=>!document.getElementById(id).disabled)&&!document.getElementById('key').disabled&&!document.getElementById('base').readOnly&&document.getElementById('arenaNote').hidden;p.value='arena';p.dispatchEvent(new Event('change',{bubbles:true}));return {arenaDisabled,apiRestored};`);
record('unsupported Arena settings are disabled and API profiles restore them',settings?.arenaDisabled&&settings.apiRestored,JSON.stringify(settings));
const shot1=(await send('Page.captureScreenshot',{format:'png'},ui)).result?.data;
if(shot1)writeFileSync(join(OUT,'arena-settings.png'),Buffer.from(shot1,'base64'));

// Fetch models from the live picker (trusted click so the permission grant has a user gesture).
await clickTrusted(ui,'#models');
let models=null;
for(let i=0;i<40;i++){await sleep(1000);models=await ev(ui,`const s=document.getElementById('modelSelect');return {count:s.options.length-1,first:[...s.options].slice(1,6).map(o=>o.value),status:document.getElementById('settingsStatus').textContent};`);if(models?.count>0||/Could not read/.test(models?.status||''))break;}
record('lists models from the live Arena picker',models?.count>0,JSON.stringify(models));

// Send one probe; anonymous Chrome must surface the sign-in guidance, not a crash.
if(models?.count>0){
  await ev(ui,`document.getElementById('model').value=${JSON.stringify(models.first[0])};return true;`);
  await clickTrusted(ui,'#testModel');
  let probe=null;
  for(let i=0;i<75;i++){await sleep(1000);probe=await ev(ui,`return document.getElementById('settingsStatus').textContent;`);if(/Review Arena’s Terms|wants a sign-in|working through Arena|did not start|timed out|composer/i.test(probe||''))break;}
  record('probe resolves with manual consent/sign-in guidance or success',/Review Arena’s Terms|wants a sign-in|working through Arena/.test(probe||''),String(probe).slice(0,160));
  const tabs=await ev(ui,`const ts=await chrome.tabs.query({});return ts.filter(t=>String(t.url||'').startsWith('https://arena.ai')).map(t=>({id:t.id,url:t.url,active:t.active}));`);
  record('a dedicated arena.ai relay tab was opened',Array.isArray(tabs)&&tabs.length>=1,JSON.stringify(tabs));
  if(/Review Arena’s Terms/.test(probe||'')){
    const consent=await ev(ui,`const [r]=await chrome.scripting.executeScript({target:{tabId:${tabs[0].id}},world:'MAIN',func:()=>{const dialogs=[...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')];return dialogs.some(d=>/Terms of Use.*Privacy Policy/.test(d.textContent||'')&&[...d.querySelectorAll('button')].some(b=>(b.textContent||'').trim()==='Agree'));}});return r.result;`);
    record('Terms dialog remains untouched for manual review',consent===true);
  }
  const shot2=(await send('Page.captureScreenshot',{format:'png'},ui)).result?.data;
  if(shot2)writeFileSync(join(OUT,'arena-probe.png'),Buffer.from(shot2,'base64'));
}
// The Connect flow: with the host pre-granted, pressing Connect Arena must foreground the
// relay tab and wait for the person — it never clicks Google. Anonymous Chrome stays behind
// the wall, so the honest outcome here is "Waiting for you to sign in" (it times out later,
// after this script has moved on).
await clickTrusted(ui,'#arenaConnect');
let connectStatus=null;
for(let i=0;i<12;i++){await sleep(1000);connectStatus=await ev(ui,`return document.getElementById('settingsStatus').textContent;`);if(/Waiting for you to sign in|signed in|did not complete|timed out/i.test(connectStatus||''))break;}
record('Connect Arena waits for the person instead of clicking',/Waiting for you to sign in/.test(connectStatus||''),String(connectStatus).slice(0,120));
const dockStatus=await ev(ui,`return document.getElementById('arenaDockStatus').textContent;`);
record('the dock mirrors the sign-in wait',/Waiting for you to sign in/.test(dockStatus||''),String(dockStatus));

// The embedded Arena: the framing-header override must be active, and the frame the
// dock mounts must render and be drivable from the workspace tab.
const rulesets=await ev(ui,`return JSON.stringify(await chrome.declarativeNetRequest.getEnabledRulesets());`);
record('the framing-header override ruleset is enabled',(rulesets||'').includes('arena-unframe'),String(rulesets));
await ev(ui,`if(document.getElementById('arenaDockBody').hidden)document.getElementById('arenaDockHead').click();return true;`);
await clickTrusted(ui,'#arenaDockEmbed');
await sleep(8000);
const frameProbe=await ev(ui,`try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});const frames=await chrome.webNavigation.getAllFrames({tabId:tab.id});const f=frames.find(x=>(x.url||'').startsWith('https://arena.ai'));if(!f)return {frame:false,frames:frames.map(x=>x.url.slice(0,40))};const res=await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[f.frameId]},func:()=>({origin:location.origin,composer:!!document.querySelector('textarea')})});return {frame:true,...res[0].result};}catch(e){return {error:String(e&&e.message||e).slice(0,120)}}`);
record('the embedded Arena frame renders and is drivable',frameProbe?.frame===true&&frameProbe?.origin==='https://arena.ai'&&frameProbe?.composer===true,JSON.stringify(frameProbe));
const forward=(await ev(ui,`const ts=await chrome.tabs.query({});return ts.filter(t=>String(t.url||'').startsWith('https://arena.ai')).map(t=>({active:t.active}));`));
record('the relay tab was foregrounded for sign-in',Array.isArray(forward)&&forward.some(t=>t.active),JSON.stringify(forward));

// The research surface: the Agent menu item exists, and /research starts the pipeline —
// which without a configured Arena model fails with the exact honest instruction.
await ev(ui,`document.getElementById('settingsDialog').close();document.getElementById('prompt').value='/research test question';return true;`);
await clickTrusted(ui,'#agentMode');
const menu=await ev(ui,`const m=document.querySelector('.composer-menu');return m?{items:[...m.querySelectorAll('strong')].map(s=>s.textContent)}:null;`);
record('the Agent menu offers Research with Arena',Array.isArray(menu?.items)&&menu.items.includes('Research with Arena'),JSON.stringify(menu?.items));
await ev(ui,`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));document.querySelector('.composer-menu')?.remove();return true;`);
await clickTrusted(ui,'#send');
let researchStatus=null;
for(let i=0;i<10;i++){await sleep(1000);researchStatus=await ev(ui,`return document.getElementById('status').textContent;`);if(/Choose an Arena model|research/i.test(researchStatus||''))break;}
record('/research runs the pipeline and refuses honestly without a model',/Choose an Arena model first/.test(researchStatus||''),String(researchStatus).slice(0,140));

record('no extension-page exceptions',errors.length===0,errors.slice(0,2).join(' | ').slice(0,200));
console.log('\nEvidence in',OUT);
const failed=results.filter(r=>!r.ok).length;
console.log(failed?`${failed} check(s) failed`:'All checks passed');
process.exit(failed?1:0);