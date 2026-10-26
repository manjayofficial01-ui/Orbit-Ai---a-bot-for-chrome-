// verify-in-chrome.mjs — run the real extension in real Chrome and capture visual + DOM evidence.
//
//   node scripts/verify-in-chrome.mjs [--widths=400,720,1280] [--out=<dir>] [--keep]
//
// Dev-only: this file is not copied into dist/ and adds no dependency. It needs a local Chrome and
// uses a throwaway profile outside the repo, so it never touches your signed-in browser.
//
// How it works: Chrome ignores --load-extension now, so the extension is installed at runtime with
// the CDP command Extensions.loadUnpacked, then driven over the DevTools protocol.
//
// Two things it deliberately separates:
//   * smoke checks against the SHIPPED dist/ (rendering, layout overflow, console errors);
//   * the capture check, which needs a host grant. Chrome only grants host permissions after a user
//     approves a prompt, which headless cannot do, so the capture test runs against a temporary
//     fixture copy of dist/ whose manifest carries host_permissions. The shipped manifest keeps the
//     optional-permission model; its refusal path is asserted too.
import {spawn} from 'node:child_process';
import {mkdirSync, existsSync, readFileSync, writeFileSync, cpSync, rmSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const DIST=join(root,'dist');
const arg=n=>{const m=new RegExp(`--${n}=([^\\s]+)`).exec(process.argv.join(' '));return m?m[1]:null;};
const widths=(arg('widths')||'400,720,1280').split(',').map(Number);
const OUT=arg('out')||join(tmpdir(),'orbit-verify');
const KEEP=process.argv.includes('--keep');

const CHROME_CANDIDATES=[process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome','/usr/bin/chromium-browser','/usr/bin/chromium'].filter(Boolean);
const findChrome=()=>{
  const found=CHROME_CANDIDATES.find(p=>existsSync(p));
  if(!found){console.error('Chrome not found. Set CHROME_PATH=/path/to/chrome and retry.\nLooked for:\n  '+CHROME_CANDIDATES.join('\n  '));process.exit(2);}
  return found;
};

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const results=[];
const record=(name,ok,detail)=>{results.push({name,ok,detail});console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?'  — '+detail:''}`);};

if(existsSync(OUT))rmSync(OUT,{recursive:true,force:true});
mkdirSync(OUT,{recursive:true});
const PROFILE=join(OUT,'profile'); mkdirSync(PROFILE,{recursive:true});

// A local canary page: identifiable by eye in a screenshot, and with hidden text that must not appear.
const CANARY='ZEBRA-'+Math.floor(Math.random()*1e4);
let pageVariant='ALPHA';
const server=createServer((_q,res)=>{res.writeHead(200,{'content-type':'text/html'});
  res.end(`<!doctype html><meta charset=utf-8><title>Orbit verify canary</title>
  <body style="font:34px Georgia,serif;margin:18px;background:#fff;color:#000">
  <h1 style="font-size:38px;margin:0 0 10px;color:${pageVariant==='ALPHA'?'#b00':'#080'}">Orbit verification target · ${pageVariant}</h1><p>Marker: <b>${CANARY}</b></p>
  <p>Total due: 1,284.50</p>
  <p style="display:none">HIDDEN-MUST-NOT-APPEAR</p>`);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const webPort=server.address().port;

const chrome=findChrome();
const PORT=9339;
const child=spawn(chrome,['--headless=new',`--user-data-dir=${PROFILE}`,`--remote-debugging-port=${PORT}`,
  '--disable-gpu','--no-first-run','--no-default-browser-check','about:blank'],{stdio:['ignore','pipe','pipe']});
let chromeErr=''; child.stderr.on('data',d=>chromeErr+=d.toString());

const cdpGet=async p=>{try{const r=await fetch(`http://127.0.0.1:${PORT}${p}`);return r.ok?await r.json():null;}catch{return null;}};
let version=null;
for(let i=0;i<50;i++){version=await cdpGet('/json/version'); if(version)break; await sleep(400);}
if(!version){console.error('Chrome did not expose CDP.\n'+chromeErr.slice(0,400)); process.exit(2);}
console.log('Chrome:',version['Browser']||version['User-Agent']);

const ws=new WebSocket(version.webSocketDebuggerUrl);
await new Promise(r=>ws.addEventListener('open',r));
let seq=0; const pending=new Map(); const consoleErrors=[];
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);
  if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}
  else if(m.method==='Runtime.exceptionThrown')consoleErrors.push(m.params.exceptionDetails?.exception?.description||'exception');
  else if(m.method==='Log.entryAdded'&&m.params.entry?.level==='error')consoleErrors.push(m.params.entry.text);});
