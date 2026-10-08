// Triage state machine for violations. Pure functions, no db access,
// so the transitions stay easy to test.

// action -> target status
const ACTIONS = {
  approve: 'approved', // accept the change, it becomes the contract
  false_positive: 'false_positive', // detector was wrong, dismiss
  reopen: 'open', // undo a previous decision
};

// The UI only offers these moves. An approval always goes through
// 'open' again first (undo), never straight to another decision.
const ALLOWED = {
  open: new Set(['approved', 'false_positive']),
  approved: new Set(['open']),
  false_positive: new Set(['open']),
};

export function actionTarget(name) {
  return Object.prototype.hasOwnProperty.call(ACTIONS, name) ? ACTIONS[name] : null;
}

export function transitionAllowed(from, to) {
  return !!ALLOWED[from] && ALLOWED[from].has(to);
}

// Baseline operation that accompanies the transition. Approving promotes
// the latest observed shape to the enforced baseline; undoing an approval
// restores the baseline that was in place before. Dismissing a false
// positive touches nothing.
export function baselineEffect(from, to) {
  if (from === 'open' && to === 'approved') return 'promote_latest';
  if (from === 'approved' && to === 'open') return 'restore';
  return null;
}
