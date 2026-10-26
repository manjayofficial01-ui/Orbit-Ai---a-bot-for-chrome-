import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Model listing and model testing are deliberately separate actions. These gates keep them separate:
// a refused /models endpoint must never be worded as if the user's model were broken.
const root=new URL('../',import.meta.url);
const [app,html]=await Promise.all([
  readFile(new URL('src/app.js',root),'utf8'),
  readFile(new URL('dist/index.html',root),'utf8')
]);

test('Google Gemini is a first-class preset using the OpenAI-compatible base',()=>{
  assert.match(app,/google:'https:\/\/generativelanguage\.googleapis\.com\/v1beta\/openai'/);
  assert.match(html,/<option value="google">Google Gemini<\/option>/);
  // Its compatibility layer ignores unknown fields, so the output cap needs the name it actually reads.
  assert.match(app,/const presetOverrides=\{google:\{tokenField:'max_tokens'\}\}/);
  assert.match(app,/\.\.\.defaults,\.\.\.\(presetOverrides\[id\]\|\|\{\}\)/,'loadProfile must apply preset overrides');
});

test('listing and testing are two distinct controls',()=>{
  assert.match(html,/id="models"[^>]*>Fetch models<\/button>/);
  assert.match(html,/id="testModel"[^>]*>Test connection<\/button>/);
  assert.doesNotMatch(html,/Test & fetch models/,'the combined label must be gone');
  assert.match(app,/\$\('models'\)\.onclick=safe\(\(\)=>discoverModels\(\)\)/);
  assert.match(app,/\$\('testModel'\)\.onclick=safe\(testConnection\)/);
});

test('model listing never claims to have tested anything',()=>{
  const fn=/async function discoverModels[\s\S]*?\n(?=function |async function |\$\()/.exec(app)?.[0]||'';
  assert.ok(fn.length>0,'discoverModels not found');
  assert.match(fn,/Fetching the model list…/);
  assert.doesNotMatch(fn,/Testing/i,'listing must not describe itself as a test');
  assert.doesNotMatch(fn,/Connected\./,'a model list is not a connection verdict');
  assert.match(fn,/Listed \$\{models\.length\}/);
  // Every failure path must point at Test connection rather than implying the model is dead.
  assert.equal((fn.match(/press Test connection/g)||[]).length>=2,true,
    'both list failures must tell the user the model may still work');
});

test('the connection probe measures the model and nothing else',()=>{
  const fn=/async function testConnection\(\)\{[\s\S]*?\n\}/.exec(app)?.[0]||'';
  assert.ok(fn.length>0,'testConnection not found');
  assert.match(fn,/if\(!c\.model\)throw Error\('Set a model ID first/);
  assert.match(fn,/search:false,xsearch:false,code:false/,'hosted tools must never ride on a probe');
  assert.match(fn,/temperature:'',effort:''/,'optional parameters must not fail a plain probe');
  assert.match(fn,/maxTokens:c\.maxTokens\|\|'64'/,'the probe must be bounded');
  assert.match(fn,/generateOnce\(probe,key/);
  assert.match(fn,/timeoutMs:60000/);
  assert.match(fn,/answered with HTTP 200 but no text/,'an empty success must not be reported as working');
  assert.match(fn,/is working — answered in \$\{ms\} ms/);
  assert.match(fn,/may be billed/,'the user is told a live request was made');
});

test('probe failures are mapped to what the user can actually act on',()=>{
  const fn=/function explainProbeFailure\(message,format\)\{[\s\S]*?\n\}/.exec(app)?.[0]||'';
  assert.ok(fn.length>0,'explainProbeFailure not found');
  assert.match(fn,/HTTP \$\{status\}\)/,'401/403 must be reported as a key or permission refusal');
  assert.match(fn,/===404/,'404 must be reported as an unknown model ID');
  assert.match(fn,/===429/,'429 must be reported as quota, not a broken model');
  assert.match(fn,/switch API format to Chat Completions/,'Responses-only failures must suggest the compatible format');
  assert.match(fn,/This is separate from the model list/);
});

test('a background auto-fetch cannot look like a hard failure',()=>{
  assert.match(app,/discoverModels\(\{quiet:true\}\)\.catch\(e=>\{\$\('settingsStatus'\)\.textContent=e\.message;\}\)/,
    'the convenience fetch must be non-fatal and must use the new wording');
  assert.doesNotMatch(app,/await discoverModels\(\{quiet:true\}\);/);
});
