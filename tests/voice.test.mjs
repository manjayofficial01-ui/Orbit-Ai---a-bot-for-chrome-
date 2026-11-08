import test from 'node:test';
import assert from 'node:assert/strict';
import {plainSpeech, speechAvailable, speak, stopSpeaking, voices, isSpeaking} from '../dist/voice.js';

test('markdown is turned into something a person would say',()=>{
  const spoken=plainSpeech('## Heading\n\nSome **bold** and *italic* text with a [link](https://example.com).');
  assert.doesNotMatch(spoken,/#|\*{1,2}|\[|\]/,'markdown markers must not be read aloud');
  assert.match(spoken,/Heading/);
  assert.match(spoken,/bold/);
  assert.match(spoken,/example\.com/,'a link keeps its destination, because it is the part worth hearing');
});

test('code is announced, never spelled out',()=>{
  const spoken=plainSpeech('Here:\n\n```js\nconst x = 1;\n```\n\nThat is all.');
  assert.match(spoken,/code block/);
  assert.doesNotMatch(spoken,/const x/);
});

test('lists and table pipes lose their punctuation',()=>{
  const spoken=plainSpeech('- one\n- two\n\n| a | b |\n| --- | --- |\n| 1 | 2 |');
  assert.doesNotMatch(spoken,/\|/);
  assert.doesNotMatch(spoken,/^\s*-\s/m);
  assert.match(spoken,/one two/);
});

test('speech is bounded so one long answer cannot lock the engine',()=>{
  assert.ok(plainSpeech('word '.repeat(4000)).length<=4000);
  assert.equal(plainSpeech(''),'');
  assert.equal(plainSpeech(null),'');
});

test('without a speech engine the module reports itself unavailable instead of throwing',async()=>{
  const had=Object.prototype.hasOwnProperty.call(globalThis,'speechSynthesis');
  const saved=globalThis.speechSynthesis;
  delete globalThis.speechSynthesis;
  try{
    assert.equal(speechAvailable(),false);
    assert.deepEqual(voices(),[]);
    assert.equal(await speak('hello'),false);
    assert.equal(isSpeaking(),false);
    stopSpeaking();
  }finally{
    if(had)globalThis.speechSynthesis=saved;
  }
});
