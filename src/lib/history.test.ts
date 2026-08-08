import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COALESCE_WINDOW_MS,
  MAX_HISTORY,
  MAX_RUN_LENGTH,
  canRedo,
  canUndo,
  classifyKey,
  createHistory,
  record,
  redo,
  undo,
  type DocSnapshot,
} from './history';

function snap(text: string, cursorPos = text.length): DocSnapshot {
  return {
    text,
    charFormats: Array.from({ length: text.length }, () => ({ model: 'royal' as const, ribbon: 'black' as const })),
    charEmphasis: Array.from({ length: text.length }, () => ({ strikeCount: 1, underline: false })),
    cursorPos,
  };
}

describe('history', () => {
  it('starts with nothing to undo or redo', () => {
    const h = createHistory();
    assert.equal(canUndo(h), false);
    assert.equal(canRedo(h), false);
    assert.equal(h.present.text, '');
  });

  it('records an edit and can undo back to the prior text', () => {
    let h = createHistory(snap(''));
    h = record(h, snap('a'), 'type', 1000);

    assert.equal(canUndo(h), true);
    h = undo(h);
    assert.equal(h.present.text, '');
    assert.equal(canRedo(h), true);
  });

  it('redo replays the undone edit', () => {
    let h = createHistory(snap(''));
    h = record(h, snap('hello'), 'paste', 1000);
    h = undo(h);
    h = redo(h);
    assert.equal(h.present.text, 'hello');
    assert.equal(canRedo(h), false);
  });

  it('coalesces consecutive typing into one undo step', () => {
    let h = createHistory(snap(''));
    h = record(h, snap('t'), 'type', 1000);
    h = record(h, snap('th'), 'type', 1050);
    h = record(h, snap('the'), 'type', 1100);

    assert.equal(h.past.length, 1, 'a typing run is a single step');
    h = undo(h);
    assert.equal(h.present.text, '', 'undo removes the whole run');
  });

  it('breaks the run after a typing pause', () => {
    let h = createHistory(snap(''));
    h = record(h, snap('a'), 'type', 1000);
    h = record(h, snap('ab'), 'type', 1000 + COALESCE_WINDOW_MS + 1);

    assert.equal(h.past.length, 2);
    h = undo(h);
    assert.equal(h.present.text, 'a');
  });

  it('breaks the run at a carriage return', () => {
    let h = createHistory(snap(''));
    h = record(h, snap('one'), 'type', 1000);
    h = record(h, snap('one\n'), 'return', 1010);
    h = record(h, snap('one\ntwo'), 'type', 1020);

    h = undo(h);
    assert.equal(h.present.text, 'one\n');
    h = undo(h);
    assert.equal(h.present.text, 'one');
  });

  it('breaks the run once it grows past MAX_RUN_LENGTH', () => {
    let h = createHistory(snap(''));
    let text = '';
    for (let i = 0; i < MAX_RUN_LENGTH + 5; i++) {
      text += 'x';
      h = record(h, snap(text), 'type', 1000 + i);
    }
    assert.ok(h.past.length >= 2, 'a very long run is split into multiple steps');
  });

  it('treats a delete as its own step', () => {
    let h = createHistory(snap(''));
    h = record(h, snap('ab'), 'type', 1000);
    h = record(h, snap('a'), 'delete', 1010);

    assert.equal(h.past.length, 2);
    h = undo(h);
    assert.equal(h.present.text, 'ab');
  });

  it('drops the redo stack once a new edit arrives', () => {
    let h = createHistory(snap(''));
    h = record(h, snap('a'), 'type', 1000);
    h = undo(h);
    assert.equal(canRedo(h), true);

    h = record(h, snap('b'), 'type', 2000);
    assert.equal(canRedo(h), false);
  });

  it('does not create a step for a cursor move alone', () => {
    let h = createHistory(snap('abc', 0));
    h = record(h, snap('abc', 2), 'type', 1000);

    assert.equal(h.past.length, 0);
    assert.equal(h.present.cursorPos, 2);
  });

  it('caps the depth at MAX_HISTORY', () => {
    let h = createHistory(snap(''));
    for (let i = 0; i < MAX_HISTORY + 40; i++) {
      // Alternate kinds so nothing coalesces.
      h = record(h, snap('x'.repeat(i + 1)), i % 2 ? 'delete' : 'return', 1000 + i * 10_000);
    }
    assert.equal(h.past.length, MAX_HISTORY);
  });

  it('undo and redo are no-ops at the ends of the stack', () => {
    const h = createHistory(snap('only'));
    assert.equal(undo(h), h);
    assert.equal(redo(h), h);
  });

  it('classifies keys into edit kinds', () => {
    assert.equal(classifyKey('Enter'), 'return');
    assert.equal(classifyKey('Backspace'), 'delete');
    assert.equal(classifyKey('Delete'), 'delete');
    assert.equal(classifyKey('a'), 'type');
  });
});
