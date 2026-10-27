import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const [app,html,manifestText]=await Promise.all([
  readFile(new URL('src/app.js',root),'utf8'),
  readFile(new URL('dist/index.html',root),'utf8'),
  readFile(new URL('dist/manifest.json',root),'utf8')
]);

test('Reach review, settings, and progress controls exist without inline script',()=>{
  // Since 3.2 Reach starts from the Agent button's mode menu, not a dedicated composer button.
  for(const id of ['reachInstallCommand','reachCopyInstall','reachCheck','reachStatus','reachCapabilities','reachReviewDialog','reachReviewOperation','reachReviewChannel','reachReviewRequest','reachReviewError','reachStop','reachDecline','reachApprove']){
    assert.ok(html.includes(`id="${id}"`),`missing #${id}`);
  }
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    assert.match(match[1],/\bsrc\s*=/,'extension scripts must use CSP-safe external files');
    assert.equal(match[2].trim(),'');
  }
  assert.match(app,/label:'Research with Reach',sub:'[^']+',disabled:!hasText,onclick:safe\(runResearch\)/);
  assert.match(app,/\$\('reachStop'\)\.onclick/);
});

test('manifest declares native messaging once and the runner disables hosted search',()=>{
  const manifest=JSON.parse(manifestText);
  assert.equal(manifest.permissions.filter(permission=>permission==='nativeMessaging').length,1);
  assert.match(app,/const cfg=\{\.\.\.config\(\),search:false\}/);
  assert.match(app,/confirm:reviewReachRequest/);
  assert.match(app,/setTimeout\(\(\)=>controller\.abort\(\),600000\)/);
  assert.match(app,/answer\.sources=result\.sources/);
  assert.match(app,/answer\.researchTrace=result\.trace/);
  assert.match(app,/answer\.activity\.push/);
  assert.match(app,/await save\(\);/);
});

test('Reach settings and review contain no credential inputs or connectivity claims',()=>{
  const panel=html.match(/<section data-settings-panel="reach"[\s\S]*?<\/section>/)?.[0]||'';
  assert.ok(panel);
  assert.doesNotMatch(panel,/<input\b/i);
  assert.match(panel,/not a connectivity, account, or login-health check/);
  assert.match(app,/async function refreshReachStatus/);
  assert.match(app,/Declared capabilities refreshed/);
  assert.match(app,/chrome\.runtime\.id/);
  assert.match(app,/replace\(/);
});
