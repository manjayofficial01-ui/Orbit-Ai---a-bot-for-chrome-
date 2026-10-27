import test from 'node:test';
import assert from 'node:assert/strict';

// The workspace lives in extension storage, so the module is imported against a stub.
// This is the closest the suite can get to the real path without a browser; the page-side
// secret write is a page function and is covered by the static gates instead.
const store = new Map();
globalThis.chrome = {
  storage: {
    local: {
      async get(key) { return store.has(key) ? { [key]: store.get(key) } : {}; },
      async set(patch) { for (const [k, v] of Object.entries(patch)) store.set(k, v); },
    },
  },
};

const { WORKSPACE_KEY, WORKSPACE_LIMITS, listWorkspaceFiles, readWorkspaceFile, writeWorkspaceFile } =
  await import('../dist/agent-run.js');

test.beforeEach(() => store.clear());

test('a written file can be listed and read back', async () => {
  const saved = await writeWorkspaceFile('notes.md', 'call Jules about the glaze');
  assert.equal(saved.ok, true);
  assert.deepEqual(await listWorkspaceFiles(), ['notes.md (26 chars)']);
  assert.equal(await readWorkspaceFile('notes.md'), 'call Jules about the glaze');
});

test('an empty workspace lists nothing and reads nothing', async () => {
  assert.deepEqual(await listWorkspaceFiles(), []);
  assert.equal(await readWorkspaceFile('notes.md'), null);
});

test('a missing file reads as null, not as an error or an empty string', async () => {
  await writeWorkspaceFile('notes.md', 'x');
  assert.equal(await readWorkspaceFile('other.md'), null);
});

test('writing the same name updates rather than duplicating', async () => {
  await writeWorkspaceFile('notes.md', 'first');
  const second = await writeWorkspaceFile('notes.md', 'second');
  assert.match(second.detail, /^updated/);
  assert.equal(await readWorkspaceFile('notes.md'), 'second');
  assert.equal((await listWorkspaceFiles()).length, 1);
});

test('a filename that could escape the workspace is refused', async () => {
  for (const name of ['../outside.txt', 'a/b.txt', 'a\\b.txt', '', '   ']) {
    const result = await writeWorkspaceFile(name, 'x');
    assert.ok(result.error, `${JSON.stringify(name)} must be refused`);
  }
});

test('the per-file and total caps are enforced', async () => {
  const tooBig = await writeWorkspaceFile('big.txt', 'x'.repeat(WORKSPACE_LIMITS.fileChars + 1));
  assert.match(tooBig.error, /limit for one file/);
  let filled = 0;
  for (let i = 0; i < WORKSPACE_LIMITS.files; i++) {
    const result = await writeWorkspaceFile(`f${i}.txt`, 'x'.repeat(WORKSPACE_LIMITS.fileChars));
    if (result.ok) filled++;
  }
  const extra = await writeWorkspaceFile('overflow.txt', 'x');
  assert.ok(extra.error, 'the workspace must refuse a file past its caps');
  assert.ok(filled <= WORKSPACE_LIMITS.files);
});

test('the workspace never escapes its own storage key', async () => {
  await writeWorkspaceFile('notes.md', 'x');
  assert.deepEqual([...store.keys()], [WORKSPACE_KEY]);
});
