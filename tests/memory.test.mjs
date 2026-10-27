import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEMORY_LIMITS, MEMORY_BANNER, memoryKey, sanitizeMemory,
  configureMemory, loadMemories, addMemory, confirmMemory, forgetMemory, memoryContext,
} from '../src/memory.js';

// The memory store is wired to injected persistence, so the tests give it a Map-backed
// host: the same contract app.js wires to chrome.storage.local through writeLocal().
function memoryHost() {
  const backing = new Map();
  const store = new Map();
  configureMemory({
    load: async () => JSON.parse(backing.get('list') || '[]'),
    persist: async (list) => { backing.set('list', JSON.stringify(list)); },
  });
  return { backing, store };
}

test('memoryKey normalizes case and whitespace, like the dedupe digest upstream', () => {
  assert.equal(memoryKey('  Prefers   DARK mode '), memoryKey('prefers dark mode'));
  assert.notEqual(memoryKey('prefers dark mode'), memoryKey('prefers light mode'));
  assert.equal(memoryKey(''), '');
});

test('sanitizeMemory rejects empty and oversized content, and shapes the record', () => {
  assert.ok(sanitizeMemory({ content: '' }).error);
  assert.ok(sanitizeMemory({ content: 'x'.repeat(MEMORY_LIMITS.contentChars + 1) }).error);
  const clean = sanitizeMemory({ content: 'Prefers dark mode', provenance: 'Observed on example.com', formedBy: 'operator' });
  assert.ok(clean.record);
  assert.equal(clean.record.reviewState, 'unreviewed', 'an operator-formed memory starts unreviewed');
  assert.equal(clean.record.formedBy, 'operator');
  const person = sanitizeMemory({ content: 'Owns a kayak', formedBy: 'person' });
  assert.equal(person.record.reviewState, 'confirmed', 'a person-entered memory needs no review');
  assert.equal(person.record.provenance, 'You');
  assert.ok(clean.record.provenance.length <= MEMORY_LIMITS.provenanceChars);
});

test('addMemory dedupes on content and enforces the count cap', async () => {
  memoryHost();
  const first = await addMemory({ content: 'Prefers dark mode', provenance: 'You', formedBy: 'person' });
  assert.equal(first.ok, true);
  assert.equal(first.duplicate, false);
  const dupe = await addMemory({ content: 'PREFERS   dark MODE', provenance: 'You', formedBy: 'person' });
  assert.equal(dupe.ok, true);
  assert.equal(dupe.duplicate, true, 're-observing the same fact is a no-op');
  const list = await loadMemories();
  assert.equal(list.length, 1);
  for (let i = 0; i < MEMORY_LIMITS.count; i++) await addMemory({ content: 'Fact number ' + i + ' unique', formedBy: 'person' });
  const full = await addMemory({ content: 'One more unique fact', formedBy: 'person' });
  assert.ok(full.error, 'the 40-memory cap must refuse new entries');
  const rejected = await addMemory({ content: '', formedBy: 'person' });
  assert.ok(rejected.error);
});

test('confirm and forget work by id and refuse unknown ids', async () => {
  memoryHost();
  const added = await addMemory({ content: 'Deadline is Friday', provenance: 'Observed during a task', formedBy: 'operator' });
  const list = await loadMemories();
  assert.equal(list[0].reviewState, 'unreviewed');
  await confirmMemory(list[0].id);
  assert.equal((await loadMemories())[0].reviewState, 'confirmed');
  await forgetMemory(list[0].id);
  assert.equal((await loadMemories()).length, 0);
  assert.ok((await confirmMemory('nope')).error);
  assert.ok((await forgetMemory('nope')).error);
});

test('memoryContext injects under the untrusted-data banner within the budget', async () => {
  memoryHost();
  assert.equal(memoryContext([]), '', 'no memories, no banner');
  await addMemory({ content: 'Prefers dark mode', provenance: 'You', formedBy: 'person' });
  await addMemory({ content: 'Reports are due the first Monday', provenance: 'Observed during a task', formedBy: 'operator' });
  const context = memoryContext(await loadMemories());
  assert.ok(context.startsWith(MEMORY_BANNER), 'the banner must lead, framing records as data');
  assert.match(context, /Prefers dark mode/);
  assert.match(context, /source/);
  const parsed = JSON.parse(context.slice(MEMORY_BANNER.length + 1));
  assert.equal(parsed.length, 2);
  assert.ok(parsed.every((r) => r.id && r.source && r.content));
  const long = Array.from({ length: 200 }, (_, i) => ({ id: 'm' + i, content: 'Fact ' + i + ' '.repeat(50), provenance: 'x' }));
  const budgeted = memoryContext(long);
  assert.ok(budgeted.length <= MEMORY_LIMITS.injectBudget + MEMORY_BANNER.length + 200, 'the injection budget is enforced');
  const disabled = memoryContext([{ id: '1', content: 'hidden fact', enabled: false }]);
  assert.equal(disabled, '', 'a paused memory is not injected');
});
