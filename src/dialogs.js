// Orbit dialogs — real in-panel confirmations.
//
// Chrome suppresses window.confirm()/alert()/prompt() in unfocused surfaces like the
// side panel: nothing appears and confirm() silently returns false. That is why the
// agent once "refused" every step it proposed — its approval gate was a confirm() the
// panel always answered "no". Every confirmation in Orbit therefore goes through this
// real <dialog>, which works in the side panel, the floatable window and full tabs.

/**
 * A blocking confirmation. Resolves true when the confirm button is pressed, false on
 * cancel, Escape or dismissal — the same contract window.confirm had, minus the part
 * where the side panel answers for the person.
 */
export function askConfirm({ title, body, detail, confirmLabel = 'Approve', cancelLabel = 'Cancel', danger = false }) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'confirm-dialog';
    dialog.setAttribute('aria-labelledby', 'confirmTitle');
    const head = document.createElement('h2');
    head.id = 'confirmTitle';
    head.textContent = String(title || 'Confirm');
    const note = document.createElement('p');
    note.className = 'confirm-note';
    note.textContent = String(body || '').slice(0, 2000);
    dialog.append(head, note);
    if (detail) {
      const pre = document.createElement('pre');
      pre.className = 'confirm-detail';
      pre.textContent = String(detail).slice(0, 4000);
      dialog.append(pre);
    }
    const row = document.createElement('div');
    row.className = 'row';
    const cancel = document.createElement('button');
    cancel.textContent = cancelLabel;
    const ok = document.createElement('button');
    ok.textContent = confirmLabel;
    ok.className = danger ? 'danger' : 'primary';
    row.append(cancel, ok);
    dialog.append(row);
    const finish = value => { dialog.close(); dialog.remove(); resolve(value); };
    ok.onclick = () => finish(true);
    cancel.onclick = () => finish(false);
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
    dialog.addEventListener('close', () => { if (dialog.isConnected) finish(false); });
    document.body.append(dialog);
    dialog.showModal();
    ok.focus();
  });
}
