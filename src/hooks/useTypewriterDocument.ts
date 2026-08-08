/**
 * Owns the document: its text, its per-character ink, its undo history and its
 * autosave.
 *
 * This state used to live inside the renderer, which meant the toolbar had no
 * way to reach it — hence no undo button, no export, and no "new sheet". It is
 * lifted here so that every command that acts on the document has one place to
 * act on, and so the history and persistence rules live next to the state they
 * govern rather than being sprinkled through an 900-line component.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  canRedo as historyCanRedo,
  canUndo as historyCanUndo,
  createHistory,
  record,
  redo as historyRedo,
  reset as historyReset,
  undo as historyUndo,
  type DocSnapshot,
  type EditKind,
  type HistoryState,
} from '../lib/history';
import {
  DEFAULT_TITLE,
  clearSheet,
  loadSheet,
  saveSheet,
  type PersistedSheet,
} from '../lib/persistence';
import type { CharEmphasis, CharFormat, ModelKey, RibbonKey } from '../lib/machines';

/** How long to wait after the last keystroke before writing to storage. */
const AUTOSAVE_DEBOUNCE_MS = 800;
/** How long the "Saved" confirmation stays up before fading back to idle. */
const SAVED_INDICATOR_MS = 1600;

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Document-level settings that travel with the sheet when it is saved. */
export interface SheetSettings {
  model: ModelKey;
  ribbon: RibbonKey;
  lineSpacing: number;
  paperSize: string;
  marginPreset: string;
  customMargins: { marginTop: number; marginBottom: number; marginLeft: number; marginRight: number };
}

export interface TypewriterDocument {
  text: string;
  charFormats: CharFormat[];
  charEmphasis: CharEmphasis[];
  cursorPos: number;
  title: string;
  setTitle: (title: string) => void;

  /** Apply an edit and record it as an undo step. */
  commit: (next: DocSnapshot, kind: EditKind) => void;
  /** Move the caret without creating an undo step. */
  moveCursor: (pos: number) => void;

  undo: () => DocSnapshot | null;
  redo: () => DocSnapshot | null;
  canUndo: boolean;
  canRedo: boolean;

  /** Clear the sheet and the saved copy. */
  newSheet: () => void;

  saveState: SaveState;
  saveError: string | null;
  /** True on the first render after a saved sheet was restored from storage. */
  restoredFromStorage: boolean;
}

export interface UseTypewriterDocumentOptions {
  settings: SheetSettings;
  /** Called once at startup if a saved sheet carried different settings. */
  onRestoreSettings?: (sheet: PersistedSheet) => void;
}

export function useTypewriterDocument({
  settings,
  onRestoreSettings,
}: UseTypewriterDocumentOptions): TypewriterDocument {
  // Restore synchronously during the first render so the writer never sees a
  // blank sheet flash before their work reappears.
  const restored = useRef<PersistedSheet | null | undefined>(undefined);
  if (restored.current === undefined) {
    restored.current = loadSheet();
  }

  const [history, setHistory] = useState<HistoryState>(() =>
    createHistory(
      restored.current
        ? {
            text: restored.current.text,
            charFormats: restored.current.charFormats,
            charEmphasis: restored.current.charEmphasis,
            cursorPos: restored.current.text.length,
          }
        : undefined,
    ),
  );
  const [title, setTitle] = useState(() => restored.current?.title ?? DEFAULT_TITLE);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  const restoredFromStorage = restored.current !== null;

  // Hand the restored machine/paper settings back to the caller once. This
  // runs in an effect rather than during render because it sets state owned by
  // the parent component.
  const settingsRestoredRef = useRef(false);
  useEffect(() => {
    if (settingsRestoredRef.current) return;
    settingsRestoredRef.current = true;
    if (restored.current) {
      onRestoreSettings?.(restored.current);
    }
  }, [onRestoreSettings]);

  const present = history.present;

  const commit = useCallback((next: DocSnapshot, kind: EditKind) => {
    setHistory((prev) => record(prev, next, kind));
  }, []);

  const moveCursor = useCallback((pos: number) => {
    setHistory((prev) =>
      prev.present.cursorPos === pos
        ? prev
        : { ...prev, present: { ...prev.present, cursorPos: pos } },
    );
  }, []);

  // Undo and redo return the snapshot they landed on so the caller can restore
  // the textarea's selection to match; React state is not readable soon enough
  // after the setter to do that from the caller side.
  const undo = useCallback((): DocSnapshot | null => {
    let landed: DocSnapshot | null = null;
    setHistory((prev) => {
      const next = historyUndo(prev);
      landed = next === prev ? null : next.present;
      return next;
    });
    return landed;
  }, []);

  const redo = useCallback((): DocSnapshot | null => {
    let landed: DocSnapshot | null = null;
    setHistory((prev) => {
      const next = historyRedo(prev);
      landed = next === prev ? null : next.present;
      return next;
    });
    return landed;
  }, []);

  const newSheet = useCallback(() => {
    setHistory(historyReset({ text: '', charFormats: [], charEmphasis: [], cursorPos: 0 }));
    setTitle(DEFAULT_TITLE);
    clearSheet();
    setSaveState('idle');
    setSaveError(null);
  }, []);

  // ---------------------------------------------------------------------
  // Autosave
  // ---------------------------------------------------------------------

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const titleRef = useRef(title);
  titleRef.current = title;

  const isFirstSaveCycle = useRef(true);
  const savedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // Don't write on mount — that would rewrite the sheet we just restored and
    // stamp a save time for an edit that never happened.
    if (isFirstSaveCycle.current) {
      isFirstSaveCycle.current = false;
      return;
    }

    setSaveState('saving');
    const handle = window.setTimeout(() => {
      const result = saveSheet({
        title: titleRef.current,
        text: present.text,
        charFormats: present.charFormats,
        charEmphasis: present.charEmphasis,
        ...settingsRef.current,
      });

      if (result.ok) {
        setSaveState('saved');
        setSaveError(null);
        if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
        savedTimerRef.current = window.setTimeout(() => setSaveState('idle'), SAVED_INDICATOR_MS);
      } else {
        setSaveState('error');
        setSaveError(
          result.reason === 'quota'
            ? 'This sheet is too large to autosave. Export it to keep a copy.'
            : 'Autosave is unavailable in this browser. Export to keep a copy.',
        );
      }
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [present.text, present.charFormats, present.charEmphasis, title, settings]);

  useEffect(
    () => () => {
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    },
    [],
  );

  // A debounced save loses the last keystrokes if the tab closes mid-window.
  // Flush synchronously when the page is hidden, which is the one lifecycle
  // event mobile browsers reliably fire before tearing a tab down.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState !== 'hidden') return;
      saveSheet({
        title: titleRef.current,
        text: present.text,
        charFormats: present.charFormats,
        charEmphasis: present.charEmphasis,
        ...settingsRef.current,
      });
    };

    document.addEventListener('visibilitychange', flush);
    return () => document.removeEventListener('visibilitychange', flush);
  }, [present.text, present.charFormats, present.charEmphasis]);

  return useMemo(
    () => ({
      text: present.text,
      charFormats: present.charFormats,
      charEmphasis: present.charEmphasis,
      cursorPos: present.cursorPos,
      title,
      setTitle,
      commit,
      moveCursor,
      undo,
      redo,
      canUndo: historyCanUndo(history),
      canRedo: historyCanRedo(history),
      newSheet,
      saveState,
      saveError,
      restoredFromStorage,
    }),
    [present, title, commit, moveCursor, undo, redo, history, newSheet, saveState, saveError, restoredFromStorage],
  );
}
