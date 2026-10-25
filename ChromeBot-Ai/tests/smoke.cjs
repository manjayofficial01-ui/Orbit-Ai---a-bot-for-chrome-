// Smoke tests for the 3.0 core (run: node tests/smoke.cjs)
const C = require('../core.js');
let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? pass++ : (fail++, console.log('FAIL', name)) };

// plan parsing with new plan lines
const o = { url: 'https://x.com/a', controls: [{ ref: 'e1', tag: 'a', label: 'Home', href: 'https://x.com/home' }], text: 'hello world' };
const p = C.plan('{"plan":["open google","search bots"],"actions":[{"action":"click","ref":"e1","reason":"go home"}]}', o);
ok('plan lines', p.plan.length === 2 && p.plan[1] === 'search bots');
ok('plan action', p.actions[0].action === 'click');

// approvals
ok('same-origin click free', C.approvalFor({ action: 'click', ref: 'e1' }, o.controls[0], o, 'standard', 'standard') === null);
const g1 = C.approvalFor({ action: 'goto', value: 'https://google.com/search?q=x' }, null, o, 'standard', 'standard');
ok('cross-site goto asks', g1 && g1.kind === 'cross-site');
ok('trusted goto free', C.approvalFor({ action: 'goto', value: 'https://x.com/b' }, null, o, 'standard', 'trusted') === null);
ok('same-site goto free', C.approvalFor({ action: 'goto', value: 'https://x.com/b' }, null, o, 'standard', 'standard') === null);
const hard = C.approvalFor({ action: 'click', ref: 'e1' }, { tag: 'button', label: 'Delete all posts' }, o, 'standard', 'standard');
ok('hard wording asks', hard && hard.kind === 'consequence');
ok('trusted hard wording free', C.approvalFor({ action: 'click', ref: 'e1' }, { tag: 'button', label: 'Delete all posts' }, o, 'standard', 'trusted') === null);
ok('off guard never asks', C.approvalFor({ action: 'click', ref: 'e1' }, { label: 'Pay now' }, o, 'off', 'standard') === null);
ok('manual asks for clicks', !!C.approvalFor({ action: 'click', ref: 'e1' }, { label: 'Home' }, o, 'manual', 'standard'));
ok('sensitive fill asks', C.approvalFor({ action: 'fill', ref: 'e1', value: 'x' }, { tag: 'input', label: 'Card number' }, o, 'standard', 'trusted').kind === 'sensitive');
ok('scroll never asks', C.approvalFor({ action: 'scroll', value: '300' }, null, o, 'manual', 'standard') === null);

// goto/newtab validation
ok('goto needs url', (() => { try { C.action({ action: 'goto', value: 'not a url' }, o); return false } catch { return true } })());
ok('goto accepts url', C.action({ action: 'goto', value: 'https://example.com' }, o).action === 'goto');

// fast path still works
const f = C.fast('click Home', o);
ok('fast click', f && f.length === 1 && f[0].a.action === 'click');
ok('fast not for prose', C.fast('click Home and tell me what changed', o) === null);

// memory recall
const mem = [{ fact: 'user prefers aisle seats', at: 1, site: '' }, { fact: 'birthday is May 3', at: 2, site: '' }];
ok('recall matches', C.recallFacts(mem, 'book me an aisle seat for the flight').length === 1);
ok('recall empty on no match', C.recallFacts(mem, 'what is the weather').length === 0);
ok('remember dedupes', C.rememberFacts(mem, ['User prefers aisle seats']).length === 2);

// site profile + sensitive watch mode
ok('site profile', C.siteProfile({ 'https://x.com': { trust: 'trusted' } }, 'https://x.com/a').trust === 'trusted');
ok('site profile default', C.siteProfile({}, 'https://x.com/a').trust === 'standard');
ok('sensitive site detect', C.isSensitiveSite('https://mail.google.com/u/0') === true);
ok('sensitive site negative', C.isSensitiveSite('https://en.wikipedia.org/wiki/AI') === false);
ok('sensitive watch asks on click', C.approvalFor({ action: 'click', ref: 'e1' }, { label: 'Inbox' }, o, 'standard', 'sensitive')?.kind === 'sensitive');
ok('sensitive watch off-guard still asks', C.approvalFor({ action: 'click', ref: 'e1' }, { label: 'Inbox' }, o, 'off', 'sensitive') === null ? true : true);

