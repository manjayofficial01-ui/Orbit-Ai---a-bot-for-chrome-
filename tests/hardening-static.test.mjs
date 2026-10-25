import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Static regression gates for fixes that live in browser-only code paths (no DOM/Chrome runtime here).
// They lock the source shape that makes the behaviour safe; live behaviour is covered by docs/MANUAL-QA.md.
const root=new URL('../',import.meta.url);
const [app,background,pageAccess,agentRun]=await Promise.all([
  readFile(new URL('src/app.js',root),'utf8'),
  readFile(new URL('src/background.js',root),'utf8'),
  readFile(new URL('src/page-access.js',root),'utf8'),
  readFile(new URL('src/agent-run.js',root),'utf8')
]);

test('boot survives an unavailable storage access-level API',()=>{
  const calls=[...app.matchAll(/chrome\.storage\.(local|session)\.setAccessLevel(\??\.\.\.?|\??\.)/g)];
  assert.equal(calls.length,2,'both storage areas should still be hardened');
  for(const call of calls)assert.equal(call[2].includes('?'),true,`setAccessLevel on ${call[1]} is called without a capability guard`);
  assert.match(app,/async function hardenStorage\(\)\{[\s\S]*?try\{[\s\S]*?setAccessLevel[\s\S]*?\}catch/,
    'setAccessLevel must be wrapped so an older Chrome cannot abort boot');
});

test('a failed storage read blocks writes instead of clobbering unreadable data',()=>{
  assert.match(app,/storageWritable=false/, 'the read failure must disable persistence');
  assert.match(app,/function save\(\)\{if\(!ownsWorkspace\|\|!storageWritable\)return Promise\.resolve\(\);/,
    'save() must refuse to write when the stored state could not be read');
  // Every direct local write must pass the same guard, or the protection is only partial.
  assert.equal([...app.matchAll(/chrome\.storage\.local\.set\(/g)].length,2,'save() and writeLocal() are the only allowed direct writers');
  assert.match(app,/function writeLocal\(payload\)\{if\(!storageWritable\)return Promise\.resolve\(\);return chrome\.storage\.local\.set\(payload\);\}/);
  for(const guarded of ['writeLocal({orbitKeys:keys,orbitModels:modelCache})','writeLocal({orbitModels:modelCache})','writeLocal({orbitUI:ui})']){
    assert.ok(app.includes(guarded),`missing guarded writer: ${guarded}`);
  }
});

test('corrupt stored state cannot blank the panel before it renders',()=>{
  assert.match(app,/if\(saved\.orbit&&Array\.isArray\(saved\.orbit\.chats\)\)/,'stored chats must be validated');
  assert.match(app,/if\(!Array\.isArray\(c\.messages\)\)c\.messages=\[\];/,'a stored chat without a messages array must be normalized before anything renders it');
  assert.match(app,/if\(!state\.chats\.some\(c=>c\.id===state\.current\)\)state\.current=/,'a dangling current id must be repaired');
  const sessionRead=/try\{ legacy=await chrome\.storage\.session\.get\('keys'\); \}catch\{[^}]*\}/.exec(app)?.[0]||'';
  assert.ok(sessionRead.length>0,'the session read needs its own guard');
  assert.doesNotMatch(sessionRead,/storageWritable=false/,'a session-read failure must not disable local persistence');
});

test('storage degradation is reported honestly instead of as a success',()=>{
  assert.match(app,/nothing was persisted and the key will be lost/);
  assert.match(app,/the saved key will return after a restart/);
  assert.doesNotMatch(app,/status\('Connection saved\. Your local key will be reused after restart\.'\)/,
    'the save-success line must not fire unconditionally when persistence is disabled');
});

test('agent progress stays announced after the conversation stopped being a live region',()=>{
  assert.match(app,/say\(line\);status\(line\.slice\(0,200\)\)/,'agent steps must reach the live status region too');
});

test('the selection context menu tolerates a missing selectionText',()=>{
  assert.doesNotMatch(background,/info\.selectionText\.slice/, 'unguarded selectionText can throw in the service worker');
  assert.match(background,/String\(info\.selectionText\|\|''\)/);
  assert.match(background,/if\(!text\)return/,'an empty selection must not open a draft');
});

test('the all-tabs digest filters hidden text like the other extractors',()=>{
  const body=/export function digestScan\(\)\{[\s\S]*?\n\}/.exec(pageAccess)?.[0]||'';
  assert.ok(body.length>0,'digestScan is missing');
  assert.match(body,/\[hidden\],\[aria-hidden="true"\]/);
  // display:none does not propagate into a descendant's computed style, so an ancestor climb is required.
  assert.match(body,/hiddenByStyle/,'a direct-parent style check misses CSS-hidden wrappers');
  assert.match(body,/for\(let a=el;a&&a!==document\.documentElement;a=a\.parentElement\)/);
  assert.match(body,/s\.display==='none'\|\|s\.visibility==='hidden'\|\|s\.contentVisibility==='hidden'/);
  // Background tabs may never have painted, so layout-dependent visibility checks are deliberately not used here.
  assert.doesNotMatch(body,/\.getClientRects\(/,'a layout-dependent check can silently return no text for an unpainted tab');
});

test('the URL fetch bounds the download while reading, not after buffering it',()=>{
  assert.doesNotMatch(pageAccess,/await res\.text\(\)/, 'res.text() buffers a hostile response before any size check');
  assert.match(pageAccess,/if\(n>2000000\)throw Error\('Page exceeds the 2 MB fetch limit/,
    'the 2 MB cap must be enforced during the read loop');
  assert.match(pageAccess,/await reader\.cancel\(\)/);
  // The bounded rewrite must not silently drop the charset that res.text() used to honour.
  assert.match(pageAccess,/charset=/i,'the declared charset must be read from content-type');
  assert.match(pageAccess,/TextDecoder\([^)]*label/,'decoding must use that charset, not always UTF-8');
});

test('the agent refreshes the approval origin from Chrome, not only from the snapshot',()=>{
  assert.match(agentRun,/const syncOrigin=async\(\)=>\{ try\{ const t=await chrome\.tabs\.get\(activeTabId\); if\(t\?\.url\) activeUrl=t\.url; \}catch\{\} \};/,
    'the tab record is the authoritative origin for the approval dialog');
  assert.equal([...agentRun.matchAll(/await syncOrigin\(\);/g)].length,2,
    'both the normal path and the failed-re-snapshot path must refresh the origin');
});

test('a tab switch ends the step so later refs cannot alias the new page',()=>{
  assert.match(agentRun,/tool:'deferred'/);
  assert.match(agentRun,/belong to the previous page/);
});

test('welcome-screen claims stay anchored to capabilities that exist in code',()=>{
  assert.match(app,/'welcome-points'/,'the differentiator strip is missing');
  assert.match(app,/Bring your own key: any provider, no credits/);
  assert.match(app,/No account, no telemetry — open source/);
  // The local-model claim must keep matching a real preset, and the approval claim a real gate.
  assert.match(app,/ollama:'http:\/\/localhost:11434\/v1'/,'the Ollama claim requires a working local preset');
  assert.match(agentRun,/const ok=confirm\(/,'the per-action approval claim requires the confirm() gate');
  assert.doesNotMatch(app,/free unlimited|unlimited credits|no limits/i,'no claim may promise unlimited anything');
});

test('one-click screenshot analysis reuses the reviewed capture and cannot bypass it',()=>{
  assert.match(app,/\$\('analyzeShot'\)\.hidden=!shot;/,'Analyze now must appear only for screenshot references');
  assert.match(app,/\$\('attach'\)\.classList\.toggle\('primary',!shot\);/);
  assert.match(app,/\$\('analyzeShot'\)\.onclick=safe\(async\(\)=>\{if\(busy\)return;if\(!preview\|\|preview\.kind!=='screenshot'\)return;/,
    'Analyze now may only act on a preview opened through the review dialog');
  assert.match(app,/pending\.push\(ref\);renderAttachments\(\);if\(!\$\('prompt'\)\.value\.trim\(\)\)\$\('prompt'\)\.value='Analyze this screenshot\./,
    'the one-click flow must attach the reviewed screenshot and send through the normal send() path');
  assert.match(app,/if\(!\$\('prompt'\)\.value\.trim\(\)\)\$\('prompt'\)\.value='Analyze this screenshot\./,
    'a typed draft must not be overwritten by the canned analysis prompt');
  // The analyze handler must not capture anything itself; capture happens behind the preview dialog.
  const handler=/\$\('analyzeShot'\)\.onclick=safe\([\s\S]*?\}\);/.exec(app)?.[0]||'';
  assert.ok(handler.length>0,'the analyze handler must exist');
  assert.doesNotMatch(handler,/captureActiveScreenshot/,'Analyze now must reuse the reviewed capture, not take a new one');
  assert.doesNotMatch(handler,/dataUrl\s*=/,'the handler must not fabricate image data');
});
