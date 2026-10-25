// Side panel: the controller. Owns the agent loop, multi-tab power, approvals,
// memory/history/schedules, screenshots and exports. Rendering is delegated to CBUI.
//
// Invariants kept from 2.1: loop lives in this document (MV3 kills idle workers),
// no setTimeout waits for page state, one streamed plan per round, every remote call
// owned by an AbortController, explicit frameIds, early action on stream.
(() => {
  const U = window.CBUI, C = CBCore, $ = U.h ? id => document.getElementById(id) : null;
  const MAX_ROUNDS = 14, MAX_STEPS = 60, PLAN_MS = 45000, TOTAL_MS = 8 * 60000, IDLE_MS = 320, STEPS_MAX = 6, FIX_MAX = 2;
  const NAME = {
    gemini: 'Gemini', nvidia: 'NVIDIA', openai: 'OpenAI', groq: 'Groq', openrouter: 'OpenRouter',
    cline: 'Cline', clinepass: 'ClinePass', compatible: 'Provider'
  };
  const Crew = globalThis.CBCrew;
  let cfg = { ...C.DEFAULTS };
  let keys = { gemini: '', nvidia: '', openai: '', groq: '', openrouter: '', cline: '', clinepass: '', compatible: '', jev: '' };
  let store = { cbMemory: [], cbHistory: [], cbSchedules: [], cbSites: {}, cbQueue: [] };
  let busy = false, stopped = false, ctl = null, job = null, rec = null;
  let jevDown = false, jevFails = 0;
  const jevCache = new Map(), framesCache = new Map(), parts = new Map();
  const approvals = new Set(); // signatures already approved "always on this site"

  // ---------- storage ----------
  const pull = async () => {
    const [l, s] = await Promise.all([
      chrome.storage.local.get(['cbConfig', 'cbMemory', 'cbHistory', 'cbSchedules', 'cbSites', 'cbQueue', 'cbOnboarded', 'cbCompact']),
      chrome.storage.session.get(['cbKeys', 'cbJob', 'cbSeed'])
    ]);
    cfg = C.config(l.cbConfig || null);
    keys = { ...keys, ...s.cbKeys };
    store = {
      cbMemory: l.cbMemory || [], cbHistory: l.cbHistory || [], cbSchedules: l.cbSchedules || [],
      cbSites: l.cbSites || {}, cbQueue: l.cbQueue || [], cbOnboarded: l.cbOnboarded || false,
      cbCompact: l.cbCompact || false
    };
    return { l, s }
  };
  const save = (k, v) => chrome.storage.local.set({ [k]: v }).catch(() => { });

  // ---------- chrome powers via the worker ----------
  function power(name, args) {
    return new Promise((res, rej) => {
      chrome.runtime.sendMessage({ kind: 'POWER', power: name, args }, r => {
        void chrome.runtime.lastError;
        r?.ok ? res(r.data) : rej(Error(r?.error || name + ' failed'))
      })
    })
  }
  async function downloadText(filename, text) {
    const url = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(text);
    await power('download', { dataUrl: url, filename })
  }
  async function exportRows(rows, format) {
    const url = C.exportDataUrl(rows, format);
    await power('download', { dataUrl: url, filename: 'chromebot-extract.' + format })
  }

  // ---------- tab, frames, bridge (2.1 logic, kept) ----------
  async function current() {
    const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!t?.id) throw Error('No active tab');
    return t
  }
  async function getTab(id) {
    const t = await chrome.tabs.get(id);
    if (!/^https?:/.test(t.url || '')) throw Error('Open a normal website (http or https) first');
    return t
  }
  function paint(t) {
    U.setSite(/^https?:/.test(t.url || '') ? String(t.title || t.url).replace(/^https?:\/\//, '').slice(0, 40) : 'not a web page', t.url || '');
  }
  const healed = new Set();
  async function send(tabId, frameId, msg) {
    const opt = { frameId };
    try { return await chrome.tabs.sendMessage(tabId, msg, opt) } catch { }
    if (healed.has(tabId)) throw Error('No agent bridge in frame ' + frameId + '.');
    healed.add(tabId);
    try { await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['core.js', 'page.js'] }) } catch { }
    try { return await chrome.tabs.sendMessage(tabId, msg, opt) }
    catch { throw Error('This page has no agent bridge. Reload the tab and run again.') }
  }
  async function frameIds(tabId) {
    if (framesCache.has(tabId)) return framesCache.get(tabId);
    let ids = [0];
    try {
      const f = await chrome.webNavigation.getAllFrames({ tabId });
      ids = [...new Set(f.map(x => x.frameId))].sort((a, b) => a - b).slice(0, 6)
    } catch { }
    if (!ids.includes(0)) ids.unshift(0);
    framesCache.set(tabId, ids);
    return ids
  }
  const grow = (id, ref) => id ? 'f' + id + '_' + ref : ref;
  function merge(from = parts) {
    const list = [...from.values()].sort((a, b) => (a.id === 0 ? -1 : b.id === 0 ? 1 : a.id - b.id));
    if (!list.length) throw Error('The page did not respond. Reload it and run again.');
    const controls = [];
    for (const p of list) {
      const quota = p.id === 0 ? 60 : 16;
      let n = 0;
      for (const c of p.o.controls) {
        if (n >= quota || controls.length >= 60) break;
        controls.push({ ...c, ref: grow(p.id, c.ref), frame: p.id });
        n++
      }
    }
    const top = list.find(p => !p.id) || list[0];
    return { ...top.o, controls, frameCount: list.length, frames: list.map(p => ({ id: p.id, url: p.o.url })) }
  }
  async function observe(tabId, force, scratch) {
    const ids = await frameIds(tabId);
    const out = scratch ? new Map() : parts;
    const got = await Promise.allSettled(ids.map(async id => {
      const r = await send(tabId, id, { kind: 'OBS', force });
      if (!r?.ok) throw Error(r?.error || 'page refused');
      return { id, o: r.data }
    }));
    const dead = [];
    got.forEach((g, i) => { if (g.status === 'fulfilled') out.set(ids[i], g.value); else if (ids[i]) dead.push(ids[i]) });
    if (scratch) return merge(out);
    dead.forEach(id => parts.delete(id));
    if (dead.length && ids.length > dead.length) framesCache.set(tabId, ids.filter(x => !dead.includes(x)));
    if (!parts.size) throw Error('The page did not respond. Reload it and run again.');
    return merge()
  }

  // ---------- HTTP (2.1 logic, kept) ----------
  class Http extends Error { }
  const http = (msg, status) => Object.assign(new Http(msg), { status });
  const sleep = n => new Promise(r => setTimeout(r, n));
  async function open(url, init, retry) {
    for (let i = 0; ; i++) {
      let r;
      try { r = await fetch(url, init) } catch (e) {
        if (e.name === 'AbortError') throw e;
        throw http('Could not reach ' + new URL(url).origin, 0)
      }
      if (r.ok) return r;
      const t = await r.text().catch(() => '');
      let d; try { d = JSON.parse(t) } catch { d = { raw: t } }
      const status = r.status;
      // Surface the provider's real error (Cline wraps it under error.message / error).
      const friendly = C.providerError(cfg.provider, status, d, t || ('HTTP ' + status));
      // Upstream empty/rate-limit 500s are often transient — retry once for Cline.
      const transient = status === 500 && /empty response|rate.?limit|429/i.test(String(friendly.message || t));
      const wait = retry && i < (transient ? 1 : 2) ? C.retryIn(status, i) || (transient ? 1200 : 0) : 0;
      if (wait) {
        U.hint(friendly.message.slice(0, 80) + ' · retrying…');
        await sleep(wait);
        continue
      }
      throw Object.assign(http(friendly.message, status), { data: d, text: t, cause: friendly })
    }
  }
  async function json(url, init) {
    const r = await open(url, { ...init, headers: { ...(init.headers || {}), Accept: 'application/json' } });
    const t = await r.text();
    try { return JSON.parse(t || '{}') } catch { throw http('Provider returned non-JSON: ' + t.slice(0, 120), 0) }
  }
  // `probe` collects what the stream produced *besides* the answer text: the reasoning
  // (kept out of the action parser) and whether the reply was cut off mid-flight.
  const newProbe = () => ({ content: '', thought: '', truncated: false });
  async function* body(res, provider, probe) {
    const type = res.headers.get('content-type') || '';
    if (!type.includes('event-stream') || !res.body) {
      const t = await res.text();
      let d; try { d = JSON.parse(t || '{}') } catch { throw http('Provider returned non-JSON: ' + t.slice(0, 120), 0) }
      probe.thought += C.deltaReason(provider, d) || '';
      probe.truncated = C.wasTruncated(provider, d);
      const one = C.deltaText(provider, d);
      if (one) probe.content += one;
      yield one; return
    }
    const rd = res.body.getReader(), dec = new TextDecoder();
    let rest = '';
    for (; ;) {
      const { value, done } = await rd.read();
      if (done) break;
      const p = C.sse(dec.decode(value, { stream: true }), rest);
      rest = p.rest;
      for (const e of p.events) {
        // Surface chain-of-thought when the provider streams it (NIM / some OpenAI-compatible).
        const reason = C.deltaReason(provider, e);
        if (reason) {
          probe.thought += reason;
          if (cfg.thinking !== false) U.feed.think(String(reason).trim().slice(0, 220))
        }
        if (C.wasTruncated(provider, e)) probe.truncated = true;
        const t = C.deltaText(provider, e);
        if (t) { probe.content += t; yield t }
      }
    }
  }

  // ---------- planner ----------
  async function* deltas(o, signal, shot, probe) {
    const provider = cfg.provider, key = keys[provider] || '', base = C.endpoint(cfg);
    const custom = C.needsCustomBase(provider);
    const cline = C.isCline?.(provider);
    if (!key && provider !== 'compatible') {
      if (cline) throw Error('Cline API key missing. Sign in at app.cline.bot → Settings → API Keys, then paste the key in Settings.');
      throw Error(NAME[provider] + ' key missing. Open Settings.');
    }
    if (cline && !cfg.model) throw Error('Pick a Cline model (e.g. minimax/minimax-m2.5 free, or cline-pass/kimi-k3).');
    // Skill + crew awareness in the system prompt.
    const skill = Crew?.matchSkill?.(job.task);
    let sys = C.PROMPT;
    if (skill && Crew?.crewSystem) sys = Crew.crewSystem(C.PROMPT, 'actor', skill);
    if (job.criticNote) sys += '\n\nCRITIC NOTES: ' + String(job.criticNote).slice(0, 300);
    const user = C.prompt(job.task, o, job.history, job.fix);
    if (provider === 'gemini') {
      const parts = [{ text: user }];
      if (shot) {
        const [meta, b64] = splitDataUrl(shot);
        parts.push({ inline_data: { mime_type: meta, data: b64 } })
      }
      const gq = C.qualitySpec(cfg.quality || 'auto');
      // Thinking is metered out of maxOutputTokens on 2.5+, so bound it — otherwise the
      // model spends the whole budget reasoning and emits no answer at all.
      const think = C.geminiThinkingConfig(cfg.quality || 'auto', cfg.model, job?.noThink ? false : cfg.thinking);
      const url = base + '/models/' + encodeURIComponent(cfg.model) + ':streamGenerateContent?alt=sse';
      const headers = C.mergeHeaders({ 'Content-Type': 'application/json', 'x-goog-api-key': key }, cfg.headers);
      const payload = tc => JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: gq.temperature ?? 0.1, maxOutputTokens: gq.maxTokens, ...tc }
      });
      try {
        yield* body(await open(url, { method: 'POST', signal, headers, body: payload(think) }, true), 'gemini', probe)
      } catch (e) {
        // Models without a thinking knob reject the field outright — retry once bare.
        if (!(e instanceof Http) || e.status !== 400 || !Object.keys(think).length) throw e;
        yield* body(await open(url, { method: 'POST', signal, headers, body: payload({}) }, true), 'gemini', probe)
      }
      return
    }
    let msgContent = user;
    const visionOK = cline || custom || ['nvidia', 'openai', 'openrouter'].includes(provider);
    if (shot && visionOK) {
      msgContent = [{ type: 'text', text: user }, { type: 'image_url', image_url: { url: shot } }]
    }
    // A "thinking ate the budget" retry turns reasoning off, so the model has to spend
    // its tokens on the answer instead.
    const qp = C.qualityParams(cfg.quality || 'auto', provider, cfg.model);
    if (job?.noThink) { delete qp.reasoning_effort; qp.max_tokens = Math.max(qp.max_tokens, 4096) }
    const payload = {
      model: cfg.model, stream: true, max_tokens: qp.max_tokens,
      messages: [{ role: 'system', content: sys }, { role: 'user', content: msgContent }]
    };
    if (qp.temperature != null) payload.temperature = qp.temperature;
    if (qp.reasoning_effort) payload.reasoning_effort = qp.reasoning_effort;
    const headers = C.mergeHeaders(
      { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: 'Bearer ' + key },
      cfg.headers
    );
    try {
      yield* body(await open(base + '/chat/completions', { method: 'POST', signal, headers, body: JSON.stringify(payload) }, true), provider, probe);
      return
    } catch (e) {
      if (shot) throw e; // don't fall back into a text-only retry with the same bad shot
      if (!(e instanceof Http) || !e.status || ![400, 404, 406, 415, 422].includes(e.status)) throw e;
    }
    const plain = { ...payload }; delete plain.stream; delete plain.reasoning_effort;
    if (custom || provider === 'openai') plain.response_format = { type: 'json_object' };
    const d = await json(base + '/chat/completions', { method: 'POST', signal, headers, body: JSON.stringify(plain) });
    probe.thought += C.deltaReason(provider, d) || '';
    probe.truncated = C.wasTruncated(provider, d);
    yield C.deltaText(provider, d)
  }
  const splitDataUrl = d => {
    const m = /^data:([^;]+);base64,(.*)$/.exec(d || '');
    return m ? [m[1], m[2]] : ['image/jpeg', '']
  };
  async function* plan(o, signal, shot, probe) {
    let text = '', seen = 0;
    for await (const d of deltas(o, signal, shot, probe)) {
      text += d;
      // Published so take() can tell "the model is mid-way through writing done" from
      // "the model has finished acting" — the idle shortcut must not eat the answer.
      if (job) job.streamText = text;
      const lines = C.streamPlan(text);
      if (lines.length && lines.length !== (job._planSeen || 0)) {
        job._planSeen = lines.length;
        U.live.setPlan(lines.slice((job._planDrawn || 0)))
        job._planDrawn = lines.length;
      }
      const s = C.streamSteps(text, o, seen);
      seen = s.total;
      for (const a of s.steps) { yield a; if (a.action === 'done') return }
      if (s.sawDone) return
    }
    if (seen) return;
    // Nothing parsable at all. Say *why* rather than dumping prose into a JSON error:
    // usually the model reasoned through its whole token budget and answered nothing.
    if (!probe.content.trim()) {
      throw Object.assign(Error(probe.truncated
        ? 'The model spent its whole reply budget on reasoning and answered nothing. Raise Model quality, or turn off “Show model reasoning” in Settings.'
        : 'The model returned reasoning but no answer text.'), { thoughtOnly: true })
    }
    C.plan(text, o)
  }
  // Whatever the stream is still writing after the early-action shortcut fires. Only a
  // trailing `done` matters — its value is the user's answer — but losing it means the
  // panel ends on a thinking block and nothing else, so keep draining in the background.
  // `pending` is the next() already in flight — it must be consumed first, or the step
  // it carries is orphaned and a fresh next() skips straight past it.
  async function drainTail(gen, sink, pending) {
    let r = null;
    try {
      r = await pending;
      for (; ;) {
        if (r.done) break;
        if (r.value) { sink.push(r.value); if (r.value.action === 'done') break }
        r = await gen.next()
      }
    } catch { /* a half-written stream is not worth surfacing */ }
    finally { try { gen.return?.().catch(() => { }) } catch { } }
  }
  // `hold` suppresses the early-action shortcut while a `done` is visibly in flight.
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

  // ---------- approval gate ----------
  async function askUser(req, a, o) {
    U.phase('ask');
    const t = o.controls.find(c => c.ref === a.ref);
    const detail = [t?.tag, t?.label, a.value && a.value.slice(0, 80)].filter(Boolean).join(' · ');
    const v = await U.feed.approval({ reason: req.reason, detail, host: host(o.url) });
    if (v === 'site') {
      try {
        const origin = new URL(o.url).origin;
        store.cbSites[origin] = { trust: 'trusted', at: Date.now() };
        await save('cbSites', store.cbSites);
        U.toast('Trusted ' + host(origin) + ' — fewer prompts here')
      } catch { }
    }
    return v
  }
  const host = u => { try { return new URL(String(u)).hostname } catch { return '' } };

  async function gate(o, a) {
    if (cfg.guard === 'off') return { ok: true, text: '' };
    const t = o.controls.find(c => c.ref === a.ref);
    const profile = C.siteProfile(store.cbSites, o.url);
    const trust = job.sensitive ? 'sensitive' : profile.trust;
    const req = C.approvalFor(a, t, o, cfg.guard, trust);
    if (!req) return { ok: true, text: '' };
    // Jev as a second opinion to display (advisory): strict keeps its fail-closed vote.
    let verdict = '';
    if (keys.jev && !jevDown && ['consequence', 'sensitive', 'cross-site'].includes(req.kind)) {
      try {
        const v = C.judgeVerdict(await json('https://api.typesafe.ai/v1/systemone', {
          method: 'POST', signal: AbortSignal.any([ctl.signal, AbortSignal.timeout(2500)]),
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + keys.jev },
          body: JSON.stringify(C.judgeBody(job.task, o, a))
        }));
        verdict = v.text;
        if (cfg.guard === 'strict' && !v.ok) return { ok: false, text: 'Jev blocked: ' + v.text }
      } catch (e) {
        if (e.name === 'AbortError' && stopped) throw e;
        if (++jevFails >= 2) jevDown = true
      }
    }
    const answer = await askUser(req, a, o);
    if (answer === 'stop') return { ok: false, text: 'You stopped ChromeBot.', stopped: true };
    if (!answer) return { ok: false, text: 'No answer given.' };
    a.approved = true;
    return { ok: true, text: verdict ? 'approved · ' + verdict : 'approved by you' }
  }

  // ---------- acting (2.1 core, plus tab routing) ----------
  function pack(o, a) {
    const t = o.controls.find(c => c.ref === a.ref) || {};
    const frame = t.frame || 0;
    return {
      action: a.action, id: a.ref,
      ref: frame && a.ref.startsWith('f') ? a.ref.slice(String('f' + frame + '_').length) : a.ref,
      value: a.value, frame,
      url: frame ? (o.frames.find(f => f.id === frame)?.url || '') : o.url,
      approved: !!a.approved,
      target: { tag: t.tag, type: t.type, label: t.label || '', href: t.href || '' }
    }
  }
  async function act(steps) {
    const groups = new Map();
    for (const s of steps) groups.set(s.frame, [...(groups.get(s.frame) || []), s]);
    const fast = steps.length > 1;
    const ran = [];
    let stop = '', reason = '';
    for (const [frame, list] of groups) {
      if (stopped) { stop = 'cancelled'; reason = 'stopped'; break }
      const r = await send(job.tabId, frame, { kind: 'ACT', fast, steps: list });
      if (!r?.ok) { stop = 'error'; reason = r?.error || 'the page rejected the action'; break }
      ran.push(...r.data.ran);
      if (r.data.observation) parts.set(frame, { id: frame, o: r.data.observation });
      if (r.data.stop) { stop = r.data.stop; reason = r.data.reason || stop; break }
    }
    return { ran, stop, reason, o: merge() }
  }
  // Tab-level actions run in the controller, not the page.
  async function tabAction(a, o) {
    if (a.action === 'goto') {
      await power('goto', { tabId: job.tabId, url: a.value });
      framesCache.delete(job.tabId); parts.clear();
      await settled(job.tabId, 12000);
      return 'Navigated to ' + host(a.value)
    }
    if (a.action === 'newtab') {
      const t = await power('openTab', { url: a.value, active: true });
      job.tabId = t.tabId;
      framesCache.delete(t.tabId); parts.clear();
      healed.delete(t.tabId);
      await settled(t.tabId, 12000);
      return 'Opened a new tab → ' + host(a.value)
    }
    if (a.action === 'activate') {
      const id = +a.value;
      await power('activateTab', { tabId: id });
      job.tabId = id; framesCache.delete(id); parts.clear();
      return 'Switched to tab #' + id
    }
    if (a.action === 'closetab') {
      const id = +a.value || job.tabId;
      await power('closeTab', { tabId: id });
      parts.clear();
      if (id === job.tabId) {
        const tabs = await power('listTabs', {});
        job.tabId = tabs[0]?.tabId;
        if (!job.tabId) throw Error('No tab left to act in');
        await power('activateTab', { tabId: job.tabId });
        framesCache.delete(job.tabId);
      }
      return 'Closed tab #' + id
    }
    if (a.action === 'screenshot') {
      const s = await power('screenshot', { tabId: job.tabId });
      U.feed.shot(s.dataUrl, 'What ChromeBot sees right now');
      job.shot = s.dataUrl; // grounds the next planning round (vision-capable models)
      return 'Screenshot taken — attached to the next planning step'
    }
    throw Error('Unknown tab action')
  }
  function settled(tabId, ms = 9000) {
    return new Promise(res => {
      const done = () => { clearTimeout(timer); res() };
      const timer = setTimeout(done, ms);
      chrome.tabs.get(tabId).then(t => { if (t.status === 'complete') done() }, done)
    })
  }

  // ---------- instant path (2.1 logic) ----------
  async function runFast(job, o, tab) {
    const plan0 = C.fast(job.task, o);
    if (!plan0) return 'none';
    let ran = 0, tail = 0;
    const pending = [];
    const flush = async () => {
      if (!pending.length) return true;
      const go = [];
      for (const a of pending) {
        const v = await gate(o, a);
        if (!v.ok) { U.feed.info('Stopped safely: ' + v.text); pending.length = 0; return false }
        go.push({ a, v: v.text, sig: C.signature(a, o) })
      }
      pending.length = 0;
      const before = C.state(o);
      const res = await act(go.map(hh => pack(o, hh.a)));
      const after = C.state(res.o);
      const byRef = new Map(go.map(hh => [hh.a.ref, hh]));
      res.ran.forEach(r => {
        const hh = byRef.get(r.id || r.ref);
        job.history.push({ sig: hh?.sig, action: r.action, reason: hh?.a?.reason || '', result: r.result, before, after });
        U.feed.info(r.result + ' · instant')
      });
      ran += res.ran.length;
      if (res.stop) { job.fix = (res.reason || res.stop); U.feed.bad('⚠ ' + (res.reason || res.stop) + ' — thinking instead'); return false }
      return true
    };
    for (let i = 0; i < plan0.length; i++) {
      const s = plan0[i];
      if (s.kind === 'tab') {
        if (!await flush()) return ran ? 'partial' : 'none';
        if (stopped) return 'partial';
        const more = plan0.slice(i + 1).some(x => x.kind === 'act' || x.kind === 'tab');
        framesCache.delete(tab.id); parts.clear();
        const done = more ? settled(tab.id) : null;
        if (s.op === 'reload') await chrome.tabs.reload(tab.id);
        else if (s.op === 'back') await chrome.tabs.goBack(tab.id);
        else await chrome.tabs.goForward(tab.id);
        if (done) await done;
        U.feed.info(s.word + ' · instant');
        ran++;
        tail = plan0.length - i - 1;
        continue
      }
      let a;
      try { a = C.action(s.a, o) } catch { return 'none' }
      pending.push(a)
    }
    if (!await flush()) return ran ? 'partial' : 'none';
    return tail ? 'partial' : 'all'
  }

  // ---------- the loop ----------
  function round0() {
    const c = new AbortController();
    const parent = ctl.signal;
    const kill = e => c.abort(e || new DOMException('Stopped', 'AbortError'));
    parent.addEventListener('abort', () => kill(parent.reason), { once: true });
    const timer = setTimeout(() => { c.timedOut = 1; kill(Error('planner deadline')) }, PLAN_MS);
    return {
      signal: c.signal, timedOut: () => !!c.timedOut,
      end() { clearTimeout(timer); kill(Error('round over')) }
    }
  }
  const checkpoint = () => chrome.storage.session.set({ cbJob: job }).catch(() => { });
  // History row for the run in flight. Module scope because finish() closes it from
  // outside run(); hid stays null until a run adds its row.
  let hid = null;
  let answerShown = false;
  const patchHist = p => {
    if (!hid) return;
    store.cbHistory = C.historyPatch(store.cbHistory, hid, p);
    save('cbHistory', store.cbHistory)
  };

  async function run(start) {
    if (busy) return;
    job = start; ctl = new AbortController(); stopped = false;
    jevDown = false; jevFails = 0; answerShown = false;
    busyUI(true);
    parts.clear();
    let stepsRun = 0, fixes = 0, began = Date.now(), end = 'pause';
    store.cbHistory = C.historyAdd(store.cbHistory, {
      task: job.task, site: '', startedAt: Date.now(), endedAt: 0, status: 'running', steps: 0, answer: ''
    });
    hid = store.cbHistory[store.cbHistory.length - 1].id;
    save('cbHistory', store.cbHistory);
    try {
      const tab = await getTab(job.tabId);
      paint(tab); framesCache.delete(tab.id); healed.delete(tab.id);
      patchHist({ site: tab.url });
      for (let round = job.round || 0; round < MAX_ROUNDS && !stopped; round++) {
        job.round = round;
        if (Date.now() - began > TOTAL_MS) throw Error('Task time limit reached.');
        const rc = round0();
        try {
          U.hint('reading the page…');
          U.phase('think');
          const o = await observe(tab.id, round === 0 && !parts.size);
          o.tabs = await power('listTabs', {}).catch(() => []);
          o.memory = C.recallFacts(store.cbMemory, job.task);
          // Sensitive-site watch mode: consequential actions here always ask, even trusted.
          job.sensitive = C.isSensitiveSite(o.url);
          if (!job.slow) {
            job.slow = true;
            let quick;
            try { quick = await runFast(job, o, tab) }
            catch (e) { if (stopped) break; quick = 'none'; U.feed.bad('⚠ ' + e.message) }
            if (quick === 'all') { end = 'done'; break }
            if (quick === 'partial') { await checkpoint(); continue }
            if (stopped) break;
          }
          U.hint('planning…');
          const probe = newProbe();
          job.streamText = '';
          job._planSeen = 0; job._planDrawn = 0;
          let got = { steps: [], tail: async () => [] };
          try {
            got = await take(plan(o, rc.signal, job.shot, probe), STEPS_MAX,
              () => /"action"\s*:\s*"done"/.test(job.streamText || ''))
          } catch (e) {
            const badReply = /not in the observation|Unknown action|no valid JSON|no actions|Non-JSON|non-object|absolute http|reasoning/i.test(e.message || '');
            if (stopped || e instanceof Http || rc.timedOut() || !badReply) {
              if (rc.timedOut()) throw Error('The model took over ' + PLAN_MS / 1000 + 's without replying. Pick a faster model in Settings.');
              throw e
            }
            if (++fixes > FIX_MAX) throw Error('The model kept answering unusably: ' + e.message);
            // A reasoning-only reply is a budget problem, not a comprehension problem:
            // retry with reasoning switched off so the tokens go to the answer.
            if (e.thoughtOnly) job.noThink = true;
            job.fix = String(e.message).slice(0, 160);
            job.shot = null;
            U.feed.bad('⚠ ' + job.fix + ' — asking again');
            await checkpoint();
            continue
          } finally { rc.end() }
          if (probe.truncated) U.feed.info('The reply was cut off at the token limit — raise Model quality if answers keep ending early.');
          const acts = got.steps;
          if (!acts.length) {
            // Nothing actionable was written before the stream settled — wait for it to
            // finish rather than declaring "no action" while the answer is still arriving.
            const d = await lateClosing(got);
            if (!d) throw Error('The model returned no action.');
            finish(d.value || d.reason || 'Done.', d);
            end = 'done'; break
          }
          U.hint('');
          const stopAt = acts.findIndex(a => a.action === 'done');
          const work = stopAt < 0 ? acts : acts.slice(0, stopAt);
          let closing = stopAt < 0 ? null : acts[stopAt];
          if (!work.length) {
            finish(closing.value || closing.reason || 'Done.', closing);
            end = 'done'; break
          }
          const before = C.state(o);
          const held = [];
          let halt = '';
          for (const a of work) {
            const sig = C.signature(a, o);
            if (held.some(hh => hh.sig === sig)) { halt = 'That step repeats one already queued in this batch.'; break }
            const block = C.loop(job.history, a, o);
            if (block) { halt = block; break }
            const gp = gate(o, a);
            gp.catch(() => { });
            held.push({ a, sig, gate: gp, stepEl: U.live.push(stepLabel(a, o)) })
          }
          const go = [];
          for (const hh of held) {
            if (stopped) break;
            U.live.set(hh.stepEl, 'running');
            const v = await hh.gate;
            if (!v.ok) {
              U.live.set(hh.stepEl, 'blocked', v.text || 'blocked');
              halt = v.text || 'blocked';
              if (v.stopped) end = 'stop';
              break
            }
            U.live.set(hh.stepEl, 'pending', 'approved');
            go.push({ ...hh, verdict: v.text })
          }
          if (halt && !go.length) {
            if (end !== 'stop') U.feed.info('Stopped safely: ' + halt);
            if (end !== 'stop') end = 'stop';
            break
          }
          U.phase('act');
          U.hint(go.length > 1 ? go.length + ' actions…' : 'acting…');
          const ta = performance.now();
          let res;
          try {
            const pageSteps = [], tabSteps = [];
            for (const hh of go) (['goto', 'newtab', 'closetab', 'activate', 'screenshot'].includes(hh.a.action) ? tabSteps : pageSteps).push(hh);
            const results = [];
            for (const hh of tabSteps) {
              U.live.set(hh.stepEl, 'running');
              try { results.push({ r: { action: hh.a.action, id: hh.a.ref, ref: hh.a.ref, result: await tabAction(hh.a, o) }, hh }) }
              catch (e) {
                U.live.set(hh.stepEl, 'blocked', e.message);
                results.push({ r: { action: hh.a.action, id: hh.a.ref, ref: hh.a.ref, result: 'failed: ' + e.message }, hh, err: true });
                break
              }
            }
            let res2 = null;
            if (pageSteps.length) {
              res2 = await act(pageSteps.map(hh => { U.live.set(hh.stepEl, 'running'); return pack(o, hh.a) }));
            }
            // Merge results back in submission order for honest reporting.
            for (const x of results) {
              U.live.set(x.hh.stepEl, x.err ? 'blocked' : 'done', x.r.result);
              job.history.push({ sig: x.hh.sig, action: x.r.action, reason: x.hh.a.reason || '', result: x.r.result, before, after: '' });
              U.feed.info(x.r.result + (x.hh.verdict ? ' · ' + x.hh.verdict : ''));
            }
            const byRef = new Map(pageSteps.map(hh => [hh.a.ref, hh]));
            if (res2) {
              for (const r of res2.ran) {
                const hh = byRef.get(r.id || r.ref);
                if (hh) U.live.set(hh.stepEl, 'done', r.result);
                job.history.push({ sig: hh?.sig, action: r.action, reason: hh?.a?.reason || '', result: r.result, before, after: '' });
                U.feed.info(r.result + (hh?.verdict ? ' · ' + hh.verdict : '') + (hh === pageSteps.at(-1) ? ' · ' + Math.round(performance.now() - ta) + 'ms' : ''))
              }
              if (res2.observation) Object.assign(parts, {});
              res = res2
            } else {
              res = { ran: [], stop: '', reason: '', o: await observe(job.tabId, true) }
            }
            if (res2?.stop) res.stop = res2.stop, res.reason = res2.reason;
          } catch (e) {
            if (stopped || e.name === 'AbortError') break;
            if (++fixes > FIX_MAX) throw e;
            U.feed.bad('⚠ ' + e.message + ' — re-planning');
            job.fix = 'Action failed: ' + e.message;
            job.history.push({ action: 'act', result: 'failed: ' + e.message, before, after: '' });
            await checkpoint();
            continue
          }
          fixes = 0;
          const after = C.state(res.o);
          stepsRun += res.ran.length;
          job.fix = ''; job.shot = null;
          // Local critic: catch no-progress / loops before the next planning round.
          if (cfg.crew && Crew) {
            const crit = Crew.localCritic(job.history, before, after);
            if (!crit.ok && crit.issues?.length) {
              job.criticNote = crit.issues.join(' ');
              U.feed.info('Critic: ' + crit.issues[0])
            } else job.criticNote = ''
          }
          patchHist({ steps: stepsRun });
          if (res.stop === 'guard') { U.feed.info('Stopped safely: ' + res.reason); end = 'stop'; break }
          if (stopped) break;
          // The answer may have been written after the batch we just ran.
          if (!closing) closing = await lateClosing(got);
          if (closing && !res.stop) {
            finish(closing.value || closing.reason || 'Done.', closing);
            end = 'done'; break
          }
          const mutated = res.ran.some(r => ['click', 'fill', 'press'].includes(r.action)) || res.ran.length;
          if (mutated && after === before && res.ran.length) {
            U.feed.info('Stopped: nothing on the page changed after that action. I will not repeat it.');
            end = 'stop'; break
          }
          if (res.stop === 'error') {
            if (++fixes > FIX_MAX) { U.feed.info('Stopped: ' + res.reason); end = 'stop'; break }
            job.fix = 'Action failed: ' + res.reason;
            U.feed.bad('⚠ ' + res.reason + ' — re-planning')
          }
          if (res.stop === 'moved') U.feed.info('The page navigated mid-batch · continuing');
          if (stepsRun >= MAX_STEPS) { U.feed.info('Stopped after ' + stepsRun + ' actions. Narrow the task or Resume.'); end = 'stop'; break }
          await checkpoint()
        } catch (e) {
          if (stopped) break;
          if (rc.timedOut() && e.name === 'AbortError') throw Error('The model took over ' + PLAN_MS / 1000 + 's without replying. Pick a faster model in Settings.');
          throw e
        } finally { rc.end() }
      }
      if (end === 'pause') U.feed.info(stopped
        ? 'Stopped before an answer. Press Run to start again.'
        : 'Round limit reached. Narrow the task and run again.')
    } catch (e) {
      if (stopped || e.name === 'AbortError') U.feed.info('Stopped.');
      else {
        U.feed.bad(e.message || String(e));
        U.phase('bad');
        patchHist({ status: 'error', endedAt: Date.now() })
      }
    } finally {
      ctl = null;
      ensureAnswer(end, stepsRun);
      busyUI(false);
      // Composer was cleared at run start; bring suggestion chips back now it's idle + empty.
      const ta = document.getElementById('task');
      if (ta && !ta.value.trim()) ta.dispatchEvent(new Event('input'));
      U.hint('');
      if (end === 'done') { U.phase('ok'); setTimeout(() => document.body.dataset.phase === 'ok' && U.phase('idle'), 2500) }
      else if (document.body.dataset.phase !== 'bad') U.phase('idle');
      if (end !== 'running') patchHist({ status: end === 'done' ? 'done' : 'stopped', endedAt: Date.now() });
    }
  }

  function stepLabel(a, o) {
    const t = o.controls.find(c => c.ref === a.ref);
    const who = t?.label || (['goto', 'newtab'].includes(a.action) ? host(a.value) : '') || a.value?.slice(0, 40) || '';
    const verb = { click: 'Click', fill: 'Fill', scroll: 'Scroll', press: 'Press', wait: 'Wait', goto: 'Go to', newtab: 'Open tab', closetab: 'Close tab', activate: 'Switch to tab', extract: 'Extract', screenshot: 'Screenshot' }[a.action] || a.action;
    return (verb + ' ' + who).trim()
  }
  function finish(text, closing) {
    const body = String(text || '').trim() || 'Done.';
    answerShown = true;
    U.feed.answer(body);
    if (closing?.export && Array.isArray(closing.export.rows) && closing.export.rows.length) {
      const rows = closing.export.rows.slice(0, 200)
        .map(r => Array.isArray(r) ? { name: r[0], value: r[1] } : { name: r?.name ?? '', value: r?.value ?? '' })
        .filter(r => r.name || r.value);
      if (rows.length) U.feed.artifact(rows, closing.export.title || 'Extracted data')
    }
    U.phase('ok');
    patchHist({ status: 'done', answer: body.slice(0, 2000), endedAt: Date.now() });
    // Learn lightly: remember the task's existence for history recall (no auto-facts).
  }

  // The panel must never end on silence. If no `done` ever arrived the user is left
  // staring at a reasoning block, so close the run with an honest summary instead.
  function ensureAnswer(end, stepsRun) {
    if (answerShown) return;
    const ran = (job?.history || []).filter(h => h.result && !/^failed/i.test(String(h.result)));
    const last = ran.at(-1);
    const bits = [];
    if (stepsRun) bits.push(stepsRun + (stepsRun === 1 ? ' action ran' : ' actions ran'));
    if (last) bits.push('last: ' + String(last.result).slice(0, 140));
    const head = stopped ? 'Stopped before I could answer.'
      : end === 'pause' ? 'I could not finish this task.'
        : 'This run ended without an answer.';
    U.feed.answer(head + (bits.length ? '\n\n' + bits.join(' · ') : '')
      + '\n\nTry narrowing the task, or raise Model quality in Settings.');
    patchHist({ status: 'stopped', answer: head, endedAt: Date.now() })
  }

  // ---------- busy UI ----------
  function busyUI(on) {
    busy = on;
    $('run').disabled = on;
    $('liveStop').disabled = !on;
    document.body.dataset.busy = on ? '1' : '0';
    U.phase(on ? 'think' : 'idle');
    chrome.action.setBadgeText({ text: on ? '●' : '' }).catch(() => { });
    chrome.action.setTitle({ title: on ? 'ChromeBot Ai — working' : 'ChromeBot Ai' }).catch(() => { });
    if (!on) U.live.hide();
  }

  // ---------- settings / memory / drawer wiring ----------
  function readHeadersUI() {
    const out = {};
    document.querySelectorAll('#hdrList .hdr-row').forEach(row => {
      const k = row.dataset.key || '', v = row.dataset.value || '';
      if (k) out[k] = v
    });
    return out
  }
  function paintHeadersUI() {
    const box = $('hdrList');
    if (!box) return;
    box.replaceChildren();
    const entries = Object.entries(cfg.headers || {});
    if (!entries.length) {
      box.innerHTML = '<p class="sub">No custom headers.</p>';
      return
    }
    for (const [k, v] of entries) {
      const row = document.createElement('div');
      row.className = 'hdr-row';
      row.dataset.key = k; row.dataset.value = v;
      row.innerHTML = '<code></code><span class="hdr-v"></span><button class="mini danger" type="button">×</button>';
      row.querySelector('code').textContent = k;
      row.querySelector('.hdr-v').textContent = v;
      row.querySelector('button').onclick = () => {
        delete cfg.headers[k];
        paintHeadersUI()
      };
      box.append(row)
    }
  }
  function draft() {
    const p = $('provider')?.value || cfg.provider;
    if ($('key')) keys[p] = $('key').value.trim();
    if ($('jevKey')) keys.jev = $('jevKey').value.trim();
    cfg = C.config({
      provider: p,
      base: $('base') ? $('base').value.trim() : cfg.base,
      model: $('model') ? $('model').value.trim() : cfg.model,
      guard: $('guard')?.value || cfg.guard,
      lang: $('lang') ? ($('lang').value.trim() || 'en-US') : 'en-US',
      theme: $('themeSel')?.value || cfg.theme || 'dark',
      crew: $('crewOn') ? $('crewOn').checked : true,
      thinking: $('thinkOn') ? $('thinkOn').checked : true,
      quality: $('quality') ? $('quality').value : (cfg.quality || 'auto'),
      headers: readHeadersUI()
    });
    C.validate(cfg)
  }
  function paintForm() {
    try {
      const p = $('provider');
      if (p) { p.value = cfg.provider; p.dataset.previous = cfg.provider }
      if ($('base')) $('base').value = cfg.base;
      if ($('model')) $('model').value = cfg.model;
      if ($('lang')) $('lang').value = cfg.lang;
      if ($('guard')) $('guard').value = cfg.guard;
      if ($('quality')) $('quality').value = cfg.quality || 'auto';
      if ($('themeSel')) $('themeSel').value = cfg.theme || 'dark';
      if ($('crewOn')) $('crewOn').checked = cfg.crew !== false;
      if ($('thinkOn')) $('thinkOn').checked = cfg.thinking !== false;
      if ($('key')) $('key').value = keys[cfg.provider] || '';
      if ($('jevKey')) $('jevKey').value = keys.jev || '';
      const custom = C.needsCustomBase(cfg.provider);
      const cline = C.isCline?.(cfg.provider);
      if ($('baseRow')) $('baseRow').hidden = !custom;
      if ($('clineRow')) $('clineRow').hidden = !cline;
      paintHeadersUI();
      U.applyTheme(cfg.theme);
      U.setGuardPill(cfg.guard, cfg.guard);
      U.setModel((NAME[cfg.provider] || cfg.provider) + ' · ' + String(cfg.model || '').slice(0, 18))
    } catch (e) {
      try { U.hint('UI paint: ' + e.message) } catch { }
    }
  }
  // ---------- focus mode: hide the title bar and the suggestion chips ----------
  function setCompact(on) {
    on = !!on;
    document.body.dataset.compact = on ? '1' : '0';
    store.cbCompact = on; save('cbCompact', on);
    // The floating widget mirrors this on its own ▭ button.
    if (window.parent !== window) {
      try { window.parent.postMessage({ cb: 'chromebot', kind: 'chromeState', on }, '*') } catch { }
    }
  }
  addEventListener('message', e => {
    const d = e.data;
    if (!d || d.cb !== 'chromebot' || d.kind !== 'chrome') return;
    setCompact(typeof d.on === 'boolean' ? d.on : document.body.dataset.compact !== '1')
  });
  const say = (id, t, cls) => { const e = $(id); e.textContent = t; e.className = 'sub' + (cls ? ' ' + cls : '') };
  class Http2 extends Error { }
  async function runTest(btn, id, fn) {
    btn.disabled = true; say(id, 'testing…');
    try { const r = await fn(); say(id, r.msg, r.ok ? 'ok' : 'bad') }
    catch (e) { say(id, e.message, 'bad') }
    btn.disabled = false
  }
  async function probe(provider, key, base, model) {
    const p = provider, k = key, custom = C.needsCustomBase(p);
    let b;
    try {
      b = custom ? C.base(base) : C.PROVIDER_BASE[p];
    } catch (e) {
      return { ok: false, msg: e.message }
    }
    const signal = AbortSignal.timeout(12000);
    if (p === 'gemini') {
      if (!k) return { ok: false, msg: 'enter a Gemini key' };
      await json(b + '/models?pageSize=1', { headers: { 'x-goog-api-key': k }, signal });
      return { ok: true, msg: 'Gemini key accepted' }
    }
    if (C.isCline?.(p) && !k) {
      return { ok: false, msg: 'paste a Cline API key from app.cline.bot → Settings → API Keys' }
    }
    const m = model || C.DEFAULT_MODEL[p];
    if (p === 'nvidia' && !k) return { ok: false, msg: 'enter an nvapi- key (build.nvidia.com)' };
    if (custom && !b) return { ok: false, msg: 'set the API base URL first' };
    if (!m) return { ok: false, msg: 'enter a model id, or Load one' };
    const d = await json(b + '/chat/completions', {
      method: 'POST', signal,
      // Same merge as the live run (deltas), so Test cannot pass while the job 401s.
      headers: C.mergeHeaders({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + k }, cfg.headers),
      body: JSON.stringify({ model: m, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], max_tokens: 64, stream: false })
    });
    const root = d && d.data && d.data.choices ? d.data : d;
    const msg = root?.choices?.[0]?.message;
    if (msg) return { ok: true, msg: m + ' replied' + (msg.content ? ': ' + String(msg.content).slice(0, 40) : '') };
    return { ok: false, msg: 'no completion — press Fetch models and pick another id' }
  }
  async function probeJev() {
    const k = $('jevKey').value.trim();
    if (!k) return { ok: false, msg: 'enter a Jev key' };
    const d = await json('https://api.typesafe.ai/v1/systemone', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + k }, signal: AbortSignal.timeout(12000),
      body: JSON.stringify({ model: 'jev-latest', state: 'Connection test from ChromeBot Ai.', questions: { ok: { type: 'noul', instructions: 'Was this request received and scored?' } } })
    });
    return Number.isFinite(d?.answers?.ok?.noul) ? { ok: true, msg: 'Jev accepted the key' } : { ok: false, msg: 'Jev replied without a score' }
  }
  function openSettings() {
    U.openSheet('settings');
    U.tab('agent');
    U.memoryList(store.cbMemory);
    U.sitesList(store.cbSites)
  }
  async function openDrawer() {
    U.openSheet('drawer');
    U.tab('history');
    U.historyList([...store.cbHistory].reverse());
    U.scheduleList(store.cbSchedules)
  }
  $('gearBtn') && 0; // wired in CBUI.wire via CBHOOKS below

  $('provider') && ($('provider').onchange = () => {
    const prev = $('provider').dataset.previous || cfg.provider;
    if ($('key')) keys[prev] = $('key').value.trim();
    $('provider').dataset.previous = $('provider').value;
    const p = $('provider').value;
    if ($('key')) $('key').value = keys[p] || '';
    if ($('model')) {
      $('model').value = C.DEFAULT_MODEL[p] || '';
      if (C.isCline?.(p) && $('models')) {
        $('models').replaceChildren(...C.CLINE_PASS_MODELS.map(id => Object.assign(document.createElement('option'), { value: id })));
      }
    }
    const custom = C.needsCustomBase(p);
    const cline = C.isCline?.(p);
    if ($('baseRow')) $('baseRow').hidden = !custom;
    if ($('clineRow')) $('clineRow').hidden = !cline;
    const hints = {
      gemini: 'AIza… from Google AI Studio', nvidia: 'nvapi-… from build.nvidia.com',
      openai: 'sk-… from platform.openai.com', groq: 'gsk_… from console.groq.com',
      openrouter: 'sk-or-… from openrouter.ai',
      cline: 'Cline API key from app.cline.bot', clinepass: 'Cline API key (ClinePass models)',
      compatible: 'any OpenAI-compatible endpoint'
    };
    if ($('key')) $('key').placeholder = hints[p] || 'API key';
    if (C.isCline?.(p) && $('modelStatus')) {
      $('modelStatus').textContent = p === 'clinepass'
        ? 'ClinePass models: kimi-k3, glm-5.3, qwen3.7-max …'
        : 'Cline: pick a FREE model to test, or add credits at app.cline.bot';
      $('modelStatus').className = 'sub'
    }
  });
  // ---- Cline OAuth-style sign-in (opens Cline; user pastes the API key back) ----
  function openCline(url) {
    const u = url || 'https://app.cline.bot';
    chrome.tabs.create({ url: u }).catch(() => window.open(u, '_blank'))
  }
  $('clineGoogle') && ($('clineGoogle').onclick = () => {
    openCline('https://app.cline.bot');
    U.hint('Sign in with Google in the Cline tab → Settings → API Keys → paste key here');
    if ($('key')) $('key').focus()
  });
  $('clineGithub') && ($('clineGithub').onclick = () => {
    openCline('https://app.cline.bot');
    U.hint('Sign in with GitHub in the Cline tab → Settings → API Keys → paste key here');
    if ($('key')) $('key').focus()
  });
  $('clineEmail') && ($('clineEmail').onclick = () => {
    openCline('https://app.cline.bot');
    U.hint('Sign in with Email in the Cline tab → Settings → API Keys → paste key here');
    if ($('key')) $('key').focus()
  });
  $('clinePaste') && ($('clinePaste').onclick = () => {
    if ($('key')) { $('key').focus(); $('key').select?.() }
    U.toast('Paste your Cline API key, then press Test')
  });
  $('clineDash') && ($('clineDash').onclick = () => openCline('https://app.cline.bot/dashboard'));
  $('clinePass') && ($('clinePass').onclick = () => openCline('https://app.cline.bot/dashboard/subscription?personal=true'));
  // Custom headers
  $('hdrAdd') && ($('hdrAdd').onclick = () => {
    const k = $('hdrKey')?.value?.trim(), v = $('hdrVal')?.value?.trim();
    if (!k) return U.toast('Header name required');
    if (!/^(x-|authorization|api-key|openai-|anthropic-|organization)/i.test(k)) {
      return U.toast('Use X-… / Authorization / Api-Key / OpenAI- / Anthropic- / Organization-')
    }
    cfg.headers = { ...(cfg.headers || {}), [k]: v || '' };
    if ($('hdrKey')) $('hdrKey').value = '';
    if ($('hdrVal')) $('hdrVal').value = '';
    paintHeadersUI()
  });
  $('testKey') && ($('testKey').onclick = () => runTest($('testKey'), 'keyStatus', () => probe($('provider').value, $('key').value.trim(), $('base').value.trim(), $('model').value.trim())));
  $('testJev') && ($('testJev').onclick = () => runTest($('testJev'), 'jevStatus', probeJev));
  $('load') && ($('load').onclick = async () => {
    const b = $('load'); b.disabled = true; say('modelStatus', 'loading…');
    try {
      const p = $('provider').value, k = $('key').value.trim();
      if (C.isCline?.(p)) {
        // The key's live /models list is authoritative. The curated ClinePass ids stay as
        // the seed for that provider (a non-pass key cannot list them) and as fallback.
        let list = p === 'clinepass' ? [...C.CLINE_PASS_MODELS] : [C.DEFAULT_MODEL[p]];
        try {
          const burl = C.PROVIDER_BASE[p] + '/models';
          const remote = C.models(await json(burl, { headers: { Authorization: 'Bearer ' + k }, signal: AbortSignal.timeout(15000) }), p);
          if (remote.length) list = [...new Set([...remote, ...list])]
        } catch { /* keep the seeded ids */ }
        $('models').replaceChildren(...list.map(id => Object.assign(document.createElement('option'), { value: id })));
        if (!list.includes($('model').value)) $('model').value = list[0];
        say('modelStatus', list.length + ' models · ' + (p === 'clinepass' ? 'ClinePass' : 'Cline'));
        return
      }
      const url = (p === 'compatible' ? C.base($('base').value) : C.PROVIDER_BASE[p]) + '/models' + (p === 'gemini' ? '?pageSize=1000' : '');
      const headers = p === 'gemini' ? { 'x-goog-api-key': k } : { Authorization: 'Bearer ' + k };
      const list = C.models(await json(url, { headers, signal: AbortSignal.timeout(15000) }), p);
      if (!list.length) throw Error('no models returned — type the id yourself');
      $('models').replaceChildren(...list.map(id => Object.assign(document.createElement('option'), { value: id })));
      if (!list.includes($('model').value)) $('model').value = list[0];
      say('modelStatus', list.length + ' models')
    } catch (e) { say('modelStatus', e.message, 'bad') }
    finally { b.disabled = false }
  });
  $('compactBtn') && ($('compactBtn').onclick = () => setCompact(document.body.dataset.compact !== '1'));
  $('compactBack') && ($('compactBack').onclick = () => setCompact(false));
  $('save') && ($('save').onclick = async () => {
    try {
      draft();
      await chrome.storage.local.set({ cbConfig: cfg });
      await chrome.storage.session.set({ cbKeys: keys });
      paintForm();
      U.closeSheets();
      U.toast('Saved');
    } catch (e) { U.feed.bad(e.message) }
  });
  $('inspect') && ($('inspect').onclick = async () => {
    try {
      const t = await current();
      const o = await observe(t.id, true);
      o.tabs = await power('listTabs', {}).catch(() => []);
      $('preview').textContent = C.prompt($('task').value.trim() || '(no task yet)', o, []);
      $('previewWrap').open = true
    } catch (e) { U.feed.bad(e.message) }
  });
  // Memory pane
  $('addFactBtn') && ($('addFactBtn').onclick = async () => {
    const v = $('addFact').value.trim();
    if (!v) return;
    store.cbMemory = C.rememberFacts(store.cbMemory, [v], '');
    await save('cbMemory', store.cbMemory);
    $('addFact').value = '';
    U.memoryList(store.cbMemory);
    U.toast('Remembered')
  });
  // Schedules pane
  $('addSchedBtn') && ($('addSchedBtn').onclick = async () => {
    try {
      const every = $('schedEvery').value;
      const { list, job: s } = C.scheduleNew(store.cbSchedules, {
        task: $('schedTask').value.trim(),
        ...(every ? { everyMinutes: +every } : { dailyAt: $('schedDaily').value.trim() })
      });
      store.cbSchedules = list;
      await save('cbSchedules', store.cbSchedules);
      await chrome.alarms.create('cb-task-' + s.id, s.everyMinutes
        ? { periodInMinutes: Math.max(1, s.everyMinutes) }
        : { when: C.scheduleNextAt(s.dailyAt), periodInMinutes: 24 * 60 });
      $('schedTask').value = '';
      U.scheduleList(store.cbSchedules);
      U.toast('Scheduled' + (s.dailyAt ? ' for ' + s.dailyAt : ''))
    } catch (e) { U.toast(e.message) }
  });

  // ---------- controls ----------
  async function start(task, tabId) {
    if (busy) return;
    try {
      try { draft() } catch (e) {
        U.feed.bad(e.message || String(e));
        U.phase('bad');
        U.hint('Open Settings (⚙) and fix the provider.');
        return
      }
      await chrome.storage.local.set({ cbConfig: cfg });
      await chrome.storage.session.set({ cbKeys: keys });
      const t = await getTab(tabId || (await current()).id);
      if (!/^https?:/.test(t.url || '')) throw Error('Open a normal website (http or https) first');
      if (!task) throw Error('Type what you want done.');
      paint(t);
      U.feed.user(task);
      U.live.show(task);
      const skill = Crew?.matchSkill?.(task);
      if (skill) U.feed.info('Skill: ' + skill.name + ' — ' + skill.hint);
      job = { task, tabId: tabId || t.id, round: 0, history: [], shot: null };
      await checkpoint();
      run(job);
      // Clear the composer once the run is in flight (busy is already true here,
      // so the typing handler keeps the suggestion chips hidden during the run).
      const ta = document.getElementById('task');
      if (ta) { ta.value = ''; ta.dispatchEvent(new Event('input')) }
    } catch (e) {
      U.feed.bad(e.message || String(e));
      U.phase('bad')
    }
  }
  document.getElementById('task')?.addEventListener('input', function typing() {
    U.chips(this.value.trim() || busy ? [] : pageChips())
  });
  function pageChips() {
    const base = ['Summarize this page', 'What can I do here?', 'Extract the key data', 'Compare prices'];
    if (Crew?.SKILLS) {
      const extras = Crew.SKILLS.slice(0, 2).map(s => s.name);
      return [...new Set([...base, ...extras])]
    }
    return base
  }

  // mic (2.1 logic)
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function stopMic() { try { rec?.stop() } catch { } rec = null; $('mic').classList.remove('on') }
  function toggleMic() {
    if (rec) return stopMic();
    if (!SR) return U.hint('Dictation is not available in this browser.');
    try {
      rec = new SR();
      rec.lang = cfg.lang; rec.interimResults = true; rec.continuous = true;
      const base0 = $('task').value.trim();
      rec.onresult = e => {
        let fin = '', interim = '';
        for (let i = 0; i < e.results.length; i++) e.results[i].isFinal ? fin += e.results[i][0].transcript : interim += e.results[i][0].transcript;
        $('task').value = (base0 + ' ' + fin + ' ' + interim).replace(/\s+/g, ' ').trim()
      };
      rec.onerror = e => { U.hint('Mic: ' + e.error); stopMic() };
      rec.onend = stopMic;
      rec.start(); $('mic').classList.add('on'); U.hint('listening…')
    } catch (e) { U.hint('Mic unavailable: ' + e.message) }
  };

  // ---------- CBHOOKS: ui.js calls back into here ----------
  window.CBHOOKS = {
    run: () => start($('task').value.trim()),
    stop: () => { stopped = true; ctl?.abort(); stopMic(); U.hint('stopping…') },
    mic: toggleMic,
    // A suggestion fills the composer; it never fires an agent run on its own.
    chip: t => { $('task').value = t; $('task').focus(); $('task').dispatchEvent(new Event('input')) },
    openSettings, openDrawer,
    downloadText, exportRows,
    rerun: e => { U.closeSheets(); start(e.task) },
    addFact: async v => { if (!v) return; store.cbMemory = C.rememberFacts(store.cbMemory, [v], ''); await save('cbMemory', store.cbMemory); $('addFact').value = ''; U.memoryList(store.cbMemory) },
    delFact: async i => { store.cbMemory.splice(i, 1); await save('cbMemory', store.cbMemory); U.memoryList(store.cbMemory) },
    revokeSite: async k => { delete store.cbSites[k]; await save('cbSites', store.cbSites); U.sitesList(store.cbSites) },
    toggleSchedule: async id => {
      store.cbSchedules = store.cbSchedules.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s);
      await save('cbSchedules', store.cbSchedules);
      const s = store.cbSchedules.find(x => x.id === id);
      await chrome.alarms.clear('cb-task-' + id);
      if (s.enabled) await chrome.alarms.create('cb-task-' + id, s.everyMinutes
        ? { periodInMinutes: s.everyMinutes }
        : { when: C.scheduleNextAt(s.dailyAt), periodInMinutes: 24 * 60 });
      U.scheduleList(store.cbSchedules)
    },
    delSchedule: async id => {
      store.cbSchedules = store.cbSchedules.filter(s => s.id !== id);
      await save('cbSchedules', store.cbSchedules);
      await chrome.alarms.clear('cb-task-' + id);
      U.scheduleList(store.cbSchedules)
    },
    obNext: async () => { U.onboardHide() },
    obSkip: async () => {
      await chrome.storage.local.set({ cbOnboarded: true }).catch(() => { });
      U.onboardHide()
    }
  };

  // ---------- listeners ----------
  chrome.tabs.onActivated.addListener(async a => {
    framesCache.delete(a.tabId);
    try { paint(await chrome.tabs.get(a.tabId)) } catch { }
  });
  chrome.tabs.onUpdated.addListener((id, ch) => {
    if (ch.status === 'complete' && !busy) { framesCache.delete(id); }
  });
  chrome.runtime.onMessage.addListener(m => {
    if (m?.kind === 'SEED' && typeof m.task === 'string') { $('task').value = m.task; start(m.task) }
    if (m?.kind === 'NAV' && m.tabId === job?.tabId) framesCache.delete(m.tabId);
    if (m?.kind === 'WAKE_RUN') { U.toast('Scheduled task: ' + (m.job?.task || '').slice(0, 60)); start(m.job.task) }
  });

  // ---------- boot ----------
  (async () => {
    try {
      const { s } = await pull();
    } catch (e) {
      try { U.feed.bad('Storage not ready: ' + (e.message || e)) } catch { }
    }
    try { U.wire() } catch (e) {
      try { U.feed.bad('UI wire: ' + (e.message || e)) } catch { }
    }
    // Always show the shipped version so updates are identifiable.
    try {
      const v = (chrome.runtime.getManifest?.()?.version) || C.VERSION || '';
      const badge = $('verBadge');
      if (badge && v) badge.textContent = v;
      const av = $('aboutVer');
      if (av && v) av.textContent = v;
      const ab = $('aboutBuild');
      if (ab && v) ab.textContent = 'Build ' + v;
      chrome.action.setTitle({ title: 'ChromeBot Ai ' + v }).catch(() => { });
    } catch { }
    try { paintForm() } catch (e) {
      try { U.feed.bad('UI paint: ' + (e.message || e)) } catch { }
    }
    try { U.chips(pageChips()) } catch { }
    try {
      const { s } = await pull();
      setCompact(store.cbCompact);
      if (s.cbSeed && $('task')) { $('task').value = s.cbSeed; chrome.storage.session.remove('cbSeed').catch(() => { }) }
      // Queue: a scheduled task fired while the panel was closed
      if (store.cbQueue?.length) {
        const next = store.cbQueue.shift();
        await save('cbQueue', store.cbQueue);
        if (next?.task && !busy) {
          U.feed.info('Scheduled task from ' + new Date(next.queuedAt).toLocaleTimeString());
          start(next.task)
        }
      }
      try {
        const t = await current();
        paint(t);
        if (s.cbJob?.tabId === t.id && $('task')) { $('task').value = $('task').value || s.cbJob.task }
      } catch { U.hint('Open a website first, then type a task') }
      // No first-run welcome modal — open Settings if nothing is configured.
      if (!keys[cfg.provider] && cfg.provider !== 'compatible') {
        U.hint('Open ⚙ Settings to connect a model (Cline · Gemini · NVIDIA · OpenAI…)')
      }
    } catch (e) {
      try { U.feed.bad(e.message || String(e)) } catch { }
    }
  })();
})();