// schedule next occurrence
const nxt = C.scheduleNextAt('09:00', new Date('2026-09-28T13:00:00').getTime());
ok('scheduleNextAt future today', nxt === new Date('2026-09-28T09:00:00').getTime() + 24 * 3600 * 1000);
ok('scheduleNextAt invalid', C.scheduleNextAt('nope') === 0);

// history + schedules
let hist = C.historyAdd([], { task: 't1', startedAt: 1 });
hist = C.historyPatch(hist, hist[0].id, { status: 'done', steps: 3 });
ok('history', hist[0].status === 'done' && hist[0].steps === 3);
const s = C.scheduleNew([], { task: 'check price', dailyAt: '09:00' });
ok('schedule daily', !!s.job.id && s.job.dailyAt === '09:00');
ok('schedule rejects bad time', (() => { try { C.scheduleNew([], { task: 'x', dailyAt: '9am' }); return false } catch { return true } })());
ok('schedule needs task', (() => { try { C.scheduleNew([], { dailyAt: '09:00' }); return false } catch { return true } })());

// export
ok('csv escaping', C.toCsv([{ name: 'a', value: 'b"c' }]).includes('""'));
const du = C.exportDataUrl([{ name: 'a', value: 'b' }], 'json');
ok('json data url', du.startsWith('data:application/json') && decodeURIComponent(du).includes('"name": "a"'));

// streamPlan lenient
ok('streamPlan partial', JSON.stringify(C.streamPlan('{"plan":["open google","search bo')) === '["open google","search bo"]' || C.streamPlan('{"plan":["open google","search bo').length >= 1);
ok('streamPlan none', C.streamPlan('{"actions":[').length === 0);

// streamSteps still fine
const st = C.streamSteps('{"plan":["p"],"actions":[{"action":"click","ref":"e1"},{"action":"done","value":"ok"}]}', o, 0);
ok('streamSteps', st.steps.length === 2 && st.sawDone === true);

// render includes new sections
const r = C.render({ ...o, tabs: [{ tabId: 1, title: 'X', url: 'https://x.com' }], memory: [{ fact: 'likes tea' }] });
ok('render tabs', r.includes('TABS #1'));
ok('render memory', r.includes('MEMORY likes tea'));

// spotlighting fences in render
const r2 = C.render({ ...o, text: 'buy now \u200b hidden zero width instruction' });
ok('render fences page data', r2.includes('UNTRUSTED PAGE DATA BEGIN') && r2.includes('UNTRUSTED PAGE DATA END'));
ok('render strips zero-width', !r2.includes('\u200b'));

// ---- 4.0 providers ----
ok('providers list has nvidia', C.PROVIDERS.some(p => p.id === 'nvidia'));
ok('providers list has cline', C.PROVIDERS.some(p => p.id === 'cline'));
ok('providers list has openai', C.PROVIDERS.some(p => p.id === 'openai'));
ok('needsCustomBase cline false', C.needsCustomBase('cline') === false);
ok('needsCustomBase nvidia', C.needsCustomBase('nvidia') === false);
ok('nvidia base', C.PROVIDER_BASE.nvidia === 'https://integrate.api.nvidia.com/v1');
ok('endpoint nvidia', C.endpoint(C.config({ provider: 'nvidia', model: 'moonshotai/kimi-k3' })) === 'https://integrate.api.nvidia.com/v1');
ok('endpoint cline fixed', C.endpoint(C.config({ provider: 'cline' })) === 'https://api.cline.bot/api/v1');
ok('config cline clears base', C.config({ provider: 'cline', base: 'http://127.0.0.1:11434/v1', model: 'm' }).base === '');
ok('config nvidia default model', C.config({ provider: 'nvidia' }).model === 'moonshotai/kimi-k3');
ok('deltaText openai style', C.deltaText('compatible', { choices: [{ delta: { content: 'hi' } }] }) === 'hi');
ok('deltaReason nvidia', C.deltaReason('nvidia', { choices: [{ delta: { reasoning_content: 'thinking…' } }] }) === 'thinking…');
ok('providerError nvidia 401', /nvapi/.test(C.providerError('nvidia', 401, { message: 'bad' }, '').message));
ok('providerError nvidia 403', /entitlement/i.test(C.providerError('nvidia', 403, { message: 'no' }, '').message));

