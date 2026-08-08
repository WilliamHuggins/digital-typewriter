/**
 * Undo/redo for the typewriter document.
 *
 * The app cannot use the browser's native undo stack: printable keys are
 * `preventDefault`ed in `handleKeyDown` and applied through manual state
 * writes, so the hidden textarea never records an edit the browser could
 * reverse. This module keeps an explicit snapshot stack instead.
 *
 * Snapshots are whole-document rather than diff-based. Documents here are
 * bounded by what someone types in one sitting, and the per-character format
 * and emphasis arrays have to move in lockstep with the text — a diff model
 * would have to reconcile three parallel arrays for no practical gain.
 *
 * Consecutive typing coalesces into a single undo step so that Ctrl+Z removes
 * a phrase rather than one letter. A coalescing run is broken by a pause, by a
 * structural edit (return, delete, paste), or by the step growing too long.
 */

import type { CharEmphasis, CharFormat } from './machines';

export interface DocSnapshot {
  text: string;
  charFormats: CharFormat[];
  charEmphasis: CharEmphasis[];
  cursorPos: number;
}

/**
 * What produced an edit. Only `type` coalesces; everything else starts a new
 * undo step so that a carriage return or a deletion is always its own step.
 */
export type EditKind = 'type' | 'delete' | 'return' | 'paste' | 'replace';

export interface HistoryState {
  past: DocSnapshot[];
  present: DocSnapshot;
  future: DocSnapshot[];
  /** Timestamp of the last recorded edit, used for coalescing */
  lastEditAt: number;
  lastKind: EditKind | null;
  /** Characters accumulated into the current coalescing run */
  runLength: number;
}

/** Typing pauses longer than this start a new undo step. */
export const COALESCE_WINDOW_MS = 700;
/** A single coalesced step never swallows more than this many characters. */
export const MAX_RUN_LENGTH = 40;
/** Upper bound on undo depth; oldest steps are dropped past this. */
export const MAX_HISTORY = 200;

export const EMPTY_SNAPSHOT: DocSnapshot = {
  text: '',
  charFormats: [],
  charEmphasis: [],
  cursorPos: 0,
};

export function createHistory(initial: DocSnapshot = EMPTY_SNAPSHOT): HistoryState {
  return {
    past: [],
    present: initial,
    future: [],
    lastEditAt: 0,
    lastKind: null,
    runLength: 0,
  };
}

function sameDocument(a: DocSnapshot, b: DocSnapshot): boolean {
  return a.text === b.text
    && a.charFormats.length === b.charFormats.length
    && a.charEmphasis.length === b.charEmphasis.length;
}

/**
 * Should this edit extend the current undo step rather than start a new one?
 */
export function shouldCoalesce(state: HistoryState, kind: EditKind, now: number): boolean {
  if (kind !== 'type' || state.lastKind !== 'type') return false;
  if (state.past.length === 0) return false;
  if (now - state.lastEditAt > COALESCE_WINDOW_MS) return false;
  return state.runLength < MAX_RUN_LENGTH;
}

/**
 * Record a new document state.
 *
 * Redo is dropped on any fresh edit — the standard behaviour, and the only one
 * that keeps the stack a stack rather than a tree.
 */
export function record(
  state: HistoryState,
  next: DocSnapshot,
  kind: EditKind,
  now: number = Date.now(),
): HistoryState {
  // A cursor move alone is not an edit; keep it on `present` without a step.
  if (sameDocument(state.present, next)) {
    return { ...state, present: next, future: state.future };
  }

  if (shouldCoalesce(state, kind, now)) {
    return {
      ...state,
      present: next,
      future: [],
      lastEditAt: now,
      lastKind: kind,
      runLength: state.runLength + 1,
    };
  }

  const past = [...state.past, state.present];
  return {
    past: past.length > MAX_HISTORY ? past.slice(past.length - MAX_HISTORY) : past,
    present: next,
    future: [],
    lastEditAt: now,
    lastKind: kind,
    runLength: kind === 'type' ? 1 : 0,
  };
}

export function canUndo(state: HistoryState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: HistoryState): boolean {
  return state.future.length > 0;
}

export function undo(state: HistoryState): HistoryState {
  if (!canUndo(state)) return state;

  const previous = state.past[state.past.length - 1];
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future],
    lastEditAt: 0,
    lastKind: null,
    runLength: 0,
  };
}

export function redo(state: HistoryState): HistoryState {
  if (!canRedo(state)) return state;

  const [next, ...rest] = state.future;
  return {
    past: [...state.past, state.present],
    present: next,
    future: rest,
    lastEditAt: 0,
    lastKind: null,
    runLength: 0,
  };
}

/**
 * Replace the document wholesale without leaving an undo step — used when
 * restoring a saved sheet at startup, where there is no prior state to return
 * to.
 */
export function reset(snapshot: DocSnapshot): HistoryState {
  return createHistory(snapshot);
}

/** Classify a keyboard interaction so `record` knows whether to coalesce. */
export function classifyKey(key: string): EditKind {
  if (key === 'Enter') return 'return';
  if (key === 'Backspace' || key === 'Delete') return 'delete';
  return 'type';
}
