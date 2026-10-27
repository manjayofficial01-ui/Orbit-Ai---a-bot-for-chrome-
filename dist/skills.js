// Orbit skills — OpenDuet's `skills.yaml` idea, ported to a client-only extension.
//
// WHY THIS EXISTS. A model picks the right tool reliably out of about ten and
// unreliably out of thirty. Orbit's operator now offers 22 action tools, so every
// turn risks the wrong pick. OpenDuet solves this by declaring, next to each skill,
// the tools that skill needs, and offering the model only the matching skills' tools
// per run. This module is that declaration and that router.
//
// A skill adds no capability: it can only ask for tools the operator already has, and
// every action still goes through the approval gate.

/**
 * The always-offered floor. Reading the page and finishing are never gated behind a
 * skill match: without them the model cannot observe, and cannot stop.
 */
export const BASELINE_TOOLS = ['snapshot', 'extract', 'wait', 'done', 'memory_save'];

/**
 * The skill catalogue.
 *
 * `tools` is the point of the entry, not decoration: `narrowTools` intersects the
 * operator's tool set with the matched skills' tools, so a form-filling run is never
 * offered `goto` and a research run is never offered `computer_write_file`.
 *
 * `triggers` are matched against the user's own words — the phrase they would type,
 * not a label for a feature (OpenDuet's rule for a skill summary).
 */
export const SKILLS = [
  {
    slug: 'fill-a-form',
    title: 'Fill in a form',
    summary: 'Put my details into the fields on this page.',
    triggers: ['fill', 'form', 'enter', 'type in', 'input', 'apply', 'checkout', 'signup', 'sign up', 'register', 'submit'],
    tools: ['snapshot', 'fill', 'type', 'select', 'click', 'press', 'focus', 'scroll', 'computer_read', 'wait', 'done'],
    instructions:
      'Snapshot first and work only from the refs it returns. Fill the fields the person named and stop there: do not invent a value for a field they did not give you. After the last field, call computer_read to report what the page now shows. Do not press Enter or click a submit control unless they asked you to submit.',
  },
  {
    slug: 'extract-data',
    title: 'Pull data off the page',
    summary: 'Take the items, prices or rows on this page and give them to me as a list or table.',
    triggers: ['extract', 'pull', 'scrape', 'list all', 'table', 'rows', 'prices', 'collect', 'gather', 'copy the data'],
    tools: ['snapshot', 'extract', 'scroll', 'click', 'computer_read', 'wait', 'done'],
    instructions:
      'Call extract for the structured outline before answering. Read what it returned rather than what you expect a page like this to say. If the list continues past what one screen holds, scroll and extract again, and say how many items you actually read. Give the data as a table, and name the page it came from.',
  },
  {
    slug: 'compare-pages',
    title: 'Compare pages or tabs',
    summary: 'Compare what two open pages say about the same thing.',
    triggers: ['compare', 'versus', ' vs ', 'difference between', 'which is better', 'contrast'],
    tools: ['read-tab', 'snapshot', 'extract', 'computer_read', 'done'],
    instructions:
      'Read each page with read-tab and snapshot before comparing anything. Compare only what both pages actually state; where one is silent, say so rather than filling the gap from your own knowledge. Answer in a short table of the differences that matter, then one sentence on what you would choose and why.',
  },
  {
    slug: 'verify-a-claim',
    title: 'Check a claim against this page',
    summary: 'Check whether what I was told is what this page actually says.',
    triggers: ['verify', 'fact check', 'fact-check', 'is it true', 'check whether', 'confirm that', 'does it say', 'accurate'],
    tools: ['snapshot', 'extract', 'scroll', 'computer_read', 'done'],
    instructions:
      'You are checking a claim, not answering a question. Find the passage that would settle it and quote the sentence you are relying on. Then say one of three things: the page supports the claim, the page contradicts it, or the page does not address it. "The page does not say" is a complete answer.',
  },
  {
    slug: 'sign-in',
    title: 'Sign in and carry on',
    summary: 'Get past a sign-in so the task can continue.',
    triggers: ['sign in', 'signin', 'log in', 'login', 'password', 'two-factor', '2fa', 'verification code', 'captcha', 'authenticate'],
    tools: ['snapshot', 'click', 'fill', 'type', 'press', 'computer_request_secret', 'computer_request_help', 'computer_read', 'wait', 'done'],
    instructions:
      'You never see or ask for a password, a code or a card number. If the page needs one value, click the field and call computer_request_secret with that field ref and a short label: the person types it into a masked box that goes straight to the page. If it needs more than one field, or a code sent to a phone, or a CAPTCHA, call computer_request_help and say exactly what you need done. Never write "please sign in and let me know" instead of calling one of those two tools: that sentence IS the tool call, so make it.',
  },
  {
    slug: 'navigate-and-read',
    title: 'Go somewhere and read it',
    summary: 'Open a page and tell me what it says.',
    triggers: ['open', 'go to', 'visit', 'navigate', 'browse to', 'read the page', 'what does', 'summarize this page', 'summarise this page'],
    tools: ['goto', 'nav-history', 'read-tab', 'snapshot', 'extract', 'scroll', 'computer_read', 'done'],
    instructions:
      'Open the page, then read it. Answer from the text the snapshot returned, never from what you assume a page at that address says. Never tell the person to go and look at it themselves: you have already read it. If the page needs a sign-in to show its content, say so and offer to hand it over.',
  },
  {
    slug: 'remember-this',
    title: 'Remember something',
    summary: 'Save a fact or preference so future conversations know it.',
    triggers: ['remember', 'keep in mind', "don't forget", 'do not forget', 'save this fact', 'note that'],
    // Declares no tools on purpose: prose guidance only, so it never narrows the set.
    tools: [],
    instructions:
      'If the person asks you to remember something, call memory_save once with the fact as they gave it, trimmed to one clear sentence. Never save secrets, credentials or card numbers. Confirm what you saved in one short sentence, and say they can review it in Settings.',
  },
];