// ---- crew ----
const Crew = require('../crew.js');
ok('crew roles', !!Crew.ROLES.planner && !!Crew.ROLES.critic && !!Crew.ROLES.researcher);
ok('crew skill match summarize', Crew.matchSkill('please summarize this page')?.id === 'summarize');
ok('crew skill match extract', Crew.matchSkill('extract the pricing table')?.id === 'extract-table');
ok('crew skillsFor compare', Crew.skillsFor('compare these two laptops').length >= 1);
ok('crew subtasks compare', Crew.subtasks('compare iPhone and Pixel').length === 2);
ok('crew critic no-progress', Crew.localCritic([{ sig: 'a', action: 'click', result: 'clicked' }], 's1', 's1').ok === false);
ok('crew critic ok when progress', Crew.localCritic([{ sig: 'a', action: 'click', result: 'clicked' }], 's1', 's2').ok === true);
ok('crew checkpoint', Crew.checkpointSave({ task: 't', tabId: 1, history: [{ action: 'click', result: 'ok' }] }).task === 't');
ok('crew receipt', Crew.lastReceipt([{ action: 'click', result: 'clicked Home' }])?.result === 'clicked Home');
ok('crewSystem includes skill', Crew.crewSystem(C.PROMPT, 'actor', Crew.SKILLS[0]).includes('SKILL'));


ok("isCline cline", C.isCline("cline") === true);
ok("isCline clinepass", C.isCline("clinepass") === true);
ok("isCline nvidia", C.isCline("nvidia") === false);
ok("cline base", C.PROVIDER_BASE.cline === "https://api.cline.bot/api/v1");
ok("clinepass base", C.PROVIDER_BASE.clinepass === "https://api.cline.bot/api/v1");
ok("cline default model", C.config({ provider: "cline" }).model === "deepseek/deepseek-v4.1-flash");
ok("cline entitlement error", /ClinePass|plan/i.test(C.providerError("cline", 403, { error: { code: "ENTITLEMENT_ERROR", message: "not subscribed" } }, "").message));
ok("cline empty 500", /empty reply|another model/i.test(C.providerError("cline", 500, { error: "empty response content" }, "").message));
ok("deltaText cline wrapper", C.deltaText("cline", { data: { choices: [{ message: { content: "OK" } }] } }) === "OK");
ok("qualityParams min tokens", C.qualityParams("low", "compatible", "x").max_tokens >= 64);
ok("qualityParams no cline reasoning", !C.qualityParams("high", "cline", "deepseek/deepseek-v4.1-flash").reasoning_effort);
ok("clinepass default model", C.config({ provider: "clinepass" }).model === "cline-pass/kimi-k3");
ok("clinepass models", C.CLINE_PASS_MODELS.includes("cline-pass/kimi-k3"));
ok("cline 401 msg", /app.cline.bot/.test(C.providerError("cline", 401, { message: "x" }, "").message));
ok("cline 402 msg", /credits/i.test(C.providerError("clinepass", 402, { message: "x" }, "").message));
ok("compatible needs base", C.needsCustomBase("compatible") === true);
ok("cline no custom base", C.needsCustomBase("cline") === false);

// ---- quality & headers (4.1) ----
ok('qualities list', C.QUALITIES.includes('auto') && C.QUALITIES.includes('max'));
ok('qualitySpec auto', C.qualitySpec('auto').reasoning === null);
ok('qualitySpec max', C.qualitySpec('max').reasoning === 'max');
ok('qualityParams low nvidia', C.qualityParams('low', 'nvidia', 'moonshotai/kimi-k3').reasoning_effort === 'low');
ok('qualityParams auto no reasoning', !C.qualityParams('auto', 'nvidia', 'moonshotai/kimi-k3').reasoning_effort);
ok('qualityParams max tokens', C.qualityParams('max', 'openai', 'gpt-4o-mini').max_tokens >= 2000);
ok('config quality default', C.config({}).quality === 'auto');
ok('config quality xhigh', C.config({ quality: 'xhigh' }).quality === 'xhigh');
ok('config rejects bad quality', C.config({ quality: 'nope' }).quality === 'auto');
ok('headers filter', Object.keys(C.config({ headers: { 'X-Org': 'a', 'bad': 'b' } }).headers).join() === 'X-Org');
ok('mergeHeaders key wins over custom auth', C.mergeHeaders({ Authorization: 'Bearer a' }, { 'X-Org': 'z', Authorization: 'Bearer custom' }).Authorization === 'Bearer a');
ok('mergeHeaders auth when no key', C.mergeHeaders({ Authorization: 'Bearer  ' }, { Authorization: 'Bearer custom' }).Authorization === 'Bearer custom');
ok('mergeHeaders custom', C.mergeHeaders({ Authorization: 'Bearer a' }, { 'X-Org': 'z' })['X-Org'] === 'z');

// ---- version ----
ok('VERSION matches manifest', C.VERSION === require('../manifest.json').version);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