const send=(method,params={},sessionId)=>new Promise(res=>{const id=++seq;pending.set(id,res);
  ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
const attach=async targetId=>(await send('Target.attachToTarget',{targetId,flatten:true})).result.sessionId;
const evaluate=async(sessionId,fnBody)=>{
  const r=await send('Runtime.evaluate',{expression:`(async()=>{${fnBody}})()`,awaitPromise:true,returnByValue:true},sessionId);
  if(r.error) return {__error:r.error.message};
  return r.result?.result?.value;};

// ---------- 1. shipped dist/, no extra grants: boot + layout ----------
const extId=(await send('Extensions.loadUnpacked',{path:DIST})).result?.id;
if(!extId){console.error('loadUnpacked failed: '+JSON.stringify((await send('Extensions.loadUnpacked',{path:DIST})).error));process.exit(2);}
const uiTarget=(await send('Target.createTarget',{url:`chrome-extension://${extId}/index.html`})).result.targetId;
const ui=await attach(uiTarget);
await send('Runtime.enable',{},ui);
await sleep(1200);

const boot=await evaluate(ui,`return {
  ready:document.readyState, extId:chrome.runtime?.id||null,
  welcome:!!document.querySelector('.welcome'), pills:document.querySelectorAll('.welcome-points li').length,
  composer:!!document.getElementById('prompt'), send:!!document.getElementById('send'),
  status:document.getElementById('status')?.textContent||''};`);
record('extension page boots', boot?.ready==='complete'&&boot?.composer===true&&boot?.welcome===true, JSON.stringify(boot).slice(0,180));
record('no page errors during boot', consoleErrors.length===0, consoleErrors.slice(0,2).join(' | ').slice(0,200));

const adv=await evaluate(ui,`
  document.getElementById('settings').click();
  document.querySelector('[data-settings-tab="advanced"]').click();
  await new Promise(r=>setTimeout(r,250));
  const ids=['search','xsearch','code'];
  const out=ids.map(id=>{const el=document.getElementById(id);
    return {id,exists:!!el,type:el?.type,checked:el?.checked,
      inPanel:!!el?.closest('[data-settings-panel="advanced"]')};});
  document.getElementById('settingsDialog').close();
  return out;`);
record('hosted-tool checkboxes exist in Settings → Advanced', Array.isArray(adv)&&adv.length===3&&adv.every(x=>x.exists&&x.type==='checkbox'&&x.checked===false), JSON.stringify(adv));

const shots=[];
for(const w of widths){
  await send('Emulation.setDeviceMetricsOverride',{width:w,height:900,deviceScaleFactor:1,mobile:false},ui);
  await sleep(500);
  const m=await evaluate(ui,`
    const de=document.documentElement, bar=document.querySelector('.toolbar');
    const clipped=bar?[...bar.querySelectorAll('button,select')].filter(el=>el.getBoundingClientRect().right>bar.getBoundingClientRect().right+1).map(el=>el.id||el.textContent.trim().slice(0,14)):[];
    return {docScrollX:de.scrollWidth-de.clientWidth,
      bodyScrollX:document.body.scrollWidth-document.body.clientWidth,
      toolbarOverflow:bar?bar.scrollWidth-bar.clientWidth:null, clipped};`);
  const png=(await send('Page.captureScreenshot',{format:'png'},ui)).result?.data;
  const file=join(OUT,`orbit-${w}.png`);
  if(png){writeFileSync(file,Buffer.from(png,'base64')); shots.push(file);}
  record(`layout at ${w}px has no horizontal page overflow`, m.docScrollX<=1&&m.bodyScrollX<=1, `docScrollX=${m.docScrollX} bodyScrollX=${m.bodyScrollX} toolbarOverflow=${m.toolbarOverflow}`);
  record(`every composer control is visible at ${w}px`, m.clipped.length===0, `clipped=[${m.clipped}]`);
}

// A real webpage tab becomes the active tab, so the capture path is exercised against a supported page.
const web=(await send('Target.createTarget',{url:`http://127.0.0.1:${webPort}/`})).result.targetId;
await send('Target.activateTarget',{targetId:web}); await sleep(1500);

// ---------- 2. capture path: refusal on shipped manifest, success on a host-granted fixture ----------
const refusal=await evaluate(ui,`const m=await import('./page-access.js');
  try{ await m.captureActiveScreenshot(); return 'UNEXPECTED-SUCCESS'; }
  catch(e){ return String(e.message).slice(0,160); }`);
record('capture without a host grant fails honestly (not silently)', refusal!=='UNEXPECTED-SUCCESS'&&typeof refusal==='string', refusal);

const FIX=join(OUT,'fixture'); cpSync(DIST,FIX,{recursive:true});
const man=JSON.parse(readFileSync(join(FIX,'manifest.json'),'utf8'));
man.host_permissions=['<all_urls>']; delete man.optional_host_permissions;
writeFileSync(join(FIX,'manifest.json'),JSON.stringify(man,null,2));
const fixId=(await send('Extensions.loadUnpacked',{path:FIX})).result?.id;
const fixUi=(await send('Target.createTarget',{url:`chrome-extension://${fixId}/index.html`})).result.targetId;
let fx=await attach(fixUi);
// The fixture page needs a moment before its module graph is importable.
let fxReady=false;
for(let i=0;i<20&&!fxReady;i++){ await sleep(400);
  const r=await evaluate(fx,`return {ready:document.readyState};`);
  fxReady=r?.ready==='complete'; }
record('fixture extension page ready', fxReady, '');
// Creating the fixture tab made it the active tab; the capture test needs the canary page active.
await send('Target.activateTarget',{targetId:web}); await sleep(1200);
const cap=await evaluate(fx,`const m=await import('./page-access.js');
  try{ const r=await m.captureActiveScreenshot(); window.__shot=r.dataUrl;
       return {ok:true,kind:r.kind,title:r.title,url:r.url,mime:r.dataUrl.slice(5,15),bytes:r.dataUrl.length};
  }catch(e){ return {ok:false,error:String(e.message).slice(0,160)}; }`);
record('captureActiveScreenshot() returns a real image', cap?.ok===true&&/^image\//.test(cap.mime||''), JSON.stringify(cap).slice(0,170));
if(cap?.ok){
  const dataUrl=await evaluate(fx,`return window.__shot||'';`);
  const jpg=join(OUT,'orbit-captured-page.jpg');
  writeFileSync(jpg,Buffer.from(String(dataUrl).split(',')[1],'base64')); shots.push(jpg);
  const dims=await evaluate(fx,`const i=new Image(); i.src=window.__shot; await i.decode(); return {w:i.naturalWidth,h:i.naturalHeight};`);
  record('captured image decodes with real dimensions', dims?.w>100&&dims?.h>100, JSON.stringify(dims));

  // The feature under test: Orbit's own local OCR reading Orbit's own screenshot, no network involved.
  const ocr=await evaluate(fx,`const o=await import('./ocr.js');
    try{ const r=await o.readImageText(window.__shot); const flat=r.text.replace(/\\s+/g,' '); return {ok:true,confidence:r.confidence,state:o.ocrState(),
      hasHeading:/Orbit verification target/i.test(flat), hasMarker:flat.includes(${JSON.stringify(CANARY)}),
      hasAmount:/1[,.]?284[.,]?50/.test(flat), hasHidden:flat.includes('HIDDEN-MUST-NOT-APPEAR'),
      sample:flat.slice(0,160)}; }
    catch(e){ return {ok:false,error:String(e.message).slice(0,180)}; }`);
  record('local OCR reads the captured screenshot', ocr?.ok===true&&ocr.hasHeading===true, JSON.stringify(ocr).slice(0,220));
  record('OCR finds the random marker text', ocr?.hasMarker===true, `marker=${CANARY} found=${ocr?.hasMarker} confidence=${ocr?.confidence}`);
  record('OCR does not invent hidden (display:none) text', ocr?.hasHidden===false, `hasHidden=${ocr?.hasHidden}`);

  // The dialog itself: click the real Screenshot button and confirm the captured image is shown
  // and that every action is inside the dialog box (a scrolled-out action is a real failure).
  const dialogCheck=`
    document.getElementById('screenshot').click();
    await new Promise(r=>setTimeout(r,2500));
    const d=document.getElementById('contextDialog'), img=document.getElementById('shotPreview');
    const box=d.getBoundingClientRect(), names=['cancelContext','ocrShot','analyzeShot','attach'];
    const outside=names.filter(id=>{const el=document.getElementById(id); if(el.hidden) return false;
      const r=el.getBoundingClientRect(); return r.right>box.right+1||r.bottom>box.bottom+1||r.width===0;});
    const out={viewport:document.documentElement.clientWidth+'x'+document.documentElement.clientHeight,
      open:d.open, imgShown:!img.hidden, w:img.naturalWidth, h:img.naturalHeight,
      hasSrc:(img.currentSrc||img.src||'').startsWith('data:image/'), alt:!!img.alt,
      dialogBottom:Math.round(box.bottom), visible:names.filter(id=>!document.getElementById(id).hidden), outside,
      scrollOverflow:d.scrollHeight-d.clientHeight};
    document.getElementById('cancelContext').click();
    return out;`;
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false},fx);
  await sleep(400);
  const dlg=await evaluate(fx,dialogCheck);
  record('screenshot dialog shows the actual captured image', dlg?.imgShown===true&&dlg?.w>100&&dlg?.hasSrc===true&&dlg?.alt===true, JSON.stringify(dlg).slice(0,200));
  record('dialog actions stay inside the dialog at 1280x900', dlg?.outside?.length===0&&dlg?.scrollOverflow===0, `outside=[${dlg?.outside}] innerScroll=${dlg?.scrollOverflow}`);

  // The real usage shape: a narrow side panel.
  await send('Emulation.setDeviceMetricsOverride',{width:420,height:820,deviceScaleFactor:1,mobile:false},fx);
  await sleep(400);
  const narrow=await evaluate(fx,dialogCheck);
  record('screenshot dialog still shows the image in a narrow panel', narrow?.imgShown===true&&narrow?.w>100, JSON.stringify(narrow).slice(0,180));
  record('no dialog action falls outside the dialog at 420x820', narrow?.outside?.length===0&&narrow?.dialogBottom<=821&&narrow?.scrollOverflow===0, JSON.stringify(narrow).slice(0,220));
  // Keep the dialog open and photograph it, so the visual claim can be inspected rather than inferred.
  await evaluate(fx,`document.getElementById('screenshot').click(); await new Promise(r=>setTimeout(r,2500)); return 1;`);
  const dlgPng=await send('Page.captureScreenshot',{format:'png'},fx);
  if(dlgPng.result?.data){const f=join(OUT,'orbit-screenshot-dialog.png');writeFileSync(f,Buffer.from(dlgPng.result.data,'base64'));shots.push(f);}

  // ---------- 3. the model path, against a local stand-in provider ----------
  // The owner's real key is never read by this script. A loopback endpoint exercises the same code:
  // preconditions, request construction, the image actually leaving the machine, and the fallback.
  const TRANSCRIPT='Invoices and Receipts\nReference number QX-4417\nTotal due: 1,284.50';
  const received=[];
  let mode='transcribe';
  const provider=createServer((req,res)=>{
    let raw='';req.on('data',c=>{raw+=c;});
    req.on('end',()=>{
      let body=null;try{body=JSON.parse(raw);}catch{}
      received.push({path:req.url,method:req.method,body});
      if(mode==='notfound'){res.writeHead(404,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'model not found'}}));return;}
      res.writeHead(200,{'content-type':'application/json'});
      if(/\/models$/.test(req.url))res.end(JSON.stringify({data:[{id:'mock-vision'},{id:'mock-mini'}]}));
      else res.end(JSON.stringify({choices:[{message:{content:mode==='empty'?'   ':TRANSCRIPT}}]}));
    });
  });
  // A trusted click, because chrome.permissions.request() refuses to run outside a real user gesture.
  const clickEl=async(selector)=>{
    const box=await evaluate(fx,`const el=document.querySelector(${JSON.stringify(selector)});
      if(!el||el.hidden||!el.getBoundingClientRect().width) return null;
      const r=el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,vw:innerWidth,vh:innerHeight};`);
    if(!box) throw Error('element not clickable: '+selector);
    if(box.y<0||box.y>box.vh) throw Error(`${selector} is outside the viewport (y=${Math.round(box.y)} of ${box.vh})`);
    for(const type of ['mousePressed','mouseReleased'])
      await send('Input.dispatchMouseEvent',{type,x:Math.round(box.x),y:Math.round(box.y),button:'left',clickCount:1,buttons:type==='mousePressed'?1:0},fx);
    await sleep(300);
  };
  await new Promise(r=>provider.listen(0,'127.0.0.1',r));
  const pPort=provider.address().port;

  await evaluate(fx,`
    await chrome.storage.local.set({orbit:{chats:[],current:'',provider:'custom',theme:'dark',fontSize:'medium',recentChats:[],recentIndex:-1,
      profiles:{custom:{base:'http://127.0.0.1:${pPort}/v1',model:'mock-vision',format:'chat',temperature:'',maxTokens:'',
        tokenField:'max_completion_tokens',effort:'',search:false,xsearch:false,code:false,instructions:'',memory:'',
        saveHistory:true,smartContext:false,contextDepth:'balanced',autoTitle:true}}}});
    return 1;`);
  // A fresh page instance, not a reload: reloading leaves the previous OCR worker behind and
  // muddies the fallback measurement.
  await send('Target.closeTarget',{targetId:fixUi});
  await sleep(700);
  const fixUi2=(await send('Target.createTarget',{url:`chrome-extension://${fixId}/index.html`})).result.targetId;
  fx=await attach(fixUi2);
  // Creating a tab makes it active; the capture test needs the canary page active again.
  await send('Target.activateTarget',{targetId:web});
  await sleep(1500);
  const seeded=await evaluate(fx,`return {connection:document.getElementById('connection')?.textContent, hasPrompt:!!document.getElementById('prompt')};`);
  record('fixture booted against the local stand-in provider', seeded?.hasPrompt===true&&/mock-vision/.test(seeded?.connection||''), JSON.stringify(seeded));

  // ---- listing vs testing must be genuinely separate actions ----
  // Input events are dropped for a background tab, so foreground the extension page for these.
  await send('Target.activateTarget',{targetId:fixUi2}); await sleep(800);
  // A fresh target resets emulation; the settings dialog is taller than the default 800x600 window,
  // which would put the action buttons below the fold and make trusted clicks miss them.
  await send('Emulation.setDeviceMetricsOverride',{width:900,height:1400,deviceScaleFactor:1,mobile:false},fx);
  await sleep(400);
  await evaluate(fx,`document.getElementById('settings').click(); await new Promise(r=>setTimeout(r,400)); return 1;`);
  received.length=0;
  await clickEl('#models'); await sleep(2500);
  const listStatus=await evaluate(fx,`return document.getElementById('settingsStatus').textContent;`);
  record('Fetch models calls only the list endpoint', received.some(r=>/\/models$/.test(r.path))&&!received.some(r=>/chat\/completions/.test(r.path)),
    `paths=[${received.map(r=>r.path).join(' ')}]`);
  record('listing is worded as a list, not a verdict', /Listed 2 models/.test(listStatus||'')&&/press Test connection/.test(listStatus||''), (listStatus||'').slice(0,120));

  received.length=0;
  await clickEl('#testModel'); await sleep(4000);
  const testStatus=await evaluate(fx,`return document.getElementById('settingsStatus').textContent;`);
  const probe=received.find(r=>/chat\/completions/.test(r.path));
  const cap=probe?.body?.max_tokens ?? probe?.body?.max_completion_tokens;
  record('Test connection calls only the generation endpoint', !!probe&&!received.some(r=>/\/models$/.test(r.path)),
    `paths=[${received.map(r=>r.path).join(' ')}]`);
  record('the probe names the model, bounds cost and carries no hosted tools',
    probe?.body?.model==='mock-vision'&&cap===64&&probe?.body?.tools===undefined, JSON.stringify({model:probe?.body?.model,cap,tools:probe?.body?.tools}));
  record('a working model is reported as working', /is working — answered in \d+ ms/.test(testStatus||''), (testStatus||'').slice(0,120));

  // The reported bug: a provider that refuses /models must not make a working model look broken.
  mode='notfound'; received.length=0;
  await clickEl('#models'); await sleep(2500);
  const refused=await evaluate(fx,`return document.getElementById('settingsStatus').textContent;`);
  record('a refused model list is scoped to the list only', /Model list unavailable \(HTTP 404\)/.test(refused||'')&&/your model can still work/.test(refused||''), (refused||'').slice(0,150));
  mode='transcribe'; received.length=0;
  await clickEl('#testModel'); await sleep(4000);
  const recovered=await evaluate(fx,`return document.getElementById('settingsStatus').textContent;`);
  record('the same model still tests working after a refused list', /is working — answered in/.test(recovered||''), (recovered||'').slice(0,120));

  const googlePreset=await evaluate(fx,`
    const p=document.getElementById('provider'); p.value='google'; p.dispatchEvent(new Event('change'));
    await new Promise(r=>setTimeout(r,300));
    return JSON.stringify({base:document.getElementById('base').value,tokenField:document.getElementById('tokenField').value,format:document.getElementById('format').value});`);
  record('Google Gemini preset loads the compatible base and max_tokens',
    /generativelanguage\.googleapis\.com\/v1beta\/openai/.test(googlePreset)&&/"tokenField":"max_tokens"/.test(googlePreset)&&/"format":"chat"/.test(googlePreset), String(googlePreset));
  await evaluate(fx,`document.getElementById('settingsDialog').close(); return 1;`);
  await send('Target.activateTarget',{targetId:web}); await sleep(1200);

  const modelRun=await evaluate(fx,`
    document.getElementById('screenshot').click();
    await new Promise(r=>setTimeout(r,2500));
    document.getElementById('ocrShot').click();
    await new Promise(r=>setTimeout(r,5000));
    return {note:document.getElementById('contextNote').textContent,
      preview:document.getElementById('contextPreview').value,
      editable:!document.getElementById('contextPreview').readOnly};`);
  const sent=received.at(-1)?.body||{};
  const flat=JSON.stringify(sent);
  record('image reading calls the configured model endpoint', received.length>0&&sent.model==='mock-vision', `requests=${received.length} model=${sent.model} path=${received.at(-1)?.path}`);
  record('the image really is sent to the provider (SECURITY.md claim)', /"image_url":\{"url":"data:image\//.test(flat), `payload bytes=${flat.length}`);
  record('hosted provider tools are not attached to a transcription call', sent.tools===undefined, `tools=${JSON.stringify(sent.tools)}`);
  record('model transcription lands in the editable preview, labelled', /Transcribed by your model \(mock-vision\)/.test(modelRun?.note||'')
    &&/\[Image text · transcribed by mock-vision\]/.test(modelRun?.preview||'')&&modelRun?.editable===true
    &&/QX-4417/.test(modelRun?.preview||''), JSON.stringify({note:(modelRun?.note||'').slice(0,80),preview:(modelRun?.preview||'').slice(0,60)}));

  // Make the model return nothing: the fallback must engage and must say so.
  mode='empty';
  await evaluate(fx,`document.getElementById('screenshot').click(); await new Promise(r=>setTimeout(r,2500)); return 1;`);
  const fallback=await evaluate(fx,`
    document.getElementById('ocrShot').click();
    const t0=Date.now();
    while(Date.now()-t0<45000){
      const n=document.getElementById('contextNote').textContent||'';
      if(!/Reading the image with your configured model|falling back to the on-device engine/.test(n)) break;
      await new Promise(r=>setTimeout(r,500));
    }
    return {note:document.getElementById('contextNote').textContent, preview:document.getElementById('contextPreview').value.slice(0,90),
      waitedMs:Date.now()-t0};`);
  record('an empty model reply falls back to the local engine and labels it', /bundled engine/.test(fallback?.note||'')&&/\[Image text · local OCR/.test(fallback?.preview||''),
    JSON.stringify({note:(fallback?.note||'').slice(0,110),preview:(fallback?.preview||'').slice(0,60),waitedMs:fallback?.waitedMs}));
  // ---- the reported bug: a new screenshot must REPLACE the previous one, not pile up behind it ----
  const canaryUrl=`http://127.0.0.1:${webPort}/`;
  await evaluate(fx,`const s=await chrome.storage.local.get('orbit'); await chrome.storage.local.set({orbit:{...s.orbit,chats:[],current:''}}); return 1;`);
  await send('Target.closeTarget',{targetId:fixUi2}); await sleep(700);
  const replayTarget=(await send('Target.createTarget',{url:`chrome-extension://${fixId}/index.html`})).result.targetId;
  const rf=await attach(replayTarget);
  await send('Target.activateTarget',{targetId:web}); await sleep(1400);
  const shotAndSend=async prompt=>{
    await evaluate(rf,`for(let i=0;i<120;i++){ if(!document.getElementById('screenshot').disabled) break; await new Promise(r=>setTimeout(r,250)); } return 1;`);
    await evaluate(rf,`document.getElementById('screenshot').click(); return 1;`);
    await sleep(2800);
    const pills=await evaluate(rf,`const d=document.getElementById('contextDialog'); if(!d.open) return 'no-dialog';
      const src=(document.getElementById('shotPreview').currentSrc||document.getElementById('shotPreview').src||'').length;
      document.getElementById('attach').click();
      return document.querySelectorAll('#attachments button').length+'/'+src;`);
    await evaluate(rf,`document.getElementById('prompt').value=${JSON.stringify(prompt)}; document.getElementById('send').click(); return 1;`);
    await sleep(6000);
    return pills;
  };
  const imgsOf=b=>(JSON.stringify(b||{}).match(/data:image\//g)||[]).length;
  const sigOf=b=>{const m=/data:image\/[a-z]+;base64,([A-Za-z0-9+/=]{800,})/.exec(JSON.stringify(b||{}));return m?createHash('sha256').update(m[1]).digest('hex').slice(0,16):'';};

  received.length=0;
  const r1=await shotAndSend('Describe the first screenshot.');
  const stored1=await evaluate(rf,`const s=await chrome.storage.local.get('orbit'); const m=(s.orbit?.chats?.[0]?.messages||[]).find(x=>x.role==='user'); return JSON.stringify({content:typeof m?.content, refs:(m?.refs||[]).map(r=>({kind:r.kind,dataLen:(r.dataUrl||'').length}))});`);
  const t1=received.filter(r=>/chat\/completions/.test(r.path)).at(-1)?.body;
  pageVariant='BRAVO';
  await evaluate(rf,`const t=(await chrome.tabs.query({})).find(x=>x.url===${JSON.stringify(canaryUrl)}); if(t){await chrome.tabs.update(t.id,{active:true}); await chrome.tabs.reload(t.id);} return 1;`);
  await sleep(2200);
  received.length=0;
  const r2=await shotAndSend('Now describe the second screenshot.');
  const t2=received.filter(r=>/chat\/completions/.test(r.path)).at(-1)?.body;

  record('turn 1 attaches a real screenshot and sends exactly one image', /^1\/[1-9]/.test(String(r1))&&imgsOf(t1)===1, `attached(count/imgBytes)=${r1} images=${imgsOf(t1)} stored=${stored1}`);
  record('turn 2 sends ONLY the new image, not both', /^1\/[1-9]/.test(String(r2))&&imgsOf(t2)===1, `attached=${r2} images=${imgsOf(t2)}`);
  record('the image kept is the new capture, not the stale one', !!sigOf(t2)&&sigOf(t1)!==sigOf(t2), `first=${sigOf(t1).slice(0,14)} second=${sigOf(t2).slice(0,14)}`);
  record('the replaced screenshot is announced to the model, not silently dropped', /no longer sent/.test(JSON.stringify(t2||{})), '');
  provider.close();
}

server.close(); ws.close(); child.kill('SIGTERM'); await sleep(600);
if(!KEEP) rmSync(PROFILE,{recursive:true,force:true});

const failed=results.filter(r=>!r.ok);
console.log(`\n${results.length-failed.length}/${results.length} checks passed`);
console.log('evidence written to '+OUT+':\n  '+shots.join('\n  '));
process.exit(failed.length?1:0);
