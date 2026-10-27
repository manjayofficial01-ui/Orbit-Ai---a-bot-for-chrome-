import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHECKIN_LIMITS, checkinInstruction, parseCheckinReply, sameTitle, filterSuggestions, hiddenFresh,
} from '../src/checkin.js';

test('the check-in instruction carries the read-only posture and the silence rule', () => {
  const first = checkinInstruction({ since: '2026-10-27T09:00:00.000Z', now: '2026-10-28T09:00:00.000Z', firstRun: true, openTitles: [], hiddenTitles: [] });
  assert.match(first, /first check-in/);
  assert.match(first, /only read in this run/);
  assert.match(first, /silence is the right outcome/);
  assert.match(first, /orbit-checkin/);
  assert.match(first, /untrusted data/);
  const later = checkinInstruction({ since: '2026-10-27T09:00:00.000Z', now: '2026-10-28T09:00:00.000Z', firstRun: false, openTitles: ['Check the invoice'], hiddenTitles: ['Renew the domain'] });
  assert.match(later, /2026-10-27T09:00:00\.000Z/);
  assert.match(later, /- Check the invoice/);
  assert.match(later, /- Renew the domain/);
  assert.match(later, new RegExp(String(CHECKIN_LIMITS.maxSuggestions)));
});

test('parseCheckinReply splits prose from the fenced block and survives a broken body', () => {
  const good = parseCheckinReply('Two things changed.\n\n```orbit-checkin\n{"suggestions":[{"title":"Reply to Rosa","detail":"She asked twice today.","source":"mail.example.com"},{"title":"","detail":"dropped"}]}\n```');
  assert.equal(good.prose, 'Two things changed.');
  assert.equal(good.suggestions.length, 1);
  assert.equal(good.suggestions[0].title, 'Reply to Rosa');
  const broken = parseCheckinReply('Words.\n\n```orbit-checkin\n{"suggestions":[oops}\n```');
  assert.equal(broken.suggestions.length, 0, 'an unparseable body is no suggestions, never an error');
  assert.match(broken.prose, /Words/);
  const absent = parseCheckinReply('Nothing new on your pages.');
  assert.equal(absent.suggestions.length, 0);
  assert.match(absent.prose, /Nothing new/);
  const untyped = parseCheckinReply('```orbit-checkin\n{"suggestions":["a string",42,null,{"title":"Kept"}]}\n```');
  assert.deepEqual(untyped.suggestions.map((s) => s.title), ['Kept'], 'non-object entries are dropped, not fatal');
});

test('sameTitle ignores case, whitespace and trailing punctuation', () => {
  assert.ok(sameTitle('Reply to Rosa.', 'reply   to ROSA'));
  assert.ok(!sameTitle('Reply to Rosa', 'Reply to Nora'));
  assert.ok(!sameTitle('', ''));
});

test('filterSuggestions enforces the per-run cap and the open/hidden lists', () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ title: 'Suggestion ' + i, detail: 'd' }));
  const capped = filterSuggestions(many, {});
  assert.equal(capped.kept.length, CHECKIN_LIMITS.maxSuggestions);
  assert.ok(capped.notes.some((n) => /dropped/.test(n)));
  const duped = filterSuggestions(
    [{ title: 'Reply to Rosa', detail: 'a' }, { title: 'reply to Rosa.', detail: 'b' }],
    { openTitles: ['Reply to Rosa'] },
  );
  assert.equal(duped.kept.length, 0, 'an open suggestion is never offered again, however worded');
  const hidden = filterSuggestions([{ title: 'Renew the domain', detail: 'a' }], { hiddenTitles: ['renew the domain'] });
  assert.equal(hidden.kept.length, 0);
  assert.ok(hidden.notes.some((n) => /hid it earlier/.test(n)));
  const clipped = filterSuggestions([{ title: 'x'.repeat(500), detail: 'y'.repeat(5000), source: 'z'.repeat(200) }], {});
  assert.equal(clipped.kept[0].title.length, CHECKIN_LIMITS.titleChars);
  assert.equal(clipped.kept[0].detail.length, CHECKIN_LIMITS.detailChars);
});

test('hidden suggestions only suppress for the hidden window', () => {
  const now = Date.now();
  assert.equal(hiddenFresh([{ title: 'Old', at: now - (CHECKIN_LIMITS.hiddenDays + 1) * 86400000 }], now).length, 0);
  assert.equal(hiddenFresh([{ title: 'Fresh', at: now - 86000000 }], now).length, 1);
  assert.equal(hiddenFresh([{ title: '' }, null, 'junk', { at: now }], now).length, 0, 'malformed entries never suppress anything');
});
