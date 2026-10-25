import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const [html,pageAccess]=await Promise.all([
  readFile(new URL('dist/index.html',root),'utf8'),
  readFile(new URL('src/page-access.js',root),'utf8')
]);

const controls=[...html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)].map(m=>({tag:m[1].toLowerCase(),attrs:m[2]}));
const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));

test('every form control has an accessible name',()=>{
  assert.ok(controls.length>=8,'expected to find the composer and settings controls');
  const labelBlocks=[...html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/gi)].map(m=>m[1]);
  for(const control of controls){
    const id=/\bid="([^"]+)"/.exec(control.attrs)?.[1];
    const hasAriaLabel=/\baria-label=/.test(control.attrs);
    const hidden=/\bhidden\b/.test(control.attrs);
    const wrapped=id&&labelBlocks.some(block=>block.includes(`id="${id}"`));
    assert.ok(hasAriaLabel||hidden||wrapped,`#${id||control.tag} lacks label/aria-label`);
  }
});

test('dialogs and aria-labelledby targets resolve',()=>{
  const dialogs=[...html.matchAll(/<dialog\b([^>]*)>/gi)].map(m=>m.attrs=m[1]);
  assert.ok(dialogs.length>=3,'expected settings, reach review and context dialogs');
  for(const attrs of dialogs){
    const labelledBy=/\baria-labelledby="([^"]+)"/.exec(attrs)?.[1];
    assert.ok(labelledBy,'dialog missing aria-labelledby');
    assert.ok(ids.has(labelledBy),`aria-labelledby target #${labelledBy} not found`);
  }
  for(const ref of html.matchAll(/\baria-labelledby="([^"]+)"/g))assert.ok(ids.has(ref[1]),`aria-labelledby target #${ref[1]} not found`);
});

test('buttons and icon controls expose names; landmarks labelled',()=>{
  const buttons=[...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];
  assert.ok(buttons.length>=20);
  for(const [,attrs,text] of buttons){
    const named=/\baria-label=/.test(attrs)||text.replace(/<[^>]*>/g,'').trim().length>0;
    assert.ok(named,'icon button without aria-label or text');
  }
  for(const ref of html.matchAll(/\baria-label="([^"]+)"/g))assert.ok(ref[1].trim().length>0,'empty aria-label');
  assert.match(html,/<main>/);
  assert.match(html,/role="status"/);
});

test('the conversation is not a live region; status stays the announced channel',()=>{
  const messages=/<section\b[^>]*\bid="messages"[^>]*>/.exec(html)?.[0]||'';
  assert.ok(messages.length>0,'conversation region is missing');
  assert.doesNotMatch(messages,/aria-live/,'renderMessages rebuilds every message on each paint; a live region would re-announce the whole conversation');
  assert.match(html,/<div id="status" role="status" aria-live="polite"><\/div>/,'progress and completion must still be announced');
});

test('every aria-label sits on something that can actually carry a name',()=>{
  const labelled=[...html.matchAll(/<(\w+)\b([^>]*\baria-label="[^"]+"[^>]*)>/g)];
  assert.ok(labelled.length>=12,'expected labelled controls and regions');
  const nameable=new Set(['input','select','textarea','button','a','svg','img','section','nav','main','aside','form','fieldset','dialog','legend','label','summary']);
  for(const [,tag,attrs] of labelled){
    const hasRole=/\brole="([^"]+)"/.test(attrs);
    assert.ok(hasRole||nameable.has(tag.toLowerCase()),`<${tag}> carries aria-label but no role, so assistive tech ignores the name`);
  }
});

test('the shortcut hint is a stable element the app can localise per platform',()=>{
  assert.match(html,/<kbd id="newKbd">Ctrl\+K<\/kbd>/,'the default hint must match the non-Mac binding');
  assert.match(html,/aria-label="Message"/);
});

test('dynamic page-tools dialog is programmatically named',()=>{
  assert.match(pageAccess,/aria-labelledby/);
  assert.match(pageAccess,/pageTitleTools/);
  for(const label of ['Target webpage','Target editable field','Page text preview','Replacement text'])assert.ok(pageAccess.includes(`'${label}'`),`missing aria-label ${label}`);
});
