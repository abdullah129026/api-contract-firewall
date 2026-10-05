// LEARNING -> ENFORCING state machine tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEARNING_SAMPLE_TARGET,
  nextState,
  justBecameEnforcing,
  learningProgress,
} from '../lib/learning.js';

const learning = (count, confirmed = false) => ({
  state: 'LEARNING',
  sample_count: count,
  human_confirmed: confirmed,
});

test('stays LEARNING below 100 samples', () => {
  assert.equal(nextState(learning(37)), 'LEARNING');
  assert.equal(nextState(learning(99)), 'LEARNING');
});

test('transitions to ENFORCING at exactly 100 samples', () => {
  assert.equal(nextState(learning(100)), 'ENFORCING');
  assert.equal(nextState(learning(250)), 'ENFORCING');
});

test('human confirm moves to ENFORCING early', () => {
  assert.equal(nextState(learning(12, true)), 'ENFORCING');
});

test('ENFORCING is sticky', () => {
  assert.equal(nextState({ state: 'ENFORCING', sample_count: 1000, human_confirmed: false }), 'ENFORCING');
});

test('justBecameEnforcing fires only on the transition', () => {
  assert.equal(justBecameEnforcing({ state: 'LEARNING' }, 'ENFORCING'), true);
  assert.equal(justBecameEnforcing({ state: 'ENFORCING' }, 'ENFORCING'), false);
  assert.equal(justBecameEnforcing({ state: 'LEARNING' }, 'LEARNING'), false);
});

test('learningProgress reports seen/target, null once enforcing', () => {
  assert.deepEqual(learningProgress(learning(37)), { seen: 37, target: LEARNING_SAMPLE_TARGET });
  assert.equal(learningProgress({ state: 'ENFORCING', sample_count: 150 }), null);
});