/** Slugs, in catalogue order. */
export const SKILL_SLUGS = SKILLS.map((s) => s.slug);

/** One skill by slug, or null. */
export function skillBySlug(slug) {
  const want = String(slug || '').trim().toLowerCase();
  return SKILLS.find((s) => s.slug === want) || null;
}

/**
 * Score one skill against a message.
 *
 * Deliberately dumb: whole-phrase substring matches, longest phrase first, so
 * "sign up" does not also count as "sign in" and "log in" is not outscored by "in".
 * A smarter router is a model call; this one has to be free and predictable, because
 * it runs on every keystroke-sized input.
 */
function scoreSkill(skill, text) {
  let score = 0;
  for (const trigger of skill.triggers) {
    if (text.includes(trigger)) score += trigger.length;
  }
  return score;
}

/**
 * The skills a message is about, best first, at most `limit`.
 *
 * Returns `[]` when nothing matches, which is a real answer: an unmatched message is
 * not forced into a skill, it just gets the whole tool set (see `narrowTools`).
 */
export function routeSkills(text, limit = 2) {
  const lower = String(text || '').toLowerCase();
  if (!lower.trim()) return [];
  return SKILLS.map((skill) => ({ skill, score: scoreSkill(skill, lower) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.skill);
}

/**
 * The tools to offer for one run.
 *
 * `matched` empty means "no skill matched": return every tool unchanged rather than
 * narrowing to the baseline, because a message this router did not understand is
 * exactly the one that may need an unusual tool. Narrowing is an optimisation for
 * recognised work, never a restriction on unrecognised work.
 */
export function narrowTools(matched, allTools, baseline = BASELINE_TOOLS) {
  const all = Array.isArray(allTools) ? allTools : [];
  const skills = Array.isArray(matched) ? matched.filter(Boolean) : [];
  if (!skills.length) return all.slice();
  // A skill that declares no tools of its own is prose guidance, not a tool gate.
  // Narrowing to the baseline on its behalf would starve a run it was meant to help.
  const declaresTools = skills.some((skill) => Array.isArray(skill.tools) && skill.tools.length > 0);
  if (!declaresTools) return all.slice();
  const allowed = new Set(baseline);
  for (const skill of skills) for (const tool of skill.tools || []) allowed.add(tool);
  // Preserve the caller's order so the prompt reads the same way every time.
  const narrowed = all.filter((tool) => allowed.has(tool));
  return narrowed.length ? narrowed : all.slice();
}

/** Route a goal and narrow in one step: what the operator loop actually calls. */
export function toolsForGoal(goal, allTools, limit = 2) {
  return narrowTools(routeSkills(goal, limit), allTools);
}

/**
 * The skill instructions to append to the run's prompt.
 *
 * OpenDuet addresses the model in the imperative and says why, not only what; the
 * instruction text above follows that, and this joins them so a two-skill run reads
 * as one brief rather than two competing ones.
 */
export function skillInstructions(matched) {
  const skills = Array.isArray(matched) ? matched.filter(Boolean) : [];
  if (!skills.length) return '';
  return skills.map((skill) => '[' + skill.title + '] ' + skill.instructions).join('\n\n');
}

/**
 * A `/`-style command at the start of a message: `/extract-data the prices`.
 *
 * Returns null when the message is not a command, so the caller falls through to
 * ordinary routing. An unknown slug is also null: a typo must not silently become a
 * skill named after the typo.
 */
export function parseSlashCommand(text) {
  const match = /^\s*\/([a-z0-9-]{1,40})\s*([\s\S]*)$/i.exec(String(text || ''));
  if (!match) return null;
  const skill = skillBySlug(match[1]);
  if (!skill) return null;
  return { skill, rest: match[2].trim() };
}

/**
 * Tap-answerable chips for a question the model just asked.
 *
 * OpenDuet's `suggest_replies` is a model tool; Orbit has no tool channel in chat
 * mode, so the chips are derived here from the shape of the question. The rule is
 * narrow on purpose: offer chips only for a closed choice, because chips under an
 * open question are noise that gets in the way of typing.
 *
 * The parsing is positional rather than a single clever regex: take the last
 * question, split it at its final "or", and read the option that ends the sentence
 * plus the one before it. A clause-shaped regex matched the whole preamble instead
 * ("Should I file it under w"), which is exactly the kind of chip that gets ignored.
 */
export function replyChips(question) {
  const text = String(question || '').trim();
  if (!text) return [];
  const end = text.lastIndexOf('?');
  if (end < 0) return [];
  // Only the last question, and not a whole paragraph of preamble with it.
  const q = text.slice(Math.max(0, end - 240), end);

  // The LAST "or" in the question is the one that joins the options; an earlier one
  // belongs to the preamble ("either way, or..."). Found by scanning forward, because
  // reversing the string to reuse lastIndexOf turns "or" into "ro" and matches nothing.
  let splitAt = -1;
  const orPattern = /\bor\b/gi;
  for (let match = orPattern.exec(q); match; match = orPattern.exec(q)) splitAt = match.index;
  if (splitAt >= 0) {
    const left = q.slice(0, splitAt);
    const right = q.slice(splitAt + 2);
    const rightOption = lastOption(right);
    const pieces = left.split(',').map((p) => p.trim()).filter(Boolean);
    const leftOption = pieces.length ? lastOption(pieces.pop()) : '';
    const options = [];
    if (pieces.length) options.push(lastOption(pieces.pop()));
    if (leftOption) options.push(leftOption);
    if (rightOption) options.push(rightOption);
    const clean = options.filter(usableOption).slice(0, 3).map(titleCaseChip);
    if (clean.length >= 2) return clean;
  }
  // Yes/no questions get the two answers and nothing else — but only a question that
  // really is closed. "What would you like me to do next?" contains "would you like"
  // and is not a yes/no question; offering Yes/No under it is worse than offering none.
  if (/^(what|where|when|who|whom|whose|why|how|which)\b/i.test(q.trim())) return [];
  if (/\b(want me to|shall i|should i|do you want|would you like|ready for me to|shall we)\b/i.test(q)) return ['Yes', 'No'];
  return [];
}

/** The trailing 1–2 words of a fragment, stripped of punctuation and filler. */
function lastOption(fragment) {
  return cleanOption(
    String(fragment || '')
      .replace(/[.,;:!?"'()[\]{}]+/g, ' ')
      .trim()
      .split(/\s+/)
      .slice(-2)
      .join(' '),
  );
}

/**
 * An option a person could plausibly tap.
 *
 * Strips the connective a sentence needs and a button does not: "under work" is a
 * fragment of "file it under work or personal", and the chip has to read "Work".
 * Trailing "one" goes the same way ("red one" → "Red").
 */
function cleanOption(value) {
  let v = String(value || '')
    .replace(/[.,;:!?"'()[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  v = v.replace(/^(the|a|an|under|in|to|for|with|about|on|at|into|from)\s+/i, '');
  v = v.replace(/\s+one$/i, '');
  return v.trim();
}

/** An option a person could plausibly tap: short, and not a bare filler word. */
function usableOption(option) {
  const value = String(option || '').trim();
  if (!value || value.length > 30) return false;
  if (value.split(/\s+/).length > 3) return false;
  return !/^(the|a|an|it|that|this|to|and|or|is|are|do|does|i|you|we)$/i.test(value);
}

/** "send the reply" reads better as a chip than as a sentence fragment. */
function titleCaseChip(value) {
  const clean = String(value || '').trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}
