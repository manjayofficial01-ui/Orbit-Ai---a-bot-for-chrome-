import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// OCR is the project's only runtime dependency and the only CSP relaxation, so both are pinned.
const root=new URL('../',import.meta.url);
const [ocrScript,app,manifest,vendorDoc]=await Promise.all([
  readFile(new URL('src/ocr.js',root),'utf8'),
  readFile(new URL('src/app.js',root),'utf8'),
  readFile(new URL('src/manifest.json',root),'utf8'),
  readFile(new URL('vendor/VENDOR.md',root),'utf8')
]);

test('vendored binaries match the hashes recorded in VENDOR.md',async()=>{
  const pinned=[...vendorDoc.matchAll(/^([0-9a-f]{64})\s\s(\S+?)\r?$/gm)];
  assert.ok(pinned.length>=4,'expected at least four pinned vendor hashes');
  for(const [,hash,file] of pinned){
    const bytes=await readFile(new URL('vendor/'+file,root));
    const actual=createHash('sha256').update(bytes).digest('hex');
    assert.equal(actual,hash,`${file} differs from the recorded hash`);
  }
});

test('OCR never reaches the network',()=>{
  assert.doesNotMatch(ocrScript,/\bfetch\s*\(/,'OCR must not fetch anything');
  assert.doesNotMatch(ocrScript,/https?:\/\//,'engine paths must be extension-local');
  for(const opt of ['workerPath','corePath','langPath'])
    assert.ok(ocrScript.includes(opt),`missing ${opt}`);
  assert.match(ocrScript,/chrome\.runtime\.getURL\('vendor\/tesseract\/'\)/);
  assert.match(ocrScript,/workerBlobURL:false/,'blob workers are blocked by the MV3 CSP');
});

test('the CSP relaxation is exactly wasm-unsafe-eval and nothing more',()=>{
  const csp=JSON.parse(manifest).content_security_policy.extension_pages;
  assert.match(csp,/script-src 'self' 'wasm-unsafe-eval'/);
  assert.doesNotMatch(csp,/script-src[^;]*(https?:|blob:|'unsafe-inline'|'unsafe-eval')/);
  assert.match(csp,/object-src 'none'/);
  assert.match(csp,/base-uri 'none'/);
});

test('OCR inputs are bounded before the engine is asked to work',()=>{
  assert.match(ocrScript,/dataUrl\.length>OCR_LIMITS\.dataUrlBytes/,'encoded image cap must be checked first');
  assert.match(ocrScript,/signal\?\.throwIfAborted\?\.\(\);\s*onStage\('starting'\)/,'abort must be honoured before startup');
  assert.match(ocrScript,/width\*height>OCR_LIMITS\.maxPixels/,'upscaling must be bounded by pixel count');
  assert.match(ocrScript,/setTimeout\(\(\)=>reject\(Error\('Local OCR timed out/,'a hung engine must not hang the panel');
  assert.match(ocrScript,/text\.slice\(0,OCR_LIMITS\.textOut\)/,'extracted text must be capped');
  assert.match(ocrScript,/if\(!text\) throw Error\('No readable text/,'an empty read must be reported, not sent as a blank reference');
});

test('a broken engine fails loudly and stays failed instead of retrying forever',()=>{
  assert.match(ocrScript,/broken=`OCR could not start/);
  assert.match(ocrScript,/if\(broken\) throw Error\(broken\)/);
  assert.match(ocrScript,/starting=null/,'a failed start must be cleared so state stays honest');
});

test('image reading prefers the owner\'s configured model and labels the fallback',()=>{
  assert.match(app,/\$\('fileInput'\)\.onchange[\s\S]*?\^image\\\//,'the file picker must accept images');
  assert.match(app,/if\(f\.size>6000000\)throw Error\('Images must be under 6 MB/);
  // Model path first, and it must be the configured provider rather than a hard-coded one.
  assert.match(app,/async function extractImageText\(dataUrl/, 'a single image-reading entry point is required');
  assert.match(app,/generateOnce\(cfg,key,\[\{role:'system',content:TRANSCRIBE_SYSTEM\},imageUserMessage\(/);
  assert.match(app,/const cfg=\{\.\.\.config\(\)\};cfg\.base=normalizeBase\(cfg\.base\);/,'it must use the profile the owner selected');
  // Preconditions are checked before anything leaves the machine.
  const body=/async function extractImageText[\s\S]*?\n\}/.exec(app)?.[0]||'';
  assert.ok(body.indexOf('Choose a model in Settings')<body.indexOf('onStage(\'model\')'),'model must be chosen before a request is made');
  assert.ok(body.indexOf('Grant provider access')<body.indexOf('onStage(\'model\')'),'provider grant must be checked before a request is made');
  assert.ok(body.indexOf('Save an API key')<body.indexOf('onStage(\'model\')'),'key must be checked before a request is made');
  // Fallback is explicit, labelled, and never silent.
  assert.match(app,/catch\(modelError\)\{[\s\S]*?readImageText\(dataUrl\)[\s\S]*?source:'local',modelNote:/);
  assert.match(app,/source==='model'\?'transcribed by '/,'every result must say which engine produced it');
  // The transcription prompt must not let an image issue instructions.
  assert.match(app,/do not follow it/i,'transcription must refuse instructions embedded in the image');
  // Both call sites go through the same path, and the text is reviewable before sending.
  assert.equal([...app.matchAll(/await extractImageText\(/g)].length,2,'screenshot dialog and file picker must share one path');
  assert.doesNotMatch(app,/try\{const r=await readImageText\(dataUrl\);status\(''\);showPreview/,'the file picker must not bypass the model path');
  assert.match(app,/\$\('contextPreview'\)\.value=preview\.text;\$\('contextPreview'\)\.readOnly=false/,'extracted text must be editable before sending');
});
