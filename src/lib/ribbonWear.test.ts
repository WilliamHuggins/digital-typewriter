import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLineImpressionLedger,
  calculateRibbonInkStyle,
  createRibbonWearState,
  incrementRibbonWear,
  stabilizeLineImpressions,
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

test('line identity remains stable across a small edit before a wrapped line', () => {
  const originalText = 'alpha beta\ngamma delta';
  const originalLedger = buildLineImpressionLedger({
    text: originalText,
    insertedRange: { start: 0, length: originalText.length },
    maxColumns: MAX_COLUMNS,
  });

  const baseline = incrementRibbonWear(createRibbonWearState('black'), originalText.length, 'black', originalLedger);
  const seeded = {
    ...baseline,
    lineImpressions: [42, 7, 15],
  };

  const editedText = 'alpha zbeta\ngamma delta';
  const editedLedger = buildLineImpressionLedger({
    text: editedText,
    insertedRange: { start: 6, length: 1 },
    maxColumns: MAX_COLUMNS,
  });

  const afterEdit = incrementRibbonWear(seeded, 1, 'black', editedLedger);
  assert.equal(afterEdit.lineImpressions[3], 15);
});

test('larger reflow falls back gracefully to near-index reassignment', () => {
  const previous = createRibbonWearState('black');
  const withContent = incrementRibbonWear(
    previous,
    31,
    'black',
    buildLineImpressionLedger({
      text: 'one\ntwo\nthree\nfour\nfive\nsix',
      insertedRange: { start: 0, length: 31 },
      maxColumns: MAX_COLUMNS,
    })
  );

  const seeded = {
    ...withContent,
    lineImpressions: [30, 25, 20, 15, 10, 5],
  };
  const reflowLedger = buildLineImpressionLedger({
    text: 'zzzz zzzz zzzz zzzz zzzz zzzz',
    insertedRange: { start: 0, length: 0 },
    maxColumns: MAX_COLUMNS,
  });

  const remapped = incrementRibbonWear(seeded, 0, 'black', reflowLedger);
  assert.deepEqual(remapped.lineImpressions, [30, 25, 20]);
});

test('stabilization is deterministic for repeated runs', () => {
  const previousLedger = buildLineImpressionLedger({
    text: 'first line\nsecond line\nthird line',
    insertedRange: { start: 0, length: 32 },
    maxColumns: MAX_COLUMNS,
  });
  const nextLedger = buildLineImpressionLedger({
    text: 'first line!\nsecond line\nthird line',
    insertedRange: { start: 10, length: 1 },
    maxColumns: MAX_COLUMNS,
  });

  const a = stabilizeLineImpressions({
    previousImpressions: [8, 13, 21],
    previousLineDescriptors: previousLedger.lineDescriptors,
    nextLineDescriptors: nextLedger.lineDescriptors,
  });
  const b = stabilizeLineImpressions({
    previousImpressions: [8, 13, 21],
    previousLineDescriptors: previousLedger.lineDescriptors,
    nextLineDescriptors: nextLedger.lineDescriptors,
  });

  assert.deepEqual(a, b);
});

