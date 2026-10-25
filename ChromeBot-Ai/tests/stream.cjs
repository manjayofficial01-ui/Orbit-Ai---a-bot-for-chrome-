// Streaming regressions: reasoning must never masquerade as the answer.
// Mirrors panel.js body() -> plan() -> take() so a regression here means a
// regression in the panel. Run: node tests/stream.cjs
const C = require('../core.js');
let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? pass++ : (fail++, console.log('FAIL', name)) };

const o = {
  url: 'https://shop.example.com/p/1',
  controls: [
    { ref: 'e1', tag: 'button', label: 'Add to cart' },
    { ref: 'e2', tag: 'a', label: 'Reviews', href: 'https://shop.example.com/p/1/reviews' }
  ],
  text: 'A product page.'
};

// ---- 1. reasoning must not leak into the answer stream ----
const geminiThought = { candidates: [{ content: { parts: [{ thought: true, text: 'Let me look at the page…' }] } }] };
ok('gemini thought is reasoning', C.deltaReason('gemini', geminiThought) === 'Let me look at the page…');
ok('gemini thought is NOT answer text', C.deltaText('gemini', geminiThought) === '');

const rcDelta = { choices: [{ delta: { reasoning_content: 'I should click Add to cart' } }] };
ok('reasoning_content is reasoning', C.deltaReason('cline', rcDelta) === 'I should click Add to cart');
ok('reasoning_content is NOT answer text', C.deltaText('cline', rcDelta) === '');

ok('gemini real content still flows', C.deltaText('gemini', { candidates: [{ content: { parts: [{ text: '{"action":"done"}' }] } }] }) === '{"action":"done"}');
ok('openai real content still flows', C.deltaText('compatible', { choices: [{ delta: { content: 'hi' } }] }) === 'hi');

// ---- 2. truncation detection ----
ok('gemini MAX_TOKENS', C.wasTruncated('gemini', { candidates: [{ finishReason: 'MAX_TOKENS' }] }) === true);
ok('openai length', C.wasTruncated('openai', { choices: [{ finish_reason: 'length' }] }) === true);
ok('openai stop is not truncation', C.wasTruncated('openai', { choices: [{ finish_reason: 'stop' }] }) === false);

// ---- 3. token budget must leave room after thinking ----
ok('auto budget leaves room', C.qualityParams('auto', 'openai', 'gpt-4o-mini').max_tokens >= 2048);
ok('max budget', C.qualityParams('max', 'openai', 'gpt-4o-mini').max_tokens >= 8192);
ok('gemini 2.5 thinking bounded', (C.geminiThinkingConfig('auto', 'gemini-2.5-flash', true).thinkingConfig?.thinkingBudget || 0) > 0);
ok('gemini 2.5 thinking share < half', C.geminiThinkingConfig('auto', 'gemini-2.5-flash', true).thinkingConfig.thinkingBudget
  < C.qualityParams('auto', 'gemini', 'gemini-2.5-flash').max_tokens / 2);
ok('gemini thinking off = budget 0', C.geminiThinkingConfig('auto', 'gemini-2.5-flash', false).thinkingConfig.thinkingBudget === 0);
ok('gemini 1.5 gets no thinking knob', Object.keys(C.geminiThinkingConfig('auto', 'gemini-1.5-pro', true)).length === 0);

// ---- pipeline model (same shape as panel.js) ----
const IDLE_MS = 5; // scaled-down stand-in for the panel's 320ms
const sleep = n => new Promise(r => setTimeout(r, n));
const sseLine = obj => 'data: ' + JSON.stringify(obj) + '\n\n';

async function* body(chunks, provider, probe, gap = 0) {
  let rest = '';
  for (const c of chunks) {
    if (gap) await sleep(gap);
    const p = C.sse(c, rest); rest = p.rest;
    for (const e of p.events) {
      const reason = C.deltaReason(provider, e);
      if (reason) probe.thought += reason;
      if (C.wasTruncated(provider, e)) probe.truncated = true;
      const t = C.deltaText(provider, e);
      if (t) { probe.content += t; yield t }
    }
  }
}
async function* plan(chunks, provider, probe, job, gap = 0) {
  let text = '', seen = 0;
  for await (const d of body(chunks, provider, probe, gap)) {
    text += d;
    if (job) job.streamText = text;
    const s = C.streamSteps(text, o, seen);
    seen = s.total;
    for (const a of s.steps) { yield a; if (a.action === 'done') return }
    if (s.sawDone) return
  }
  if (seen) return;
  if (!probe.content.trim()) {
    throw Object.assign(Error(probe.truncated
      ? 'The model spent its whole reply budget on reasoning and answered nothing.'
      : 'The model returned reasoning but no answer text.'), { thoughtOnly: true })
  }
  C.plan(text, o)
}
async function drainTail(gen, sink, pending) {
  let r = null;
  try {
    r = await pending;
    for (; ;) {
      if (r.done) break;
      if (r.value) { sink.push(r.value); if (r.value.action === 'done') break }
      r = await gen.next()
    }
  } catch { }
  finally { try { gen.return?.().catch(() => { }) } catch { } }
}
async function take(gen, max, hold) {
  const out = [], tail = [];
  let draining = null, pending = gen.next();
  const shortcut = () => { draining = drainTail(gen, tail, pending) };
  try {
    for (; ;) {
      const r = await Promise.race([pending.then(v => ({ v }), e => ({ e })), sleep(IDLE_MS).then(() => ({ idle: 1 }))]);
      if (r.idle) { if (out.length && !(hold && hold())) { shortcut(); break } continue }
      if (r.e) throw r.e;
      if (r.v.done) break;
      out.push(r.v.value);
      if (out.length >= max) { shortcut(); break }
      if (r.v.value.action === 'done') break;
      pending = gen.next()
    }
  } finally {
    if (!draining) { try { gen.return?.().catch(() => { }) } catch { } }
  }
  return { steps: out, tail: async () => { if (draining) await draining; return tail } }
}
const lateClosing = async got => (await got.tail()).find(a => a && a.action === 'done') || null;

