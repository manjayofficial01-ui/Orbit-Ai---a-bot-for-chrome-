// Service worker: chrome-level powers the side panel cannot reach — tab creation,
// screenshots, downloads, notifications, scheduled tasks. The agent loop itself still
// lives in the panel document (MV3 kills idle workers); this file answers requests and
// emits events, it never runs tasks on its own except alarm-triggered wake-ups, whose
// heavy lifting is handed back to the panel via a queued job message.
const openPanel = target => chrome.sidePanel.open(target).then(() => true, () => false);
const keepBehavior = () => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => { });

chrome.runtime.onInstalled.addListener(() => {
  keepBehavior();
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'cb-run', title: 'Ask ChromeBot about this', contexts: ['selection', 'page'] });
    chrome.contextMenus.create({ id: 'cb-act', title: 'Do something with this page', contexts: ['page'] })
  })
});
chrome.runtime.onStartup.addListener(keepBehavior);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!['cb-run', 'cb-act'].includes(info.menuItemId) || !tab?.id) return;
  const seed = String(info.selectionText || '').slice(0, 400);
  const task = info.menuItemId === 'cb-act' ? (seed || 'Analyze this page and tell me what I can do here.') : seed;
  chrome.storage.session.set({ cbSeed: task }).then(() =>
    openPanel({ windowId: tab.windowId }).then(() => chrome.runtime.sendMessage({ kind: 'SEED', task }).catch(() => { })));
});

chrome.webNavigation.onCommitted.addListener(d => {
  if (d.frameId === 0) chrome.runtime.sendMessage({ kind: 'NAV', tabId: d.tabId, url: d.url }).catch(() => { })
});

// ---- agent powers: one typed bridge, one permission surface ----
// The panel asks; the worker acts. Every channel is named so the audit log can say
// exactly which capability was used, and so a compromised panel could not reach
// anything beyond these explicit operations.
const powers = {
  // Multi-tab control: the planner gains open/goto/new-tab actions without ever
  // getting raw chrome.tabs power.
  async openTab({ url, active = true, windowId }) {
    const t = await chrome.tabs.create({ url: normalizeUrl(url), active, ...(windowId ? { windowId } : {}) });
    return { tabId: t.id, url: t.url || url }
  },
  async goto({ tabId, url }) {
    await chrome.tabs.update(tabId, { url: normalizeUrl(url) });
    return { tabId }
  },
  async closeTab({ tabId }) { await chrome.tabs.remove(tabId); return { closed: true } },
  async activateTab({ tabId }) { await chrome.tabs.update(tabId, { active: true }); return { ok: true } },
  async listTabs() {
    const all = await chrome.tabs.query({});
    return all.filter(t => /^https?:/.test(t.url || '')).slice(0, 30)
      .map(t => ({ tabId: t.id, title: (t.title || '').slice(0, 80), url: t.url.slice(0, 160) }))
  },
  // Screenshot of the visible area of a tab — evidence for the transcript and grounding
  // for the planner when DOM text is not enough.
  async screenshot({ tabId }) {
    const url = await chrome.tabs.captureVisibleTab(undefined, { format: 'jpeg', quality: 60 });
    return { dataUrl: url }
  },
  // Data export: land extracted data as a real file instead of a clipboard echo.
  async download({ dataUrl, filename }) {
    const id = await chrome.downloads.download({ url: dataUrl, filename: safeName(filename), saveAs: false });
    return { downloadId: id }
  },
  // Notification for finished background tasks.
  async notify({ title, message }) {
    return chrome.notifications.create({
      type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: String(title).slice(0, 60), message: String(message).slice(0, 180)
    })
  }
};
function normalizeUrl(u) {
  const s = String(u || '').trim();
  if (!/^https?:\/\//i.test(s)) return 'https://' + s.replace(/^\/+/, '');
  return s
}
function safeName(s) {
  return String(s || 'chromebot-export').replace(/[^\w.\- ]+/g, '_').slice(0, 80)
}

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m?.kind === 'OPEN_PANEL') {
    const windowId = sender.tab?.windowId ?? sender.windowId;
    if (windowId == null) return reply(false);
    return openPanel({ windowId }).then(reply)
  }
  if (m?.kind !== 'POWER') return;
  const fn = powers[m.power];
  if (!fn) return reply({ ok: false, error: 'unknown power ' + m.power });
  fn(m.args || {}).then(
    r => reply({ ok: true, data: r }),
    e => reply({ ok: false, error: e?.message || String(e) })
  );
  return true
});

// ---- scheduled tasks ----
// Alarms wake the worker; the job spec lives in storage.local; the panel (or an
// offscreen fallback in future) executes the actual run. If the panel is closed, we
// queue the run and notify the user, so a schedule never silently dies.
chrome.alarms.onAlarm.addListener(async a => {
  if (!a.name.startsWith('cb-task-')) return;
  const { cbSchedules } = await chrome.storage.local.get('cbSchedules');
  const job = (cbSchedules || []).find(j => j.id === a.name.slice(8));
  if (!job || !job.enabled) return;
  // Daily schedules re-arm for the next occurrence; periodic ones keep their period.
  if (job.dailyAt) {
    const nextAt = dailyNext(job.dailyAt);
    if (nextAt) chrome.alarms.create(a.name, { when: nextAt, periodInMinutes: 24 * 60 });
  }
  // Try to run via an open panel; otherwise persist a queued run and notify.
  const panelUp = await chrome.runtime.sendMessage({ kind: 'WAKE_RUN', job }).then(() => true, () => false);
  if (!panelUp) {
    const { cbQueue } = await chrome.storage.local.get('cbQueue');
    const queue = cbQueue || [];
    queue.push({ ...job, queuedAt: Date.now() });
    await chrome.storage.local.set({ cbQueue: queue.slice(-20) });
    chrome.notifications.create({
      type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'ChromeBot scheduled task',
      message: '“' + job.task.slice(0, 90) + '” is due, but the panel is closed. Open ChromeBot to run it.'
    }).catch(() => { })
  }
});
function dailyNext(hhmm, from = Date.now()) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm || ''));
  if (!m) return 0;
  const d = new Date(from);
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +m[1], +m[2], 0, 0).getTime();
  return t > from ? t : t + 24 * 3600 * 1000
}
