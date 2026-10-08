// Triage state machine checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionTarget, transitionAllowed, baselineEffect } from '../lib/triage.js';

test('known actions map to their target status', () => {
  assert.equal(actionTarget('approve'), 'approved');
  assert.equal(actionTarget('false_positive'), 'false_positive');
  assert.equal(actionTarget('reopen'), 'open');
});

test('unknown actions map to null', () => {
  assert.equal(actionTarget('banish'), null);
  assert.equal(actionTarget(''), null);
});

test('an open violation can be approved or dismissed', () => {
  assert.ok(transitionAllowed('open', 'approved'));
  assert.ok(transitionAllowed('open', 'false_positive'));
  assert.ok(!transitionAllowed('open', 'open'));
});

test('decisions can only be undone back to open', () => {
  assert.ok(transitionAllowed('approved', 'open'));
  assert.ok(transitionAllowed('false_positive', 'open'));
  assert.ok(!transitionAllowed('approved', 'approved'));
  assert.ok(!transitionAllowed('approved', 'false_positive'));
  assert.ok(!transitionAllowed('false_positive', 'approved'));
});

test('unknown statuses transition nowhere', () => {
  assert.ok(!transitionAllowed('unknown', 'open'));
  assert.ok(!transitionAllowed('open', 'unknown'));
});

test('approve promotes the baseline, undo restores it', () => {
  assert.equal(baselineEffect('open', 'approved'), 'promote_latest');
  assert.equal(baselineEffect('approved', 'open'), 'restore');
});

test('dismissals and plain reopens leave the baseline alone', () => {
  assert.equal(baselineEffect('open', 'false_positive'), null);
  assert.equal(baselineEffect('false_positive', 'open'), null);
});