test('stabilized mapping keeps downstream wear continuity better than naive index-only mapping', () => {
  const previousLineDescriptors = [
    { hash: 1, head: 'intro', tail: 'intro', length: 5 },
    { hash: 2, head: 'heavily worn', tail: 'worn line', length: 17 },
    { hash: 3, head: 'tail', tail: 'tail', length: 4 },
  ];
  const nextLineDescriptors = [
    { hash: 11, head: 'intro', tail: 'intro plus', length: 11 },
    { hash: 12, head: 'plus', tail: 'plus', length: 4 },
    { hash: 2, head: 'heavily worn', tail: 'worn line', length: 17 },
    { hash: 3, head: 'tail', tail: 'tail', length: 4 },
  ];

  const oldImpressions = [2, 90, 4];
  const naive = oldImpressions.slice(0, nextLineDescriptors.length);
  while (naive.length < nextLineDescriptors.length) {
    naive.push(0);
  }

  const stabilized = stabilizeLineImpressions({
    previousImpressions: oldImpressions,
    previousLineDescriptors,
    nextLineDescriptors,
  });

  assert.equal(naive[2], 4);
  assert.equal(stabilized[2], 90);
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
    lineDescriptors: [],
    chunkCache: { nextId: 1, chunks: [] },
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


test('chunk ids remain stable across small edits within the same newline chunk', () => {
  const originalText = 'alpha beta gamma';
  const originalLedger = buildLineImpressionLedger({
    text: originalText,
    insertedRange: { start: 0, length: originalText.length },
    maxColumns: MAX_COLUMNS,
  });
  const initial = incrementRibbonWear(createRibbonWearState('black'), originalText.length, 'black', originalLedger);

  const editedText = 'alpha beta gamma!';
  const editedLedger = buildLineImpressionLedger({
    text: editedText,
    insertedRange: { start: editedText.length - 1, length: 1 },
    maxColumns: MAX_COLUMNS,
  });
  const afterEdit = incrementRibbonWear(initial, 1, 'black', editedLedger);

  assert.equal(initial.chunkCache.chunks.length, 1);
  assert.equal(afterEdit.chunkCache.chunks.length, 1);
  assert.equal(afterEdit.chunkCache.chunks[0].id, initial.chunkCache.chunks[0].id);
});

test('chunk anchoring preserves wear better through larger paragraph reflows', () => {
  const initialText = 'alpha beta gamma delta epsilon zeta';
  const initialLedger = buildLineImpressionLedger({
    text: initialText,
    insertedRange: { start: 0, length: initialText.length },
    maxColumns: 14,
  });
  const baseline = incrementRibbonWear(createRibbonWearState('black'), initialText.length, 'black', initialLedger);
  const seeded = {
    ...baseline,
    lineImpressions: [90, 70, 30],
  };

  const reflowText = 'alpha beta gamma delta epsilon zeta eta theta iota';
  const reflowLedger = buildLineImpressionLedger({
    text: reflowText,
    insertedRange: { start: 0, length: 0 },
    maxColumns: 10,
  });

  const remapped = incrementRibbonWear(seeded, 0, 'black', reflowLedger);

  assert.equal(remapped.lineImpressions[0], 90);
  assert.equal(remapped.lineImpressions[1], 70);
  assert.equal(remapped.lineImpressions[2], 30);
});

test('chunk ids are reassigned sensibly when explicit newline split and merge occur', () => {
  const originalText = 'alpha beta gamma';
  const originalLedger = buildLineImpressionLedger({
    text: originalText,
    insertedRange: { start: 0, length: originalText.length },
    maxColumns: MAX_COLUMNS,
  });
  const initial = incrementRibbonWear(createRibbonWearState('black'), originalText.length, 'black', originalLedger);

  const splitText = 'alpha beta\ngamma';
  const splitLedger = buildLineImpressionLedger({
    text: splitText,
    insertedRange: { start: 10, length: 1 },
    maxColumns: MAX_COLUMNS,
  });
  const splitState = incrementRibbonWear(initial, 1, 'black', splitLedger);

  assert.equal(splitState.chunkCache.chunks.length, 2);
  assert.equal(splitState.chunkCache.chunks[0].id, initial.chunkCache.chunks[0].id);
  assert.notEqual(splitState.chunkCache.chunks[1].id, splitState.chunkCache.chunks[0].id);

  const mergedLedger = buildLineImpressionLedger({
    text: originalText,
    insertedRange: { start: 10, length: 0 },
    maxColumns: MAX_COLUMNS,
  });
  const mergedState = incrementRibbonWear(splitState, 0, 'black', mergedLedger);

  assert.equal(mergedState.chunkCache.chunks.length, 1);
  assert.equal(mergedState.chunkCache.chunks[0].id, initial.chunkCache.chunks[0].id);
});
