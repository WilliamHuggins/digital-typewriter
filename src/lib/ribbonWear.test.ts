import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLineImpressionLedger,
  calculateRibbonInkStyle,
  createRibbonWearState,
  incrementRibbonWear,
} from './ribbonWear';

const MAX_COLUMNS = 10;

test('ribbon wear increments only on insertions', () => {
  const initial = createRibbonWearState('black');
  const lineLedger = buildLineImpressionLedger({
    text: 'hello',
    insertedRange: { start: 0, length: 5 },
    maxColumns: MAX_COLUMNS,
  });
  const grown = incrementRibbonWear(initial, 5, 'black', lineLedger);
  const unchanged = incrementRibbonWear(grown, -3, 'black', lineLedger);

  assert.equal(grown.impressionCount, 5);
  assert.equal(unchanged.impressionCount, 5);
});

test('per-line ledger accumulates impressions by rendered line', () => {
  const state = createRibbonWearState('black');
  const firstInsert = buildLineImpressionLedger({
    text: 'line1\nline2',
    insertedRange: { start: 0, length: 11 },
    maxColumns: MAX_COLUMNS,
  });
  const afterFirst = incrementRibbonWear(state, 11, 'black', firstInsert);

  assert.deepEqual(afterFirst.lineImpressions, [5, 5]);

  const secondInsert = buildLineImpressionLedger({
    text: 'line1\nline2x',
    insertedRange: { start: 10, length: 1 },
    maxColumns: MAX_COLUMNS,
  });
  const afterSecond = incrementRibbonWear(afterFirst, 1, 'black', secondInsert);

  assert.deepEqual(afterSecond.lineImpressions, [5, 6]);
});

test('line ledger adapts sensibly to deletions by clamping removed lines', () => {
  const initialLedger = buildLineImpressionLedger({
    text: 'a\nb\nc',
    insertedRange: { start: 0, length: 5 },
    maxColumns: MAX_COLUMNS,
  });

  const worn = incrementRibbonWear(createRibbonWearState('black'), 5, 'black', initialLedger);
  assert.deepEqual(worn.lineImpressions, [1, 1, 1]);

  const afterDeletionLedger = buildLineImpressionLedger({
    text: 'a\nb',
    insertedRange: { start: 1, length: 0 },
    maxColumns: MAX_COLUMNS,
  });
  const afterDeletion = incrementRibbonWear(worn, 0, 'black', afterDeletionLedger);

  assert.deepEqual(afterDeletion.lineImpressions, [1, 1]);
});

test('changing ribbon resets to new active ribbon with fresh wear', () => {
  const blackLedger = buildLineImpressionLedger({
    text: 'hello',
    insertedRange: { start: 0, length: 5 },
    maxColumns: MAX_COLUMNS,
  });
  const wornBlack = incrementRibbonWear(createRibbonWearState('black'), 5, 'black', blackLedger);

  const redLedger = buildLineImpressionLedger({
    text: 'hi',
    insertedRange: { start: 0, length: 2 },
    maxColumns: MAX_COLUMNS,
  });
  const switched = incrementRibbonWear(wornBlack, 2, 'red', redLedger);

  assert.equal(switched.activeRibbon, 'red');
  assert.equal(switched.impressionCount, 2);
  assert.deepEqual(switched.lineImpressions, [2]);
});

test('full clear resets wear state', () => {
  const state = incrementRibbonWear(
    createRibbonWearState('blue'),
    8,
    'blue',
    buildLineImpressionLedger({
      text: 'hi\nthere',
      insertedRange: { start: 0, length: 8 },
      maxColumns: MAX_COLUMNS,
    })
  );

  const cleared = createRibbonWearState('blue');
  assert.equal(cleared.impressionCount, 0);
  assert.deepEqual(cleared.lineImpressions, []);
  assert.notDeepEqual(state, cleared);
});

test('ink style is deterministic for same inputs', () => {
  const state = incrementRibbonWear(
    createRibbonWearState('blue'),
    40,
    'blue',
    buildLineImpressionLedger({
      text: 'first\nsecond',
      insertedRange: { start: 0, length: 12 },
      maxColumns: MAX_COLUMNS,
    })
  );
  const a = calculateRibbonInkStyle({
    state,
    ribbon: 'blue',
    char: 'e',
    charIndex: 18,
    lineIndex: 2,
  });
  const b = calculateRibbonInkStyle({
    state,
    ribbon: 'blue',
    char: 'e',
    charIndex: 18,
    lineIndex: 2,
  });

  assert.deepEqual(a, b);
});

test('heavier-used line renders more worn than lighter-used line', () => {
  const state = {
    activeRibbon: 'black' as const,
    impressionCount: 0,
    lineImpressions: [220, 0],
  };

  const heavyInk = calculateRibbonInkStyle({
    state,
    ribbon: 'black',
    char: 'a',
    charIndex: 1,
    lineIndex: 0,
  });

  const lightInk = calculateRibbonInkStyle({
    state,
    ribbon: 'black',
    char: 'a',
    charIndex: 1,
    lineIndex: 1,
  });

  assert.ok(heavyInk.opacity < lightInk.opacity);
});