(async () => {
  // 4. THE BUG: a thought that quotes JSON must not become a real step.
  const geminiDraft = [
    sseLine({ candidates: [{ content: { parts: [{ thought: true, text: 'Drafting: {"action":"done"}' }] } }] }),
    sseLine({ candidates: [{ content: { parts: [{ text: '{"plan":["read"],"actions":[{"action":"done","value":"It is a blue widget."}]}' }] } }] })
  ];
  const p4 = { content: '', thought: '', truncated: false };
  const g4 = await take(plan(geminiDraft, 'gemini', p4, {}), 6);
  const a4 = g4.steps;
  const d4 = a4.find(a => a.action === 'done');
  ok('thought-drafted JSON is not executed', a4.length === 1 && d4 && d4.value === 'It is a blue widget.');
  ok('answer survives a thinking model', !!d4 && d4.value.length > 0);

  // 5. Thinking that ate the whole budget is reported as a budget problem.
  const starved = [
    sseLine({ candidates: [{ content: { parts: [{ thought: true, text: 'The user wants a summary. ' }] } }] }),
    sseLine({ candidates: [{ content: { parts: [{ thought: true, text: 'I should return done. ' }] } }] }),
    sseLine({ candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] })
  ];
  const p5 = { content: '', thought: '', truncated: false };
  let e5 = null;
  try { await take(plan(starved, 'gemini', p5, {}), 6) } catch (e) { e5 = e }
  ok('thinking-only stream is flagged', !!e5 && e5.thoughtOnly === true);
  ok('thinking-only message explains why', !!e5 && /budget|reasoning/i.test(e5.message));
  ok('thinking was still captured for display', p5.thought.includes('summary'));

  // 6. A slow `done` must not be dropped by the early-action shortcut.
  const slow = [
    sseLine({ choices: [{ delta: { content: '{"plan":["read"],"actions":[{"action":"click","ref":"e2"},{"action":"don' } }] }),
    sseLine({ choices: [{ delta: { content: 'e","value":"Reviews average 4.2 stars."}]}' } }] })
  ];
  const p6 = { content: '', thought: '', truncated: false }, j6 = {};
  const g6 = await take(plan(slow, 'cline', p6, j6, 40), 6,
    () => /"action"\s*:\s*"done"/.test(j6.streamText || ''));
  ok('shortcut still fires early', g6.steps.length === 1 && g6.steps[0].action === 'click');
  const d6 = await lateClosing(g6);
  ok('late done is not dropped', !!d6 && d6.value === 'Reviews average 4.2 stars.');

  // 7. The shortcut still works when no `done` is coming.
  const clickOnly = [sseLine({ choices: [{ delta: { content: '{"plan":["click"],"actions":[{"action":"click","ref":"e2"}]}' } }] })];
  const p7 = { content: '', thought: '', truncated: false }, j7 = {};
  const g7 = await take(plan(clickOnly, 'cline', p7, j7, 40), 6,
    () => /"action"\s*:\s*"done"/.test(j7.streamText || ''));
  ok('plain click batch still returns', g7.steps.length >= 1 && g7.steps[0].action === 'click');
  ok('no phantom done when none was written', (await lateClosing(g7)) === null);

  // 8. Healthy reasoning model: reasoning shown, answer intact.
  const healthy = [
    sseLine({ choices: [{ delta: { reasoning_content: 'Reading the page…' } }] }),
    sseLine({ choices: [{ delta: { content: '{"plan":["read"],"actions":[{"action":"done","value":"A blue widget for $19."}]}' } }] })
  ];
  const p8 = { content: '', thought: '', truncated: false };
  const g8 = await take(plan(healthy, 'cline', p8, {}), 6);
  ok('reasoning captured separately', p8.thought.includes('Reading the page'));
  ok('answer not polluted by reasoning', !p8.content.includes('Reading the page'));
  ok('healthy answer intact', g8.steps.find(a => a.action === 'done')?.value === 'A blue widget for $19.');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
