// LEARNING -> ENFORCING state machine (plan §2.2).
//
// An endpoint learns from the first 100 samples, then the inferred schema
// is promoted to the enforced baseline. A human can confirm the contract
// early from the dashboard; once ENFORCING, the state never moves back on
// its own. No breaking violations are emitted while LEARNING.

'use strict';

export const LEARNING_SAMPLE_TARGET = 100;

// Pure transition: given the endpoint row, decide the state after this
// sample. Called on every ingest; the caller persists the change.
export function nextState(endpoint) {
  if (endpoint.state === 'ENFORCING') return 'ENFORCING';
  if (endpoint.human_confirmed) return 'ENFORCING';
  if (endpoint.sample_count >= LEARNING_SAMPLE_TARGET) return 'ENFORCING';
  return 'LEARNING';
}

// True when this sample completes learning (the caller then infers the
// baseline schema and stores it as schema version 1).
export function justBecameEnforcing(before, after) {
  return before.state === 'LEARNING' && after === 'ENFORCING';
}

// Dashboard copy for the learning progress indicator.
export function learningProgress(endpoint) {
  if (endpoint.state === 'ENFORCING') return null;
  return {
    seen: Math.min(endpoint.sample_count, LEARNING_SAMPLE_TARGET),
    target: LEARNING_SAMPLE_TARGET,
  };
}
