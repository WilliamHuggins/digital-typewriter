import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canApplyTextWithinMaxColumns,
  evaluateBellState,
  getLineInfoAtPosition,
  moveCursorDown,
  moveCursorLeft,
  moveCursorRight,
  moveCursorUp,
  shouldRearmBellAfterCursorOrEdit
} from './carriageModel';

test('basic cursor movement left/right clamps correctly', () => {
  const text = 'abc';
  assert.equal(moveCursorLeft(text, 0), 0);
  assert.equal(moveCursorRight(text, 0), 1);
  assert.equal(moveCursorRight(text, 3), 3);
});

test('cursor movement up/down preserves preferred column as much as possible', () => {
  const text = 'abcd\nxy\n12345';
  const line3Column4 = 8 + 4; // start of third line + column 4

  assert.equal(moveCursorUp(text, line3Column4), 7); // second line has length 2, so clamps at end
  assert.equal(moveCursorDown(text, 2), 7); // from first line col 2 to second line end
});

test('line info reflects line index, length, and column after enter/new line', () => {
  const text = 'hello\nworld';
  const info = getLineInfoAtPosition(text, 7);

  assert.equal(info.lineIndex, 1);
  assert.equal(info.currentColumn, 1);
  assert.equal(info.lineLength, 5);
});

test('line max-column guard rejects overlong lines', () => {
  assert.equal(canApplyTextWithinMaxColumns('abc\ndef', 3), true);
  assert.equal(canApplyTextWithinMaxColumns('abcd\nef', 3), false);
});

test('bell zone entry rings once and disarms until reset', () => {
  const bellColumns = { ringAtColumn: 5, resetAtColumn: 2 };
  const text = '123456';

  const first = evaluateBellState(text, 5, true, bellColumns);
  assert.equal(first.shouldRing, true);
  assert.equal(first.bellArmed, false);

  const second = evaluateBellState(text, 6, first.bellArmed, bellColumns);
  assert.equal(second.shouldRing, false);
  assert.equal(second.bellArmed, false);
});

test('moving/editing left out of bell zone rearms bell', () => {
  const bellColumns = { ringAtColumn: 5, resetAtColumn: 2 };
  const text = '123456';
  const movedToShorterLine = '12\n123456';

  const stillInZone = shouldRearmBellAfterCursorOrEdit(text, 4, bellColumns);
  const movedLeft = shouldRearmBellAfterCursorOrEdit(movedToShorterLine, 2, bellColumns);

  assert.equal(stillInZone, false);
  assert.equal(movedLeft, true);
});

test('bell re-arms on short line after delete/backspace-like edit', () => {
  const bellColumns = { ringAtColumn: 5, resetAtColumn: 2 };
  const shortenedText = '12';

  const canRearm = shouldRearmBellAfterCursorOrEdit(shortenedText, 2, bellColumns);
  assert.equal(canRearm, true);
});
