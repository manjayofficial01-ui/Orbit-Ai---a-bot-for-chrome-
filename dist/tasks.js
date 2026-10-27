// Orbit tasks — OpenDuet's task layer, ported to a client-only extension.
//
// OpenDuet's thesis: "Start on a suggestion, and it becomes a task — a conversation of
// its own with the Bot. Chat stays one thread with a card for each piece of work." The
// person's Chat shows only "On it." and a card; the work runs in the task's own
// conversation, opened with a frame (shared/task-brief.ts) that says what this is, so
// the model inside the task never hands the work on again.
//
// Two contract details carried over intact:
// - The status is COMPUTED, never stored (task-store.ts): the record keeps the facts
//   (running, waiting on the person, resolvedAt, failure) and the word is derived on
//   every read, first match wins — "Waiting on the person still comes first."
// - The card in Chat is a line, not a tile: a live glyph and the title, opening the task.

export const TASK_LIMITS = { titleChars: 80, askChars: 4000, count: 20 };

/**
 * The task frame (shared/task-brief.ts TASK_FRAME, adapted). The ask travels under this
 * frame so the run inside the task's own conversation does the work there instead of
 * proposing to start another task.
 */
export const TASK_FRAME = [
  'This conversation is a task the person handed you. It runs apart from their main chat, and they read it when they open the task.',
  'Do the work here yourself, all of it, and end with what you did and anything still waiting on them.',
].join('\n');

export function taskBrief(ask) {
  return TASK_FRAME + '\n\nThe person\u2019s task:\n\n' + String(ask || '');
}

/**
 * A title for a card, from the ask itself (task-store.ts `titleFrom`): the first
 * non-empty line, cut at the first sentence end, then at a word boundary before the
 * 80-character cap, with an ellipsis when it was cut.
 */
export function titleFrom(ask) {
  const first = String(ask || '').split('\n').map((l) => l.trim()).find(Boolean) || 'New task';
  let t;
  const sentence = /(?<=[^.!?][.!?])\s+(?=\p{Lu})/u.exec(first);
  t = sentence ? first.slice(0, sentence.index) : first;
  t = t.replace(/[.!?]+\s*$/u, '') || first;
  if (t.length <= TASK_LIMITS.titleChars) return t;
  const cut = t.slice(0, TASK_LIMITS.titleChars);
  const space = cut.lastIndexOf(' ');
  return (space > 40 ? cut.slice(0, space) : cut).trimEnd() + '\u2026';
}

/**
 * The status word, computed on every read. The stored fields are the facts; this is the
 * word. `needs_input` outranks everything because a question nobody can see is a
 * conversation that has stopped without saying so.
 */
export function taskStatus(task) {
  if (!task || typeof task !== 'object') return 'failed';
  if (task.needsInput) return 'needs_input';
  if (task.running) return 'working';
  if (task.resolvedAt) return 'resolved';
  if (task.failure) return 'failed';
  return 'ready_for_review';
}

export const TASK_STATUS_LABEL = {
  working: 'Working',
  needs_input: 'Needs input',
  ready_for_review: 'Ready for review',
  resolved: 'Resolved',
  failed: 'Failed',
};

/** The Tasks list order (queries.ts): what needs the person first, the archive last. */
export const TASK_GROUP_ORDER = ['ready_for_review', 'needs_input', 'failed', 'working', 'resolved'];

/** Group tasks in the fixed presentation order, dropping empty groups. */
export function groupTasks(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  return TASK_GROUP_ORDER.map((status) => ({ status, tasks: list.filter((t) => taskStatus(t) === status) })).filter(
    (g) => g.tasks.length,
  );
}
