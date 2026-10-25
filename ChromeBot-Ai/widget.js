// Floating avatar, top frame only. Zero cost until opened; styles inlined so there is
// no stylesheet request and no unstyled flash. 3.0: status ring driven by chrome.storage
// (the panel writes cbStatus), drag, and the popover panel.
(() => {
  if (globalThis.__cbWidget2 || window.top !== window) return;
  globalThis.__cbWidget2 = true;
  const CSS = `:host{all:initial}*,*::before,*::after{box-sizing:border-box}
.a{position:fixed;width:54px;height:54px;padding:0;border:0;border-radius:50%;
background:transparent;cursor:grab;display:grid;place-items:center;pointer-events:auto;touch-action:none}
.a:active{cursor:grabbing}
.a .disc{position:relative;width:48px;height:48px;border-radius:50%;
background:radial-gradient(120% 120% at 30% 20%,#1d3350,#0b1220);
box-shadow:0 6px 22px #0008, inset 0 0 0 1px #ffffff26;display:grid;place-items:center;
transition:box-shadow .25s}
.a svg.mark{width:30px;height:30px;display:block}
.a .ring{position:absolute;inset:-4px;border-radius:50%;opacity:0;transition:opacity .25s;
background:conic-gradient(from 0deg,#4fd1ff,#8b7cff,#4fd1ff);
-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 3.5px),#000 calc(100% - 3px));
mask:radial-gradient(farthest-side,transparent calc(100% - 3.5px),#000 calc(100% - 3px))}
.a[data-status="act"] .ring,.a[data-status="think"] .ring{opacity:1;animation:spin 1.4s linear infinite}
.a[data-status="act"] .disc{box-shadow:0 6px 26px #4fd1ff66, inset 0 0 0 1px #4fd1ff88}
.a[data-status="ask"] .ring{opacity:1;animation:none;background:#f5b544}
.a[data-status="ask"] .disc{box-shadow:0 6px 26px #f5b54466, inset 0 0 0 1px #f5b54488}
.a[data-status="ok"] .disc{box-shadow:0 6px 22px #3ddc9766, inset 0 0 0 1px #3ddc9788}
.a[data-status="bad"] .disc{box-shadow:0 6px 22px #ff6b7a66, inset 0 0 0 1px #ff6b7a88}
@keyframes spin{to{transform:rotate(360deg)}}
.b{position:fixed;display:flex;flex-direction:column;width:360px;height:520px;max-width:calc(100vw - 16px);
max-height:calc(100vh - 16px);border:1px solid #ffffff20;border-radius:16px;overflow:hidden;
background:#0a0b0df2;box-shadow:0 20px 60px #000b;pointer-events:auto}
.b[hidden]{display:none}
.a[hidden]{display:none}
.h{flex:none;height:32px;display:flex;align-items:center;gap:7px;padding:0 9px;border-bottom:1px solid #ffffff14;
background:#ffffff08;color:#cfd8e3;font:550 11px ui-sans-serif,system-ui,sans-serif}
.h i{width:6px;height:6px;border-radius:50%;background:#4fd1ff;flex:none}
.h b{flex:1;font-weight:550;letter-spacing:.01em}
.h button{border:0;background:none;color:#9fa9b6;cursor:pointer;font:14px/1 ui-sans-serif;padding:2px 4px}
.h button:hover{color:#fff}
.h button.on{color:#4fd1ff}
.grip{position:absolute;right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;z-index:2;touch-action:none}
.grip::after{content:'';position:absolute;right:4px;bottom:4px;width:8px;height:8px;
border-right:1px solid #ffffff66;border-bottom:1px solid #ffffff66;border-radius:0 0 3px 0}
iframe{flex:1;width:100%;min-height:0;border:0;background:#0a0b0d}`;
  const MARK = '<svg class="mark" viewBox="0 0 48 48" aria-hidden="true">'
    + '<path d="M24 4c9 0 15 6.2 15 15 0 2.6-.4 5-1.2 7.2-.9-6.7-3.4-9.4-6.3-10.4-2.6 1.9-7.5 2.6-11.7 1.8-2.6-.5-4.9-1.6-6.4-3.4C10.6 17 9.6 22 9.4 27.4 8.5 25.1 8 22.7 8 19 8 10.2 15 4 24 4Z" fill="#1d2946"/>'
    + '<path d="M11 16.6C13.3 13 18 10.6 24 10.6S34.7 13 37 16.6c.9 2.6 1.4 5.6 1.4 8.6 0 10.5-6.4 18.3-14.4 18.3S9.6 35.7 9.6 25.2c0-3 .5-6 1.4-8.6Z" fill="#10182e"/>'
    + '<rect x="12" y="20" width="24" height="9.5" rx="4.7" fill="#4fd1ff"/>'
    + '<circle cx="19.5" cy="24.8" r="1.9" fill="#eaffff"/><circle cx="28.5" cy="24.8" r="1.9" fill="#eaffff"/>'
    + '</svg>';

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;pointer-events:none';
  (document.body || document.documentElement).append(host);
  const root = host.attachShadow({ mode: 'closed' });
  root.append(Object.assign(document.createElement('style'), { textContent: CSS }));

  const avatar = Object.assign(document.createElement('button'), { className: 'a', title: 'ChromeBot Ai', 'aria-label': 'Open ChromeBot Ai' });
  avatar.innerHTML = '<span class="ring"></span><span class="disc">' + MARK + '</span>';
  const box = document.createElement('section');
  box.className = 'b';
  box.hidden = true;
  box.innerHTML = '<div class="h"><i></i><b>ChromeBot Ai</b>'
    + '<button class="foc" title="Hide title bar and suggestions">▭</button>'
    + '<button class="exp" title="Expand / shrink">⤢</button>'
    + '<button class="pop" title="Open in side panel">↗</button>'
    + '<button class="cls" title="Close">×</button></div>';
  root.append(avatar, box);

  // status mirror: the panel writes chrome.storage.local.cbStatus
  let lastStatus = 'idle';
  const paint = s => { avatar.dataset.status = s || 'idle'; lastStatus = s || 'idle' };
  try {
    chrome.storage.local.get('cbStatus').then(v => paint(v.cbStatus?.status));
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === 'local' && ch.cbStatus) paint(ch.cbStatus.newValue?.status)
    })
  } catch { }

  let x = 0, y = 0, drag = null;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const DEF = { w: 360, h: 520 };
  let size = { ...DEF }, focus = false, frame = null;
  const save = () => chrome.storage.local.set({ cbWidget: { w: size.w, h: size.h, focus } }).catch(() => { });
  const isBig = () => size.w > DEF.w + 4 || size.h > DEF.h + 4;
  function sync() {
    box.querySelector('.exp').classList.toggle('on', isBig());
    box.querySelector('.foc').classList.toggle('on', focus)
  }
  function place(nx, ny) {
    x = clamp(nx, 8, innerWidth - 62); y = clamp(ny, 8, innerHeight - 62);
    avatar.style.left = x + 'px'; avatar.style.top = y + 'px';
    layout()
  }
  function layout() {
    if (box.hidden) return;
    const w = clamp(size.w, 300, innerWidth - 16), h = clamp(size.h, 320, innerHeight - 16);
    const left = clamp(x + 60 + w < innerWidth ? x + 58 : x - w - 8, 8, Math.max(8, innerWidth - w - 8));
    const top = clamp(y - h - 8 >= 8 ? y - h - 8 : y + 58, 8, Math.max(8, innerHeight - h - 8));
    Object.assign(box.style, { width: w + 'px', height: h + 'px', left: left + 'px', top: top + 'px' })
  }
  // The panel owns focus mode; the widget is a remote control for it.
  const pushFocus = () => { try { frame?.contentWindow?.postMessage({ cb: 'chromebot', kind: 'chrome', on: focus }, '*') } catch { } };
  function open() {
    box.hidden = false; avatar.hidden = true;
    layout();
    if (!frame) {
      frame = document.createElement('iframe');
      frame.title = 'ChromeBot Ai';
      frame.setAttribute('allow', 'microphone');
      frame.src = chrome.runtime.getURL('panel.html');
      frame.onload = pushFocus;
      box.append(frame)
    } else pushFocus();
    sync()
  }
  function close() { box.hidden = true; avatar.hidden = false }
  box.querySelector('.cls').onclick = close;
  box.querySelector('.pop').onclick = () => {
    close();
    chrome.runtime.sendMessage({ kind: 'OPEN_PANEL' }, () => void chrome.runtime.lastError)
  };
  box.querySelector('.exp').onclick = () => {
    size = isBig() ? { ...DEF } : { w: Math.max(520, innerWidth - 40), h: Math.max(600, innerHeight - 40) };
    save(); layout(); sync()
  };
  box.querySelector('.foc').onclick = () => { focus = !focus; save(); pushFocus(); sync() };

  const grip = document.createElement('div');
  grip.className = 'grip'; grip.title = 'Drag to resize';
  box.append(grip);
  let rz = null;
  grip.onpointerdown = e => {
    grip.setPointerCapture(e.pointerId);
    rz = { X: e.clientX, Y: e.clientY, w: size.w, h: size.h };
    e.preventDefault(); e.stopPropagation()
  };
  grip.onpointermove = e => {
    if (!rz) return;
    size = { w: clamp(rz.w + e.clientX - rz.X, 300, innerWidth - 16), h: clamp(rz.h + e.clientY - rz.Y, 320, innerHeight - 16) };
    layout()
  };
  grip.onpointerup = () => { if (!rz) return; rz = null; save(); sync() };
  grip.onpointercancel = () => rz = null;

  const EXT = chrome.runtime.getURL('').replace(/\/$/, '');
  addEventListener('message', e => {
    if (e.origin !== EXT || !e.data || e.data.cb !== 'chromebot' || e.data.kind !== 'chromeState') return;
    focus = !!e.data.on; save(); sync()
  });

  avatar.onpointerdown = e => {
    avatar.setPointerCapture(e.pointerId);
    drag = { X: e.clientX, Y: e.clientY, x, y, moved: false }
  };
  avatar.onpointermove = e => {
    if (!drag) return;
    const dx = e.clientX - drag.X, dy = e.clientY - drag.Y;
    if (!drag.moved && Math.hypot(dx, dy) > 6) drag.moved = true;
    if (drag.moved) place(drag.x + dx, drag.y + dy)
  };
  avatar.onpointerup = () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (moved) {
      place(x + 27 < innerWidth / 2 ? 8 : innerWidth - 62, y);
      chrome.storage.local.set({ cbPosition: { x: x / innerWidth, y: y / innerHeight } })
    } else box.hidden ? open() : close()
  };
  avatar.onpointercancel = () => drag = null;
  addEventListener('resize', () => place(x, y), { passive: true });
  new MutationObserver(() => { if (!host.isConnected) document.documentElement.append(host) })
    .observe(document.documentElement, { childList: true });
  chrome.storage.local.get(['cbPosition', 'cbWidget']).then(v => {
    const c = v.cbWidget;
    if (c) size = { w: c.w || DEF.w, h: c.h || DEF.h };
    focus = !!c?.focus;
    const p = v.cbPosition;
    place(p ? clamp(p.x * innerWidth, 8, innerWidth - 62) : innerWidth - 70, p ? clamp(p.y * innerHeight, 8, innerHeight - 62) : innerHeight - 132)
  });
})();
