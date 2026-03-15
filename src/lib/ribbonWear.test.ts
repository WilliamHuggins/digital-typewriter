import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRibbonInkStyle,
  createRibbonWearState,
  incrementRibbonWear,
} from './ribbonWear';

test('ribbon wear increments only on insertions', () => {
  const initial = createRibbonWearState('black');
  const grown = incrementRibbonWear(initial, 5, 'black');
  const unchanged = incrementRibbonWear(grown, -3, 'black');

  assert.equal(grown.impressionCount, 5);
  assert.equal(unchanged.impressionCount, 5);
});

test('changing ribbon resets to new active ribbon with fresh wear', () => {
  const wornBlack = incrementRibbonWear(createRibbonWearState('black'), 12, 'black');
  const switched = incrementRibbonWear(wornBlack, 2, 'red');

  assert.equal(switched.activeRibbon, 'red');
  assert.equal(switched.impressionCount, 2);
});

test('ink style is deterministic for same inputs', () => {
  const state = incrementRibbonWear(createRibbonWearState('blue'), 40, 'blue');
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

test('worn ribbon has lower opacity than fresh ribbon for same strike', () => {
  const fresh = createRibbonWearState('black');
  const worn = incrementRibbonWear(fresh, 600, 'black');

  const freshInk = calculateRibbonInkStyle({
    state: fresh,
    ribbon: 'black',
    char: 'a',
    charIndex: 30,
    lineIndex: 4,
  });

  const wornInk = calculateRibbonInkStyle({
    state: worn,
    ribbon: 'black',
    char: 'a',
    charIndex: 30,
    lineIndex: 4,
  });

  assert.ok(wornInk.opacity < freshInk.opacity);
});
