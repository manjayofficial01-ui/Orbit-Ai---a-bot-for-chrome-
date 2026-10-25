// Page actuator (content script, one instance per frame). Observation is on the hot path
// for every step, so it avoids the two things that made it slow: innerText (forces a full
// layout+style rebuild) and per-element getComputedStyle, and it caches for a short window
// so a pre-warmed scan can be reused by the run that follows.
// 3.0: adds hover, page-mutation wait already here, and a bounded structured extract.
(() => {
  if (globalThis.__cbPage2) return;
  globalThis.__cbPage2 = true;
  const C = globalThis.CBCore;
  const MAX = 60, TEXT = 1700, CACHE = 2500, SHADOW_SCAN = 4000;
  const SEL = 'a[href],button,input,textarea,select,summary,[role="button"],[role="link"],[role="textbox"],'
    + '[role="combobox"],[role="listbox"],[role="checkbox"],[role="radio"],[role="menuitem"],[role="tab"],'
    + '[role="switch"],[contenteditable="true"],[tabindex]:not([tabindex="-1"])';
  let refs = new Map(), byEl = new WeakMap(), seq = 0, DEEP = [], cancelled = false;
  let pointer = null, lastPoint = null, cached = null, cacheAt = 0;

  const clip = (s, n = 90) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  function text(root, n) {
    let out = '';
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        return !p || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(p.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
      }
    });
    while (tw.nextNode() && out.length < n) out += tw.currentNode.nodeValue + ' ';
    return out.replace(/\s+/g, ' ').trim().slice(0, n)
  }
  const label = e => clip(e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.getAttribute('title')
    || e.getAttribute('alt') || (e.labels?.[0] ? text(e.labels[0], 60) : '')
    || (/^(A|BUTTON|SUMMARY|LABEL)$/.test(e.tagName) || e.getAttribute('role') ? text(e, 60) : '')
    || e.getAttribute('name') || e.id || '', 90);
  // A <button> reports type "submit" even when it has no form to submit, which made the
  // guard refuse the most common control on the web. Only a form-associated submit is real.
  const kind = (e, form = e.closest('form')) => {
    const t = e.type || e.getAttribute('role') || '';
    if (e.tagName === 'BUTTON') return t === 'reset' ? 'reset' : (t === 'submit' && form ? 'submit' : 'button');
    if (e.tagName === 'INPUT' && t === 'submit') return form ? 'submit' : 'button';
    return t
  };
  const visible = e => e.checkVisibility
    ? e.checkVisibility({ visibilityProperty: true, opacityProperty: true, contentVisibilityAuto: true })
    : !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden';
  const secret = e => e.type === 'password' || e.type === 'file'
    || /(password|secret|token|cvv|card|ssn|otp)/i.test([e.name, e.id, e.autocomplete, e.getAttribute('aria-label')].join(' '));
  const key = e => { let r = byEl.get(e); if (!r) { r = 'e' + (++seq); byEl.set(e, r) } return r };

  function walk(root, bucket, seen, depth) {
    for (const e of root.querySelectorAll(SEL)) if (!seen.has(e)) { seen.add(e); bucket.push(e) }
    if (depth >= 3) return bucket;
    // Custom elements are the realistic shadow hosts; scanning every node for .shadowRoot
    // was one of the two dominant costs of observe(), so the sweep is capped.
    let n = 0;
    for (const e of root.querySelectorAll('*')) {
      if (n++ > SHADOW_SCAN) break;
      if (e.localName?.includes('-') && e.shadowRoot) walk(e.shadowRoot, DEEP, seen, depth + 1)
    }
    return bucket
  }

  function observe(force) {
    if (!force && cached && Date.now() - cacheAt < CACHE) return cached;
    const light = [], seen = new Set();
    DEEP = [];
    walk(document, light, seen, 0);
    // Shadow controls get a reserved tail: a long product list in the light DOM must not
    // starve the toolbar a page keeps inside a web component.
    const order = light.slice(0, MAX - 12).concat(DEEP);
    refs = new Map();
    const controls = [];
    for (const e of order) {
      if (controls.length >= MAX) break;
      if (e.disabled || e.type === 'hidden' || !visible(e) || secret(e)) continue;
      const r = key(e);
      refs.set(r, e);
      const form = e.closest('form');
      const c = { ref: r, tag: e.tagName.toLowerCase(), type: kind(e, form), label: label(e) };
      if (e.tagName === 'A') c.href = clip(e.href, 100);
      if (e.value && typeof e.value === 'string') c.value = clip(e.value, 40);
      if (form) c.inForm = 1;
      if (e.tagName === 'SELECT') c.options = [...e.options].slice(0, 20).map(o => ({ label: clip(o.text, 40), value: o.value }));
      controls.push(c)
    }
    cached = {
      url: location.href, title: document.title, text: text(document.body, TEXT), controls,
      scrollY: Math.round(scrollY), pageHeight: document.documentElement.scrollHeight
    };
    cacheAt = Date.now();
    return cached
  }

  // ---- structured extract: a bounded semantic outline, on demand only ----
  // Gives "collect the prices / compare these laptops" tasks real data instead of prose.
  function extract() {
    const out = { headings: [], items: [], links: [], tables: [] };
    const seen = new Set();
    for (const h of document.querySelectorAll('h1,h2,h3,h4')) {
      if (out.headings.length >= 14) break;
      const t = clip(h.textContent, 90);
      if (t && !seen.has(t)) { seen.add(t); out.headings.push(t) }
    }
    seen.clear();
    for (const li of document.querySelectorAll('li')) {
      if (out.items.length >= 44) break;
      if (!visible(li) || li.querySelector('li')) continue;
      const t = clip(li.textContent, 120);
      if (t && t.length > 2 && !seen.has(t)) { seen.add(t); out.items.push(t) }
    }
    seen.clear();
    for (const a of document.querySelectorAll('a[href]')) {
      if (out.links.length >= 34) break;
      if (!visible(a)) continue;
      const t = clip(a.textContent, 70);
      if (t && t.length > 1 && !seen.has(t)) { seen.add(t); out.links.push(t + ' -> ' + clip(a.href, 90)) }
    }
    for (const table of [...document.querySelectorAll('table')].slice(0, 3)) {
      if (!visible(table)) continue;
      const head = [...table.querySelectorAll('thead th, tr:first-child th')].slice(0, 8).map(th => clip(th.textContent, 30));
      const rows = [...table.querySelectorAll('tbody tr')].slice(0, 6)
        .map(tr => [...tr.querySelectorAll('td,th')].slice(0, 8).map(td => clip(td.textContent, 34)));
      if (rows.length) out.tables.push({ head: head.length ? head : undefined, rows })
    }
    let budget = 2600, s = '';
    if (out.headings.length) s += 'HEADINGS ' + out.headings.join(' | ') + '\n';
    if (out.tables.length) s += 'TABLES\n' + out.tables.map((t, i) => 't' + (i + 1) + (t.head ? ' [' + t.head.join('; ') + ']' : '') + '\n' + t.rows.map(r => r.join(' ; ')).join('\n')).join('\n') + '\n';
    if (out.items.length) s += 'ITEMS ' + out.items.join(' | ') + '\n';
    if (out.links.length) s += 'LINKS ' + out.links.join(' | ');
    return s.slice(0, budget)
  }

  function resolve(s) {
    const e = refs.get(s.ref);
    if (!e || !e.isConnected || !visible(e) || secret(e)) throw Error('Target missing or protected');
    const now = { tag: e.tagName.toLowerCase(), label: label(e), type: kind(e), href: e.tagName === 'A' ? clip(e.href, 100) : '' };
    const want = s.target || {};
    if (want.tag !== undefined && want.tag !== now.tag) throw Error('Target changed since planning');
    if (want.label && now.label && want.label !== now.label) throw Error('Target changed since planning');
    if (want.href && now.href && now.href !== want.href) throw Error('Link changed since planning');
    return { e, now }
  }

  function guard(s, e) {
    const form = e.closest('form');
    const ctx = [s.target?.label, s.target?.href, e.title, e.getAttribute('aria-label'), e.name, e.id, form?.getAttribute('action')]
      .filter(Boolean).join(' ');
    // An explicitly human-approved step (s.approved) may proceed: the approval card is the
    // stronger signal. Everything else still honors the page-level hard block.
    if (!s.approved && (C.isHard(ctx) || kind(e, form) === 'submit' || e.type === 'reset')) return { ok: false, reason: 'This control can cause a side effect that is hard to undo' };
    if (s.action === 'press' && s.value === 'Enter') return { ok: false, reason: 'Enter could submit a form' };
    if (!s.approved && s.action === 'click' && e.tagName === 'A' && new URL(e.href, location.href).origin !== location.origin)
      return { ok: false, reason: 'Cross-site navigation needs a new task' };
    if (s.action === 'fill' && (e.readOnly || (secret(e) && !s.approved))) return { ok: false, reason: 'Protected field' };
    return { ok: true }
  }

  // A hidden tab never fires requestAnimationFrame and throttles setTimeout to ~1/minute, so
  // every wait here has to degrade to "resolve now" rather than hang the run.
  const frame = () => new Promise(res => {
    if (document.hidden) return res();
    let done = false;
    const go = () => { if (!done) { done = true; res() } };
    requestAnimationFrame(go);
    setTimeout(go, 80)
  });
  function cursor() {
    if (pointer?.isConnected) return pointer;
    const host = document.createElement('div');
    host.style.cssText = 'all:initial!important;position:fixed!important;left:0;top:0;width:0;height:0;z-index:2147483646!important;pointer-events:none!important';
    (document.body || document.documentElement).append(host);
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:0;top:0;width:23px;height:28px;pointer-events:none;display:none;filter:drop-shadow(0 2px 5px #001a)';
    d.innerHTML = '<svg viewBox="0 0 24 29" width="23" height="28"><path d="M3 2v22l5-5 4.2 8 3.6-1.9-4.1-7.8H20Z" fill="#fff" stroke="#183563" stroke-width="2"/></svg>';
    host.attachShadow({ mode: 'closed' }).append(d);
    return pointer = d
  }
  async function move(p, fast) {
    const el = cursor(), from = lastPoint ? { ...lastPoint } : p;
    const dur = fast || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 110;
    const t0 = performance.now();
    el.style.display = 'block';
    await new Promise((res, rej) => {
      let settled = false;
      const finish = () => { if (!settled) { settled = true; clearTimeout(deadline); res() } };
      const deadline = setTimeout(finish, dur + 250);
      const step = t => {
        if (cancelled) { settled = true; clearTimeout(deadline); el.style.display = 'none'; rej(Error('Cancelled')); return }
        const k = dur ? Math.min(1, (t - t0) / dur) : 1, ease = 1 - Math.pow(1 - k, 3);
        el.style.transform = `translate(${from.x + (p.x - from.x) * ease - 10}px,${from.y + (p.y - from.y) * ease - 8}px)`;
        if (k < 1) requestAnimationFrame(step); else finish()
      };
      if (dur) requestAnimationFrame(step); else finish()
    });
    lastPoint = { x: p.x, y: p.y };
    const ring = document.createElement('div');
    ring.style.cssText = `position:fixed;left:${p.x - 13}px;top:${p.y - 13}px;width:26px;height:26px;border:2px solid #49dfff;border-radius:50%;pointer-events:none;transition:transform .17s ease,opacity .17s ease`;
    el.parentNode.append(ring);
    requestAnimationFrame(() => { ring.style.transform = 'scale(1.7)'; ring.style.opacity = '0' });
    setTimeout(() => ring.remove(), 200);
    setTimeout(() => { el.style.display = 'none' }, 180)
  }
  const describe = el => !el ? 'an overlay' : clip(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
    + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')
    + ' ' + clip(el.getAttribute('aria-label') || el.title || text(el, 24), 28), 80);
  function aim(e) {
    const pts = C.hitPoints(e.getBoundingClientRect(), innerWidth, innerHeight);
    if (!pts.length) return null;
    let blocker = null;
    for (const p of pts) {
      const over = document.elementFromPoint(p[0], p[1]);
      if (C.sameControl(e, over)) return { x: p[0], y: p[1] };
      if (!blocker && over) blocker = over
    }
    return { blocked: blocker }
  }
  function settle(cap) {
    return new Promise(res => {
      if (document.hidden) { Promise.resolve().then(res); return }
      let quiet, done = false;
      const mo = new MutationObserver(() => { clearTimeout(quiet); quiet = setTimeout(finish, 110) });
      const finish = () => { if (done) return; done = true; mo.disconnect(); clearTimeout(hard); clearTimeout(quiet); res() };
      const hard = setTimeout(finish, cap);
      mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
      quiet = setTimeout(finish, Math.min(160, cap))
    })
  }

  async function one(s, fast) {
    if (s.action === 'scroll') {
      if (s.value === 'top' || s.value === 'bottom') {
        scrollTo({ top: s.value === 'top' ? 0 : document.documentElement.scrollHeight, behavior: 'instant' });
        return 'Scrolled to the ' + s.value
      }
      const n = +s.value;
      if (!Number.isFinite(n)) throw Error('Bad scroll amount');
      scrollBy({ top: Math.max(-1200, Math.min(1200, n)), behavior: 'instant' });
      return 'Scrolled ' + Math.round(n) + 'px'
    }
    if (s.action === 'extract') return extract() || 'Nothing extractable found';
    const { e, now } = resolve(s);
    if (s.action === 'hover') {
      e.scrollIntoView({ block: 'center', inline: 'nearest' });
      await frame();
      const r = e.getBoundingClientRect();
      await move({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }, fast);
      for (const t of ['pointerover', 'mouseover', 'mouseenter', 'mousemove']) {
        e.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
      }
      await settle(600);
      return 'Hovered ' + (now.label || 'control')
    }
    if (s.action === 'click') {
      e.scrollIntoView({ block: 'center', inline: 'nearest' });
      await frame();
      await frame();
      let a = aim(e);
      if (a && a.blocked) { await settle(350); a = aim(e) }
      if (!a) throw Error('Target is off screen');
      if (a.blocked) throw Error('Covered by ' + describe(a.blocked) + ' — that has to be closed first');
      if (cancelled) throw Error('Cancelled');
      if (!e.isConnected || !visible(e) || label(e) !== now.label) throw Error('Target moved before click');
      await move(a, fast);
      if (cancelled || !e.isConnected) throw Error('Cancelled');
      e.click();
      return 'Clicked ' + (now.label || 'control')
    }
    if (s.action === 'fill') {
      if (typeof s.value !== 'string' || !s.value.length) throw Error('Nothing to fill');
      if (s.value.length > 2500) throw Error('Text too long');
      if (e.tagName === 'SELECT') {
        const hit = [...e.options].find(o => o.value === s.value || clip(o.text, 40).toLowerCase() === s.value.toLowerCase());
        if (!hit) throw Error('Option unavailable');
        e.value = hit.value
      } else if (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA') {
        const proto = e.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, s.value)
      } else if (e.isContentEditable) {
        e.focus();
        e.textContent = s.value
      } else throw Error('Not editable');
      for (const t of ['input', 'change']) e.dispatchEvent(new Event(t, { bubbles: true }));
      return 'Filled ' + (now.label || 'field')
    }
    if (s.action === 'press') {
      if (!C.KEYS.includes(s.value)) throw Error('Key blocked');
      e.focus();
      for (const t of ['keydown', 'keyup']) e.dispatchEvent(new KeyboardEvent(t, { key: s.value, bubbles: true }));
      return 'Pressed ' + s.value
    }
    if (s.action === 'wait') { await new Promise(r => setTimeout(r, Math.max(100, Math.min(800, +s.value || 300)))); return 'Waited' }
    throw Error('Unsupported action')
  }

  async function run(m) {
    const steps = Array.isArray(m.steps) ? m.steps : [m], ran = [];
    cancelled = false;
    for (const s of steps) {
      if (cancelled) return { ran, stop: 'cancelled', observation: observe(true) };
      if (s.url && s.url !== location.href) return { ran, stop: 'moved', observation: observe(true) };
      cached = null;
      try {
        if (!['scroll', 'wait', 'extract'].includes(s.action)) {
          const { e } = resolve(s), g = guard(s, e);
          if (!g.ok) return { ran, stop: 'guard', reason: g.reason, observation: observe(true) }
        }
        ran.push({ action: s.action, ref: s.ref, id: s.id || s.ref, label: s.target?.label || '', result: await one(s, m.fast) })
      } catch (e) {
        return { ran, stop: 'error', reason: e?.message || String(e), observation: observe(true) }
      }
      if (s.action !== 'wait') await settle(m.fast ? 450 : 900)
    }
    return { ran, stop: '', observation: observe(true) }
  }

  chrome.runtime.onMessage.addListener((m, s, reply) => {
    if (m?.kind === 'CANCEL') {
      cancelled = true;
      if (pointer) pointer.style.display = 'none';
      reply({ ok: true }); return
    }
    if (!['OBS', 'ACT'].includes(m?.kind)) return;
    (async () => {
      try {
        if (m.kind === 'OBS') return reply({ ok: true, data: observe(!!m.force) });
        reply({ ok: true, data: await run(m) })
      } catch (e) { reply({ ok: false, error: e?.message || String(e) }) }
    })();
    return true
  })
})();
