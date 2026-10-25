// CBUI — the view layer. Pure DOM: no frameworks, no remote assets, CSP-safe.
// Model text is never assigned to innerHTML; it is tokenised into nodes.
(() => {
  const MASCOT = '<svg viewBox="0 0 48 48" aria-hidden="true">'
    + '<defs><linearGradient id="cbg1" x1="0" y1="0" x2="1" y2="1">'
    + '<stop offset="0" stop-color="#46e0ff"/><stop offset="1" stop-color="#9b8cff"/></linearGradient></defs>'
    + '<path d="M24 4c9 0 15 6.2 15 15 0 2.6-.4 5-1.2 7.2-.9-6.7-3.4-9.4-6.3-10.4-2.6 1.9-7.5 2.6-11.7 1.8-2.6-.5-4.9-1.6-6.4-3.4C10.6 17 9.6 22 9.4 27.4 8.5 25.1 8 22.7 8 19 8 10.2 15 4 24 4Z" fill="currentColor" opacity=".14"/>'
    + '<rect x="12" y="20" width="24" height="9.5" rx="4.7" fill="url(#cbg1)" opacity=".95"/>'
    + '<rect x="12" y="20" width="24" height="9.5" rx="4.7" fill="none" stroke="currentColor" stroke-opacity=".35"/>'
    + '<circle cx="19.5" cy="24.8" r="1.9" fill="#0b1018"/><circle cx="28.5" cy="24.8" r="1.9" fill="#0b1018"/>'
    + '<path d="M20 34.5c2.5 2 5.5 2 8 0" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="1.8" stroke-linecap="round"/>'
    + '</svg>';

  const WARN_GLYPH = '<svg viewBox="0 0 16 16" aria-hidden="true">'
    + '<path d="M8 2.5 14.5 13.5H1.5L8 2.5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'
    + '<path d="M8 6.5v3M8 11.4v.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

  const ICON = {
    click: '<svg viewBox="0 0 16 16"><path d="M6.5 2.2v9l2-2 1.5 3.6 1.8-.8-1.5-3.4h3L6.5 2.2Z" fill="currentColor"/></svg>',
    fill: '<svg viewBox="0 0 16 16"><rect x="2" y="4" width="12" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 8h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    scroll: '<svg viewBox="0 0 16 16"><path d="M8 3v8M5 8.5 8 11.5l3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    press: '<svg viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 8h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    wait: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 5.5V8l2 1.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    goto: '<svg viewBox="0 0 16 16"><path d="M3 8h8M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    newtab: '<svg viewBox="0 0 16 16"><rect x="2.5" y="2.5" width="8.5" height="8.5" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M11 5h2.5v8.5H5V11" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    closetab: '<svg viewBox="0 0 16 16"><path d="m4.5 4.5 7 7m0-7-7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    activate: '<svg viewBox="0 0 16 16"><rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="5" y="5" width="6" height="6" rx="1" fill="currentColor"/></svg>',
    extract: '<svg viewBox="0 0 16 16"><path d="M3 3h10M3 6.5h10M3 10h7M3 13h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    screenshot: '<svg viewBox="0 0 16 16"><rect x="2" y="4" width="12" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8.5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6 4l1-1.4h2L10 4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    done: '<svg viewBox="0 0 16 16"><path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    plan: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>'
  };
  const STEP_ICON = a => ICON[a] || ICON.click;

  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v)
    }
    for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el
  };
  const $ = id => document.getElementById(id);

  function applyTheme(t) { document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark' }

  // ---------- header ----------
  const ORB_STATES = { idle: '', think: 'think', act: 'act', ask: 'ask', ok: 'ok', bad: 'bad' };
  function setOrb(s) {
    const orb = $('orb');
    if (!orb) return;
    orb.className = 'orb ' + (ORB_STATES[s] || '');
    orb.querySelector('.ring').dataset.state = s || 'idle'
  }
  function setGuardPill(text, level) {
    const p = $('guardPill');
    p.textContent = text;
    p.dataset.level = level
  }
  function setSite(t, title) { const s = $('site'); s.textContent = t; s.title = title || t }
  function setModel(t) { const p = $('modelPill'); p.textContent = t; p.title = t }

  // ---------- live run card ----------
  const live = {
    el: null, steps: null, timerIv: null, t0: 0, total: 0, done: 0,
    show(task) {
      const card = $('liveCard');
      card.hidden = false;
      card.dataset.open = '1';
      $('liveTask').textContent = task;
      this.total = 0; this.done = 0;
      this.restartTimer();
      $('steps').replaceChildren();
      this.count();
      this.toggleText()
    },
    hide() {
      $('liveCard').hidden = true;
      clearInterval(this.timerIv); this.timerIv = null;
      feed.sealReasoning()
    },
    restartTimer() {
      clearInterval(this.timerIv);
      this.t0 = Date.now();
      this.timerIv = setInterval(() => {
        const s = Math.floor((Date.now() - this.t0) / 1000);
        $('liveTime').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
      }, 1000)
    },
    // "3 of 7 steps" beats a bare spinner: the number is the trust signal.
    count() {
      const el = $('liveCount');
      el.textContent = this.total ? this.done + ' of ' + this.total : '';
      el.hidden = !this.total
    },
    toggleText() { $('liveToggleText').textContent = $('liveCard').dataset.open === '1' ? 'Hide steps' : 'Show steps' },
    setPlan(lines) { for (const line of lines) this.push(line, 'plan') },
    push(desc, kind = 'act') {
      this.total++;
      const li = h('li', { class: 'step ' + kind, 'data-state': kind === 'plan' ? 'plan' : 'pending' },
        h('span', { class: 's-ic', html: kind === 'plan' ? ICON.plan : STEP_ICON('click') }),
        h('span', { class: 's-tx' }, desc),
        h('span', { class: 's-note' }));
      $('steps').append(li);
      this.count(); this.toggleText();
      feed.scroll();
      return li
    },
    set(li, state, note) {
      if (!li) return;
      const was = li.dataset.state;
      li.dataset.state = state;
      li.querySelector('.s-note').textContent = note || '';
      if (state === 'running') { li.querySelector('.s-ic').innerHTML = STEP_ICON('plan'); li.classList.add('spin') }
      else li.classList.remove('spin');
      if (['done', 'blocked'].includes(state) && !['done', 'blocked'].includes(was)) this.done++;
      this.count();
      feed.scroll()
    }
  };

  // ---------- tiny markdown -> DOM (never innerHTML on model text) ----------
  const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  function inline(s) {
    const out = [];
    let last = 0, m;
    INLINE.lastIndex = 0;
    while ((m = INLINE.exec(s))) {
      if (m.index > last) out.push(s.slice(last, m.index));
      const t = m[0];
      if (t.startsWith('**')) out.push(h('strong', {}, t.slice(2, -2)));
      else if (t.startsWith('`')) out.push(h('code', {}, t.slice(1, -1)));
      else {
        const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(t);
        if (lm && /^https?:\/\//i.test(lm[2]))
          out.push(h('a', { href: lm[2], target: '_blank', rel: 'noopener noreferrer' }, lm[1]));
        else out.push(t)
      }
      last = INLINE.lastIndex
    }
    if (last < s.length) out.push(s.slice(last));
    return out
  }
  function mdInto(el, text) {
    for (const block of String(text || '').split(/\n{2,}/)) {
      let list = null, kind = null;
      const flush = () => { if (list) { el.append(list); list = null; kind = null } };
      for (const line of block.split('\n')) {
        const ul = /^\s*[-*•]\s+(.+)$/.exec(line);
        const ol = /^\s*\d+[.)]\s+(.+)$/.exec(line);
        if (ul || ol) {
          const want = ul ? 'ul' : 'ol';
          if (kind !== want) { flush(); list = h(want); kind = want }
          list.append(h('li', {}, ...inline((ul || ol)[1])));
          continue
        }
        flush();
        if (line.trim()) el.append(h('p', {}, ...inline(line)))
      }
      flush()
    }
    if (!el.firstChild) el.append(h('p', {}, String(text || '')))
  }

  // ---------- transcript feed ----------
  const feed = {
    scroll() {
      const f = $('feed');
      // Only follow the tail while the user is already at it, so scrolling up to re-read
      // an answer isn't undone by every streamed chunk.
      if (f.scrollHeight - f.scrollTop - f.clientHeight < 160) {
        requestAnimationFrame(() => { f.scrollTop = f.scrollHeight })
      }
    },
    clear() { $('feed').replaceChildren(); this.empty(true) },
    dropEmpty() { $('feed').querySelector('.empty')?.remove() },

    // A reasoning block: collapsed by default, open only while it is arriving.
    think(t) {
      const f = $('feed');
      this.dropEmpty();
      let d = f.querySelector('.row.reason[data-live="1"]');
      if (d) {
        const tx = d.querySelector('.body'), prev = tx.textContent;
        // Provider token streams don't consistently carry their own spaces.
        const gap = prev && t && !/\s$/.test(prev) && !/^\s/.test(t) ? ' ' : '';
        tx.textContent = (prev + gap + t).slice(-4000);
        this.scroll();
        return d
      }
      const started = Date.now();
      d = h('details', { class: 'row reason', open: true, 'data-live': '1' },
        h('summary', {
          onclick: e => { e.preventDefault(); e.currentTarget.parentElement.dataset.manual = '1'; e.currentTarget.parentElement.open = !e.currentTarget.parentElement.open }
        }, 'Thinking…'),
        h('div', { class: 'body' }, t));
      d._started = started;
      f.append(d);
      this.scroll();
      return d
    },
    // Close the live reasoning block: freeze the label to a duration and fold it away.
    sealReasoning() {
      const f = $('feed');
      for (const d of f.querySelectorAll('.row.reason[data-live="1"]')) {
        const secs = Math.max(1, Math.round((Date.now() - (d._started || Date.now())) / 1000));
        d.dataset.live = '0';
        d.querySelector('summary').textContent = 'Reasoned for ' + (secs < 60 ? secs + 's' : Math.floor(secs / 60) + 'm ' + (secs % 60) + 's');
        // Auto-fold once it's history — unless the user opened it themselves.
        if (!d.dataset.manual) {
          d.classList.add('reason-open');
          setTimeout(() => { if (d.isConnected && !d.dataset.manual) { d.open = false; d.classList.remove('reason-open') } }, 700)
        }
      }
    },
    user(t) {
      this.dropEmpty();
      const d = h('div', { class: 'row user' }, h('div', { class: 'bubble' }, t));
      $('feed').append(d); this.scroll(); return d
    },
    info(t) {
      this.dropEmpty();
      const d = h('div', { class: 'row info' }, h('span', { class: 'dot' }), t);
      $('feed').append(d); this.scroll(); return d
    },
    bad(t) {
      this.sealReasoning();
      const d = h('div', { class: 'row bad' }, t);
      $('feed').append(d); this.scroll(); return d
    },
    answer(text) {
      this.sealReasoning();
      const body = h('div', { class: 'a-body' });
      mdInto(body, text);
      const d = h('div', { class: 'row answer' },
        h('div', { class: 'a-head' },
          h('span', { class: 'a-who', html: MASCOT }),
          h('b', {}, 'ChromeBot'),
          h('span', { class: 'stamp' }, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))),
        body,
        h('div', { class: 'a-acts' },
          h('button', { class: 'mini', onclick: e => { navigator.clipboard?.writeText(text); e.target.textContent = 'Copied'; setTimeout(() => e.target.textContent = 'Copy', 1400) } }, 'Copy'),
          h('button', { class: 'mini', onclick: () => CBHOOKS?.downloadText?.('chromebot-answer.md', text) }, 'Save .md')));
      $('feed').append(d); this.scroll(); return d
    },
    shot(dataUrl, caption) {
      const d = h('div', { class: 'row shot' },
        h('img', { src: dataUrl, alt: caption || 'Screenshot' }),
        caption ? h('div', { class: 'shot-cap' }, caption) : null);
      $('feed').append(d); this.scroll(); return d
    },
    artifact(rows, title) {
      const max = 12;
      const tbl = h('table', { class: 'art' },
        h('tr', {}, h('th', {}, 'Field'), h('th', {}, 'Value')),
        rows.slice(0, max).map(r => h('tr', {}, h('td', {}, r.name), h('td', {}, r.value))));
      const d = h('div', { class: 'row artifact' },
        h('div', { class: 'a-head' }, h('span', { class: 'a-who', html: ICON.extract }), h('b', {}, title || 'Extracted data')),
        tbl,
        rows.length > max ? h('div', { class: 'sub', style: 'margin-top:7px' }, '+' + (rows.length - max) + ' more rows in the download') : null,
        h('div', { class: 'a-acts' },
          h('button', { class: 'mini', onclick: () => CBHOOKS?.exportRows?.(rows, 'csv') }, 'Download CSV'),
          h('button', { class: 'mini', onclick: () => CBHOOKS?.exportRows?.(rows, 'json') }, 'JSON')));
      $('feed').append(d); this.scroll(); return d
    },
    // Interruptions dock above the composer: in a 320px panel a card that scrolls out
    // of view is a deadlock.
    approval(req) {
      return new Promise(resolve => {
        const dock = $('dock');
        let done = false;
        const close = v => { if (done) return; done = true; card.remove(); dock.hidden = !dock.children.length; delete document.body.dataset.asking; resolve(v) };
        const card = h('div', { class: 'approve' },
          h('div', { class: 'a-t' }, h('span', { class: 'glyph', html: WARN_GLYPH }), 'Permission needed'),
          req.detail ? h('div', { class: 'a-r' }, req.detail) : null,
          h('div', { class: 'a-why' }, req.reason),
          h('div', { class: 'a-btns' },
            h('button', { class: 'btn primary', onclick: () => close('once') }, 'Allow once'),
            h('button', { class: 'btn', onclick: () => close('site') }, 'Always on ' + (req.host || 'this site')),
            h('button', { class: 'btn danger', onclick: () => close('stop') }, 'Stop')));
        dock.hidden = false;
        document.body.dataset.asking = '1';
        dock.append(card);
        this.scroll()
      })
    },
    ask(q) {
      return new Promise(resolve => {
        const dock = $('dock');
        const input = h('input', { class: 'ask-in', placeholder: 'Type your answer…' });
        const card = h('div', { class: 'approve' },
          h('div', { class: 'a-t' }, h('span', { class: 'glyph', html: WARN_GLYPH }), 'ChromeBot asks'),
          h('div', { class: 'a-why' }, q),
          h('form', {
            class: 'a-btns', onsubmit: e => {
              e.preventDefault();
              const v = input.value.trim(); if (!v) return;
              card.remove(); dock.hidden = !dock.children.length; delete document.body.dataset.asking; resolve(v)
            }
          }, input, h('button', { class: 'btn primary', type: 'submit' }, 'Send')));
        dock.hidden = false;
        document.body.dataset.asking = '1';
        dock.append(card);
        this.scroll(); input.focus()
      })
    },
    // First-run: capability framing plus concrete starters — never "How can I help?"
    empty(on) {
      const f = $('feed');
      const old = f.querySelector('.empty');
      if (old) old.remove();
      if (!on || f.children.length) return;
      f.append(h('div', { class: 'empty' },
        h('div', { class: 'mark', html: MASCOT }),
        h('h2', {}, 'ChromeBot acts on this page'),
        h('p', {}, 'Describe a task and it will read the page, plan, act, and report back — pausing before anything hard to undo.')))
    }
  };

  // ---------- status / hint / chips ----------
  function hint(t) {
    const el = $('hint');
    el.textContent = '';
    if (!t) return;
    // Animated dots so a long model round-trip reads as "working", not "frozen".
    el.append(h('span', { class: 'run', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), document.createTextNode(t))
  }
  function phase(p) {
    setOrb(p);
    document.body.dataset.phase = p;
    if (p === 'idle') feed.sealReasoning()
  }
  function chips(list) {
    const box = $('chips');
    box.replaceChildren(...(list || []).map(t =>
      h('button', { class: 'chip', onclick: () => CBHOOKS?.chip?.(t) }, t)))
  }

  let toastTimer;
  function toast(t) {
    let el = $('toast');
    el.textContent = t;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), 2400)
  }

  // ---------- sheets ----------
  function openSheet(id) {
    for (const s of document.querySelectorAll('.sheet-host')) s.hidden = s.id !== id;
    document.body.classList.add('sheet-open')
  }
  function closeSheets() {
    for (const s of document.querySelectorAll('.sheet-host')) s.hidden = true;
    document.body.classList.remove('sheet-open')
  }
  // Scope tabs to the visible sheet so Settings/History don't fight each other.
  function tab(name) {
    const host = [...document.querySelectorAll('.sheet-host')].find(s => !s.hidden);
    const root = host || document;
    for (const b of root.querySelectorAll('.stab')) b.classList.toggle('on', b.dataset.tab === name);
    for (const p of root.querySelectorAll('.spane')) p.hidden = p.dataset.pane !== name
  }

  // ---------- lists ----------
  const emptyList = (title, body) => h('div', { class: 'empty-list' }, h('b', {}, title), body);
  function historyList(entries) {
    const box = $('histList');
    if (!box) return;
    if (!entries.length) return box.replaceChildren(emptyList('No runs yet',
      'Type a task in the chat and press Run. Finished runs show up here so you can re-run them.'));
    box.replaceChildren(...entries.map(e => h('div', { class: 'hrow' },
      h('div', { class: 'h-main' },
        h('div', { class: 'h-task' }, e.task),
        h('div', { class: 'h-meta' }, (e.site || '').replace(/^https?:\/\//, '').slice(0, 40), ' · ',
          new Date(e.startedAt || Date.now()).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          ' · ', (e.steps || 0) + ' steps', e.status === 'done' ? ' · ✓' : e.status === 'error' ? ' · ⚠' : '')),
      h('button', { class: 'mini', onclick: () => CBHOOKS?.rerun?.(e) }, 'Re-run'))))
  }
  function scheduleList(entries) {
    const box = $('schedList');
    if (!box) return;
    if (!entries.length) return box.replaceChildren(emptyList('Nothing scheduled',
      'Add a recurring job below (for example “check the price of X” every morning).'));
    box.replaceChildren(...entries.map(s => h('div', { class: 'hrow' },
      h('div', { class: 'h-main' },
        h('div', { class: 'h-task' }, s.task),
        h('div', { class: 'h-meta' }, s.everyMinutes ? 'every ' + s.everyMinutes + ' min' : 'daily at ' + s.dailyAt,
          s.enabled ? ' · on' : ' · off')),
      h('button', { class: 'mini', onclick: () => CBHOOKS?.toggleSchedule?.(s.id) }, s.enabled ? 'Pause' : 'Resume'),
      h('button', { class: 'mini danger', onclick: () => CBHOOKS?.delSchedule?.(s.id) }, 'Delete'))))
  }
  function memoryList(facts) {
    const box = $('memList');
    if (!facts || !facts.length) return box.replaceChildren(emptyList('Nothing remembered yet',
      'Facts the agent learns or you add appear here — stored only in this browser.'));
    box.replaceChildren(...facts.map((f, i) => h('div', { class: 'hrow' },
      h('div', { class: 'h-main' }, h('div', { class: 'h-task' }, f.fact), h('div', { class: 'h-meta' }, f.site || 'global')),
      h('button', { class: 'mini danger', onclick: () => CBHOOKS?.delFact?.(i) }, 'Forget'))))
  }
  function sitesList(sites) {
    const box = $('sitesList');
    const keys = Object.keys(sites || {});
    if (!keys.length) return box.replaceChildren(emptyList('No site permissions granted',
      '“Always on this site” approvals land here.'));
    box.replaceChildren(...keys.map(k => h('div', { class: 'hrow' },
      h('div', { class: 'h-main' }, h('div', { class: 'h-task' }, k.replace(/^https?:\/\//, '')), h('div', { class: 'h-meta' }, 'trusted — fewer approval prompts')),
      h('button', { class: 'mini danger', onclick: () => CBHOOKS?.revokeSite?.(k) }, 'Revoke'))))
  }

  function onboardShow() { /* no-op: the first-run modal was a stuck UI */ }
  function onboardHide() { const o = $('onboard'); if (o) o.hidden = true }

  // ---------- wiring (static events only; behaviour comes from CBHOOKS) ----------
  function wire() {
    for (const id of ['aboutHero']) {
      const el = $(id);
      if (el && !el.firstChild) el.innerHTML = MASCOT
    }
    const on = (id, ev, fn) => { const el = $(id); if (el) el[ev] = fn };
    on('histBtn', 'onclick', () => CBHOOKS?.openDrawer?.());
    on('gearBtn', 'onclick', () => CBHOOKS?.openSettings?.());
    on('sheetClose', 'onclick', closeSheets);
    on('settingsBack', 'onclick', closeSheets);
    on('drawerBack', 'onclick', closeSheets);
    const cd = document.querySelector('.close-drawer');
    if (cd) cd.onclick = closeSheets;
    for (const host of document.querySelectorAll('.sheet-host')) {
      host.addEventListener('click', e => { if (e.target === host) closeSheets() })
    }
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.body.classList.contains('sheet-open')) { e.preventDefault(); closeSheets() }
    });
    for (const b of document.querySelectorAll('.stab')) b.onclick = () => tab(b.dataset.tab);
    on('liveStop', 'onclick', () => CBHOOKS?.stop?.());
    on('run', 'onclick', () => CBHOOKS?.run?.());
    on('mic', 'onclick', () => CBHOOKS?.mic?.());
    on('liveToggle', 'onclick', () => {
      const c = $('liveCard');
      c.dataset.open = c.dataset.open === '1' ? '0' : '1';
      live.toggleText()
    });

    const task = $('task');
    const send = $('run');
    const autosize = () => {
      task.style.height = 'auto';
      task.style.height = Math.min(110, task.scrollHeight) + 'px';
      send.classList.toggle('armed', !!task.value.trim())
    };
    if (task) {
      task.addEventListener('input', autosize);
      task.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (task.value.trim()) CBHOOKS?.run?.() }
        if (e.key === 'Escape' && document.body.dataset.phase !== 'idle') { e.preventDefault(); CBHOOKS?.stop?.() }
      });
      autosize()
    }
    on('addFactBtn', 'onclick', () => CBHOOKS?.addFact?.($('addFact')?.value?.trim()));
    feed.empty(true)
  }

  window.CBUI = {
    h, ICON, MASCOT, applyTheme, setOrb, setGuardPill, setSite, setModel,
    live, feed, hint, phase, chips, toast,
    openSheet, closeSheets, tab, historyList, scheduleList, memoryList, sitesList,
    onboardShow, onboardHide, wire
  }
})();
