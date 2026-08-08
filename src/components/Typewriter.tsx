import React, { useRef, useEffect, useState, useMemo } from 'react';
import type { ResponsiveTier } from '../lib/responsive';
import { cn, pseudoRandom } from '../lib/utils';
import { MODELS, RIBBONS, DEFAULT_EMPHASIS, typeMetricsFor, MODEL_FONT_STACKS, type CharEmphasis, type CharFormat } from '../lib/machines';
import { MachineChassis } from './MachineChassis';
import { MarginRuler } from './MarginRuler';
import { useTypePitch } from '../hooks/useTypePitch';
import type { TypewriterDocument } from '../hooks/useTypewriterDocument';
import { classifyKey, type EditKind } from '../lib/history';
import { type AudioStatus, audioEngine } from '../lib/audio';
import {
  canApplyTextWithinMaxColumns,
  evaluateBellState,
  shouldRearmBellAfterCursorOrEdit
} from '../lib/carriageModel';
import {
  calculateRibbonInkStyle,
  createRibbonWearState,
  incrementRibbonWear,
  buildLineImpressionLedger,
} from '../lib/ribbonWear';
import {
  DEFAULT_PAGE_SPEC,
  PAPER_SIZES,
  MARGIN_PRESETS,
  layoutDocument,
  locateCursor,
  cursorColumn,
  computeScrollPosition,
  computeMetrics,
  computeMarginGuideGeometry,
  validateMargins,
  TYPING_OFFSET_Y,
  PAGE_GAP,
  type PageSpec,
  type PaperSizeKey,
  type MarginPresetKey,
  type DocumentModel,
  type Token,
  type CustomMargins,
} from '../lib/documentModel';

interface TypewriterProps {
  responsiveTier: ResponsiveTier;
  mobileKeyboardOpen: boolean;
  doc: TypewriterDocument;
  model: keyof typeof MODELS;
  ribbon: keyof typeof RIBBONS;
  audioEnabled: boolean;
  audioStatus: AudioStatus;
  volume: number;
  lineSpacing: number;
  paperSize: PaperSizeKey;
  marginPreset: MarginPresetKey;
  customMargins: CustomMargins;
  paperRef: React.RefObject<HTMLDivElement>;
  /** Applied when the writer drags a margin stop along the scale */
  onMarginStopsChange: (next: { marginLeft: number; marginRight: number }) => void;
  onDocumentModelChange?: (doc: DocumentModel) => void;
  onRibbonWearChange?: (state: import('../lib/ribbonWear').RibbonWearState) => void;
  disableBackspaceDelete: boolean;
}

interface MechanicalMotionState {
  carriageOffsetX: number;
  paperOffsetY: number;
  machineOffsetX: number;
  machineOffsetY: number;
}

export function Typewriter({ responsiveTier, mobileKeyboardOpen, doc: documentState, model, ribbon, audioEnabled, audioStatus, volume, lineSpacing, paperSize, marginPreset, customMargins, paperRef, onMarginStopsChange, onDocumentModelChange, onRibbonWearChange, disableBackspaceDelete }: TypewriterProps) {
  // The document itself lives in `useTypewriterDocument` so the toolbar can act
  // on it too; these are read-only views onto that state.
  const { text, charFormats, charEmphasis, cursorPos } = documentState;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);
  const [viewingPage, setViewingPage] = useState<number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [scale, setScale] = useState(1);
  const [ribbonWearState, setRibbonWearState] = useState(() => createRibbonWearState(ribbon));
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [motionState, setMotionState] = useState<MechanicalMotionState>({
    carriageOffsetX: 0,
    paperOffsetY: 0,
    machineOffsetX: 0,
    machineOffsetY: 0,
  });
  // Strike effect: tracks the char index and a monotonic counter for re-triggers
  const [strikeEffect, setStrikeEffect] = useState<{ charIndex: number; seq: number } | null>(null);
  const strikeSeqRef = useRef(0);
  const strikeTimeoutRef = useRef<number | null>(null);

  // The carriage has run into the right margin stop and further keystrokes are
  // being refused. On the real machine this is unmistakable — the keys physically
  // lock — so it has to be visible here rather than swallowed silently.
  const [carriageLocked, setCarriageLocked] = useState(false);
  const lockTimeoutRef = useRef<number | null>(null);

  // Notch count for the ribbon spools; every strike advances the ribbon a
  // little so the spools turn while the writer works.
  const [ribbonTurn, setRibbonTurn] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const bellArmedRef = useRef(true);
  const typeMotionTimeoutRef = useRef<number | null>(null);
  const returnMotionTimeoutsRef = useRef<number[]>([]);
  /** What produced the pending edit, so history knows whether to coalesce. */
  const pendingEditKindRef = useRef<EditKind>('type');

  /**
   * Where the next character actually lands.
   *
   * The hidden textarea's own caret cannot answer this. Printable keys are
   * preventDefault'ed, so the caret only moves when React re-renders — and a
   * fast typist can land several keystrokes inside one render, at which point
   * every one of them reads the same stale position and overstrikes the same
   * cell. These refs are advanced synchronously on every commit, and resynced
   * from state after each render.
   */
  const liveTextRef = useRef(text);
  const liveCursorRef = useRef(cursorPos);

  useEffect(() => {
    liveTextRef.current = text;
    liveCursorRef.current = cursorPos;
  }, [text, cursorPos]);

  const activeModel = MODELS[model];

  const isDesktop = responsiveTier === 'desktop';
  const isTablet = responsiveTier === 'tablet';
  const isMobile = responsiveTier === 'mobile';

  const activeRibbon = RIBBONS[ribbon];
  const wearLevel = activeModel.wear;

  // Map ribbon key to ribbon-contact CSS class
  const ribbonContactClass: Record<string, string> = {
    black: 'ribbon-contact-black',
    red: 'ribbon-contact-red',
    blue: 'ribbon-contact-blue',
    stencil: 'ribbon-contact-stencil',
  };

  // ---------------------------------------------------------------------------
  // Document model – the single source of truth for page/line layout
  // ---------------------------------------------------------------------------

  // Type metrics belong to the machine, not to the app. Pica cuts about 63
  // characters to a line; elite fits 76 in the same margins. Changing machine
  // therefore changes the document, not just its texture.
  const typeMetrics = typeMetricsFor(model);
  const pitch = useTypePitch(MODEL_FONT_STACKS[model], typeMetrics.fontSize, typeMetrics.charWidth);

  const pageSpec: PageSpec = useMemo(() => {
    const paper = PAPER_SIZES[paperSize];
    const margins = marginPreset === 'custom'
      ? customMargins
      : MARGIN_PRESETS[marginPreset];
    const spec: PageSpec = {
      ...DEFAULT_PAGE_SPEC,
      paper,
      marginTop: margins.marginTop,
      marginBottom: margins.marginBottom,
      marginLeft: margins.marginLeft,
      marginRight: margins.marginRight,
      charWidth: typeMetrics.charWidth,
      baseLineHeight: typeMetrics.baseLineHeight,
      lineSpacing,
    };
    // Validate and fall back to normal margins if the combination is degenerate
    const check = validateMargins(paper, spec.marginTop, spec.marginBottom, spec.marginLeft, spec.marginRight);
    if (!check.valid) {
      const fallback = MARGIN_PRESETS.normal;
      spec.marginTop = fallback.marginTop;
      spec.marginBottom = fallback.marginBottom;
      spec.marginLeft = fallback.marginLeft;
      spec.marginRight = fallback.marginRight;
    }
    return spec;
  }, [lineSpacing, paperSize, marginPreset, customMargins, typeMetrics.charWidth, typeMetrics.baseLineHeight]);

  const doc: DocumentModel = useMemo(
    () => layoutDocument(text, pageSpec),
    [text, pageSpec],
  );

  const { metrics } = doc;
  const marginGuides = useMemo(
    () => computeMarginGuideGeometry(pageSpec),
    [pageSpec],
  );

  useEffect(() => {
    onDocumentModelChange?.(doc);
  }, [doc, onDocumentModelChange]);

  useEffect(() => {
    onRibbonWearChange?.(ribbonWearState);
  }, [ribbonWearState, onRibbonWearChange]);

  // ---------------------------------------------------------------------------
  // Effects (unchanged behaviour, now uses doc model constants)
  // ---------------------------------------------------------------------------

  const prevModelRef = useRef(model);
  const prevRibbonRef = useRef(ribbon);

  // Changing machine or ribbon while text is selected re-inks that selection,
  // the way retyping a passage on a different machine would.
  useEffect(() => {
    if (model === prevModelRef.current && ribbon === prevRibbonRef.current) return;

    const modelChanged = model !== prevModelRef.current;
    const ribbonChanged = ribbon !== prevRibbonRef.current;
    prevModelRef.current = model;
    prevRibbonRef.current = ribbon;

    if (selectionStart !== selectionEnd) {
      const next = [...charFormats];
      for (let i = selectionStart; i < selectionEnd; i++) {
        const existing = next[i];
        next[i] = existing
          ? {
              model: modelChanged ? model : existing.model,
              ribbon: ribbonChanged ? ribbon : existing.ribbon,
            }
          : { model, ribbon };
      }
      documentState.commit({ text, charFormats: next, charEmphasis, cursorPos }, 'replace');
    }

    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(selectionStart, selectionEnd);
    }
    // Intentionally keyed on machine/ribbon only: re-running on every selection
    // change would re-ink text the writer merely highlighted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, ribbon]);

  useEffect(() => {
    setRibbonWearState(createRibbonWearState(ribbon));
  }, [ribbon]);

  useEffect(() => {
    // Removed sessionStorage persistence so refresh clears the pages
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        const horizontalPadding = isMobile ? 18 : isTablet ? 28 : 32;
        const availableWidth = width - horizontalPadding;
        if (availableWidth < pageSpec.paper.width) {
          setScale(availableWidth / pageSpec.paper.width);
        } else {
          setScale(1);
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [pageSpec.paper.width, isMobile, isTablet]);

  useEffect(() => {
    setIsSidebarOpen(isDesktop);
  }, [isDesktop]);

  useEffect(() => {
    audioEngine.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    bellArmedRef.current = true;
  }, [model]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updateMotionPreference();
    mediaQuery.addEventListener('change', updateMotionPreference);

    return () => mediaQuery.removeEventListener('change', updateMotionPreference);
  }, []);

  useEffect(() => () => {
    if (typeMotionTimeoutRef.current) {
      window.clearTimeout(typeMotionTimeoutRef.current);
    }
    if (strikeTimeoutRef.current) {
      window.clearTimeout(strikeTimeoutRef.current);
    }
    if (lockTimeoutRef.current) {
      window.clearTimeout(lockTimeoutRef.current);
    }
    returnMotionTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
  }, []);

  // ---------------------------------------------------------------------------
  // Mechanical motion (unchanged)
  // ---------------------------------------------------------------------------

  const triggerTypingMotion = () => {
    if (prefersReducedMotion) return;

    if (typeMotionTimeoutRef.current) {
      window.clearTimeout(typeMotionTimeoutRef.current);
    }

    setMotionState((prev) => ({
      ...prev,
      carriageOffsetX: -1.5,
      machineOffsetX: 0.6,
      machineOffsetY: 0.3,
    }));

    typeMotionTimeoutRef.current = window.setTimeout(() => {
      setMotionState((prev) => ({
        ...prev,
        carriageOffsetX: 0,
        machineOffsetX: 0,
        machineOffsetY: 0,
      }));
    }, 75);
  };

  const triggerCarriageReturnMotion = () => {
    if (prefersReducedMotion) return;

    if (typeMotionTimeoutRef.current) {
      window.clearTimeout(typeMotionTimeoutRef.current);
      typeMotionTimeoutRef.current = null;
    }

    returnMotionTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    returnMotionTimeoutsRef.current = [];

    setMotionState((prev) => ({
      ...prev,
      carriageOffsetX: -18,
      paperOffsetY: 4,
      machineOffsetX: 1,
      machineOffsetY: 0.6,
    }));

    returnMotionTimeoutsRef.current.push(
      window.setTimeout(() => {
        setMotionState((prev) => ({
          ...prev,
          carriageOffsetX: 1.2,
          paperOffsetY: 1.5,
          machineOffsetX: 0,
          machineOffsetY: 0,
        }));
      }, 115)
    );

    returnMotionTimeoutsRef.current.push(
      window.setTimeout(() => {
        setMotionState((prev) => ({
          ...prev,
          carriageOffsetX: 0,
          paperOffsetY: 0,
        }));
      }, 220)
    );
  };

  // ---------------------------------------------------------------------------
  // Strike effect – triggered when a printable character is typed
  // ---------------------------------------------------------------------------

  const triggerStrikeEffect = (charIndex: number) => {
    if (prefersReducedMotion) return;

    if (strikeTimeoutRef.current) {
      window.clearTimeout(strikeTimeoutRef.current);
    }

    strikeSeqRef.current += 1;
    setStrikeEffect({ charIndex, seq: strikeSeqRef.current });

    // Clear effect after longest animation completes (160ms)
    strikeTimeoutRef.current = window.setTimeout(() => {
      setStrikeEffect(null);
    }, 180);
  };

  // ---------------------------------------------------------------------------
  // Bell (uses metrics from the document model)
  // ---------------------------------------------------------------------------

  /**
   * Evaluate the bell and ring it if the carriage has entered the warning zone.
   *
   * The bell's *state* is tracked whether or not sound is available — muting the
   * machine must not desynchronise the margin warning — but it only makes a
   * noise when audio is ready.
   */
  const maybePlayBell = (nextCursorPos: number, soundReady: boolean) => {
    const bellState = evaluateBellState(
      text,
      nextCursorPos,
      bellArmedRef.current,
      audioEngine.getBellColumns(metrics.maxCharsPerLine, model)
    );

    if (bellState.shouldRing && soundReady) {
      audioEngine.playBell(model);
    }

    bellArmedRef.current = bellState.bellArmed;
  };

  // ---------------------------------------------------------------------------
  // Margin stop
  // ---------------------------------------------------------------------------

  /**
   * The carriage refused a keystroke because the line is full.
   *
   * Previously this branch returned silently, so the app simply stopped
   * responding partway through a sentence. A real machine locks its keys and
   * rings; the writer needs both signals to know the machine is working and it
   * is the margin, not the app, that stopped them.
   */
  const signalCarriageLock = () => {
    setCarriageLocked(true);

    if (audioEnabled && audioStatus === 'ready') {
      audioEngine.playBell(model);
    }

    if (lockTimeoutRef.current) {
      window.clearTimeout(lockTimeoutRef.current);
    }
    lockTimeoutRef.current = window.setTimeout(() => setCarriageLocked(false), 1400);
  };

  /** Anything that shortens the line or returns the carriage frees the keys. */
  const releaseCarriageLock = () => {
    if (lockTimeoutRef.current) {
      window.clearTimeout(lockTimeoutRef.current);
      lockTimeoutRef.current = null;
    }
    setCarriageLocked(false);
  };

  // ---------------------------------------------------------------------------
  // Input handlers (textarea still captures input; layout comes from doc model)
  // ---------------------------------------------------------------------------

  const restoreSnapshotSelection = (snapshot: { text: string; cursorPos: number } | null) => {
    if (!snapshot) return;
    // Undo replaces the document wholesale, so the live cursor has to jump with
    // it rather than wait for the resync effect.
    liveTextRef.current = snapshot.text;
    liveCursorRef.current = snapshot.cursorPos;
    setSelectionStart(snapshot.cursorPos);
    setSelectionEnd(snapshot.cursorPos);
    setViewingPage(null);
    releaseCarriageLock();
    window.requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(snapshot.cursorPos, snapshot.cursorPos);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    const modifier = e.metaKey || e.ctrlKey;

    // Undo/redo has to be intercepted here: the native stack is empty because
    // printable keys never reach the textarea's own edit pipeline.
    if (modifier && !e.altKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      restoreSnapshotSelection(e.shiftKey ? documentState.redo() : documentState.undo());
      return;
    }
    if (modifier && !e.altKey && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      restoreSnapshotSelection(documentState.redo());
      return;
    }

    if (disableBackspaceDelete && (e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault();
      return;
    }

    const soundReady = audioEnabled && audioStatus === 'ready';
    const isPrintable = e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && !e.nativeEvent.isComposing;
    const strikeAt = liveCursorRef.current;
    const nextCursorPos = strikeAt + 1;

    if (isPrintable) {
      e.preventDefault();
      pendingEditKindRef.current = 'type';

      // Nothing else should fire if the margin stop refused the character —
      // no strike mark, no carriage travel, no ribbon advance.
      if (!applyManualStrike(e.key, target)) {
        return;
      }

      triggerStrikeEffect(strikeAt);
      triggerTypingMotion();
      setRibbonTurn((turn) => turn + 1);
      maybePlayBell(nextCursorPos, soundReady);

      if (soundReady) {
        audioEngine.playKeypress(e.key === ' ', model);
        audioEngine.playRibbon(model);
      }
      return;
    }

    // Everything below is mechanical feedback, and deliberately runs whether or
    // not sound is enabled. Muting the machine should silence it, not freeze it.
    if (e.key === 'Enter') {
      pendingEditKindRef.current = 'return';
      releaseCarriageLock();
      bellArmedRef.current = true;
      triggerCarriageReturnMotion();

      if (soundReady) {
        audioEngine.playReturn(model);
      }
      return;
    }

    if (e.key === 'Backspace' || e.key === 'Delete' || e.key.startsWith('Arrow')) {
      pendingEditKindRef.current = classifyKey(e.key);
      releaseCarriageLock();

      if (
        shouldRearmBellAfterCursorOrEdit(
          liveTextRef.current,
          liveCursorRef.current,
          audioEngine.getBellColumns(metrics.maxCharsPerLine, model)
        )
      ) {
        bellArmedRef.current = true;
      }
    }
  };

  /**
   * Apply a whole-document text replacement.
   *
   * Returns false when the margin stop refused the edit, so callers can skip
   * the strike effect and sound that would otherwise imply the key landed.
   */
  const applyTextUpdate = (
    newText: string,
    nextSelectionStart: number,
    nextSelectionEnd: number,
    kind: EditKind = pendingEditKindRef.current,
  ): boolean => {
    if (!canApplyTextWithinMaxColumns(newText, metrics.maxCharsPerLine)) {
      signalCarriageLock();
      return false;
    }

    // Diff against the live text, not the rendered prop, so a burst of
    // keystrokes inside one render each builds on the last.
    const prevText = liveTextRef.current;

    let prefixLen = 0;
    while (prefixLen < prevText.length && prefixLen < newText.length && prevText[prefixLen] === newText[prefixLen]) {
      prefixLen++;
    }

    let suffixLen = 0;
    while (suffixLen < prevText.length - prefixLen && suffixLen < newText.length - prefixLen && prevText[prevText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]) {
      suffixLen++;
    }

    const oldReplacedLen = prevText.length - prefixLen - suffixLen;
    const newInsertedLen = newText.length - prefixLen - suffixLen;

    const nextFormats = [...charFormats];
    nextFormats.splice(
      prefixLen,
      oldReplacedLen,
      ...Array.from({ length: newInsertedLen }, (): CharFormat => ({ model, ribbon })),
    );

    const nextEmphasis = [...charEmphasis];
    nextEmphasis.splice(
      prefixLen,
      oldReplacedLen,
      ...Array.from({ length: newInsertedLen }, (): CharEmphasis => ({ ...DEFAULT_EMPHASIS })),
    );

    setRibbonWearState(prev => {
      if (newText.length === 0) {
        return createRibbonWearState(ribbon);
      }

      const lineLedger = buildLineImpressionLedger({
        text: newText,
        insertedRange: { start: prefixLen, length: newInsertedLen },
        maxColumns: metrics.maxCharsPerLine,
      });

      return incrementRibbonWear(prev, newInsertedLen, ribbon, lineLedger);
    });

    liveTextRef.current = newText;
    liveCursorRef.current = nextSelectionStart;

    documentState.commit(
      {
        text: newText,
        charFormats: nextFormats,
        charEmphasis: nextEmphasis,
        cursorPos: nextSelectionStart,
      },
      kind,
    );

    setSelectionStart(nextSelectionStart);
    setSelectionEnd(nextSelectionEnd);
    setViewingPage(null);
    return true;
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    const target = e.target;

    // A change that arrives without a preceding keydown is a paste or a drop.
    const kind: EditKind = Math.abs(newText.length - text.length) > 1 && pendingEditKindRef.current === 'type'
      ? 'paste'
      : pendingEditKindRef.current;

    if (!applyTextUpdate(newText, target.selectionStart, target.selectionEnd, kind)) {
      // Put the textarea back in step with the document it refused to change.
      target.value = text;
      target.setSelectionRange(cursorPos, cursorPos);
    }

    pendingEditKindRef.current = 'type';
  };

  /**
   * Strike one character at the caret, the way the machine would.
   *
   * Typing over an existing character overstrikes it rather than inserting:
   * repeating the same letter darkens it, `_` underlines it, anything else
   * replaces it. Returns false if the margin stop refused the strike.
   */
  const applyManualStrike = (key: string, target: HTMLTextAreaElement): boolean => {
    const text = liveTextRef.current;
    // A live selection still comes from the textarea — the browser owns
    // dragging and shift-arrow — but a collapsed caret comes from our own
    // bookkeeping, which is the only thing that keeps up with fast typing.
    const hasSelection = target.selectionStart !== target.selectionEnd;
    const start = hasSelection ? target.selectionStart : liveCursorRef.current;
    const end = hasSelection ? target.selectionEnd : start;

    const commitOverstrike = (newText: string, nextEmphasis: CharEmphasis[]) => {
      const nextPos = start + 1;
      liveTextRef.current = newText;
      liveCursorRef.current = nextPos;
      documentState.commit(
        { text: newText, charFormats, charEmphasis: nextEmphasis, cursorPos: nextPos },
        'type',
      );
      setSelectionStart(nextPos);
      setSelectionEnd(nextPos);
      setViewingPage(null);
      window.requestAnimationFrame(() => target.setSelectionRange(nextPos, nextPos));
    };

    if (start !== end) {
      const newText = `${text.slice(0, start)}${key}${text.slice(end)}`;
      return applyTextUpdate(newText, start + 1, start + 1, 'replace');
    }

    if (start < text.length && text[start] !== '\n') {
      // Overstriking does not lengthen the line, so it can never hit the stop.
      if (key === '_') {
        const nextEmphasis = [...charEmphasis];
        nextEmphasis[start] = { ...(nextEmphasis[start] ?? DEFAULT_EMPHASIS), underline: true };
        commitOverstrike(text, nextEmphasis);
        return true;
      }

      if (text[start] === key) {
        const nextEmphasis = [...charEmphasis];
        const existing = nextEmphasis[start] ?? DEFAULT_EMPHASIS;
        nextEmphasis[start] = { ...existing, strikeCount: existing.strikeCount + 1 };
        setRibbonWearState(prev => incrementRibbonWear(prev, 1, ribbon));
        commitOverstrike(text, nextEmphasis);
        return true;
      }

      const newText = `${text.slice(0, start)}${key}${text.slice(start + 1)}`;
      return applyTextUpdate(newText, start + 1, start + 1, 'type');
    }

    const newText = `${text.slice(0, start)}${key}${text.slice(start)}`;
    return applyTextUpdate(newText, start + 1, start + 1, 'type');
  };

  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    documentState.moveCursor(target.selectionStart);
    setSelectionStart(target.selectionStart);
    setSelectionEnd(target.selectionEnd);
    setViewingPage(null);
  };

  const handleClick = () => {
    audioEngine.resumeFromUserGesture();
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // ---------------------------------------------------------------------------
  // Cursor & scroll positioning – driven by document model
  // ---------------------------------------------------------------------------

  const cursor = locateCursor(doc, cursorPos);
  const cursorPageIdx = cursor.pageIndex;
  const cursorLineIdx = cursor.lineIndex;

  let globalCharIndex = 0;

  const getCharacterRenderStyle = (
    charSeedIndex: number,
    charPos: number,
    lineSeedIndex: number,
    char: string,
    charRibbonKey: keyof typeof RIBBONS
  ) => {
    const seed = charSeedIndex * 1337;
    const xJitter = (pseudoRandom(seed) - 0.5) * 1.1 * wearLevel;
    const yJitter = (pseudoRandom(seed + 1) - 0.5) * 1.25 * wearLevel;
    const rotJitter = (pseudoRandom(seed + 2) - 0.5) * 1.6 * wearLevel;
    const inkFade = pseudoRandom(seed + 3) * wearLevel * 0.22;
    const pressVariance = (pseudoRandom(seed + 4) - 0.5) * wearLevel * 0.08;
    const spacingNudge = (pseudoRandom(seed + 5) - 0.5) * wearLevel * 0.04;
    const ribbonInk = calculateRibbonInkStyle({
      state: ribbonWearState,
      ribbon: charRibbonKey,
      char,
      charIndex: charPos,
      lineIndex: lineSeedIndex,
    });

    return {
      transform: `translate(${xJitter}px, ${yJitter}px) rotate(${rotJitter}deg)`,
      opacity: (0.92 - inkFade) * ribbonInk.opacity,
      filter: `contrast(${(ribbonInk.contrast + pressVariance).toFixed(3)}) brightness(${ribbonInk.brightness.toFixed(3)})`,
      marginRight: `${spacingNudge}em`,
    };
  };

  // Vertical offset to keep the typing line fixed
  const activePageIdx = viewingPage !== null ? viewingPage : cursorPageIdx;
  const activeLineIdx = viewingPage !== null ? 0 : cursorLineIdx;

  const scroll = computeScrollPosition(
    doc,
    activePageIdx,
    viewingPage !== null ? activeLineIdx : Math.max(0, activeLineIdx - (isMobile && mobileKeyboardOpen ? 2 : 0)),
    scale
  );

  const cursorColumnOnLine = cursorColumn(doc, cursor, cursorPos);
  const carriageTravelOffset = prefersReducedMotion
    ? 0
    : -Math.min(cursorColumnOnLine * pageSpec.charWidth * 0.14, pageSpec.paper.width * 0.06);

  const paperTransform = `translate3d(${motionState.carriageOffsetX + carriageTravelOffset}px, ${scroll.transformY + motionState.paperOffsetY}px, 0) scale(${scale})`;
  const guideTransform = `translate3d(${motionState.machineOffsetX}px, ${motionState.machineOffsetY}px, 0) scale(${scale})`;

  const carriageCueX = pageSpec.marginLeft + cursorColumnOnLine * pageSpec.charWidth;
  const rightMarginX = pageSpec.marginLeft + metrics.maxCharsPerLine * pageSpec.charWidth;
  const marginApproach = Math.min(1, Math.max(0, (cursorColumnOnLine / metrics.maxCharsPerLine - 0.72) / 0.28));

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className={cn('flex-1 flex overflow-hidden bg-neutral-900 relative', isMobile ? 'flex-col' : 'flex-row') }>
      {/* Sidebar */}
      <div
        className={cn(
          'bg-neutral-950 flex flex-col transition-all duration-300 z-20',
          isMobile
            ? isSidebarOpen
              ? 'absolute inset-x-0 top-14 bottom-0 border-t border-neutral-800'
              : 'hidden'
            : isTablet
              ? isSidebarOpen
                ? 'absolute left-0 top-0 bottom-0 w-56 border-r border-neutral-800'
                : 'hidden'
              : 'w-64 border-r border-neutral-800'
        )}
      >
        <div className="p-4 border-b border-neutral-800 flex justify-between items-center text-neutral-400">
          <span className="text-sm font-medium uppercase tracking-wider">Pages</span>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {doc.pages.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setViewingPage(idx)}
              className={cn(
                "aspect-[8.5/11] w-full bg-[#f4f1ea] rounded-[2px] shadow-md flex items-center justify-center text-neutral-400 transition-all border border-[#d9d2c2]",
                activePageIdx === idx ? "ring-2 ring-blue-500 opacity-100" : "opacity-50 hover:opacity-80"
              )}
            >
              <span className="font-mono text-xl">{idx + 1}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Toggle Sidebar Button (when closed) */}
      {!isSidebarOpen && !isDesktop && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          className={cn('absolute z-20 bg-neutral-800/95 text-neutral-300 px-3 py-2 rounded-md hover:text-white hover:bg-neutral-700 transition-colors', isMobile ? 'left-3 top-3 text-sm' : 'left-4 top-4')}
        >
          ☰ Pages
        </button>
      )}

      {/* Main Typing Area */}
      <div
        ref={containerRef}
        className={cn('flex-1 relative overflow-hidden flex justify-center', isMobile ? 'pt-3 pb-28 px-2' : 'px-3 md:px-6 py-4')}
        onClick={handleClick}
        onPointerDown={() => {
          audioEngine.resumeFromUserGesture();
        }}
      >
        {/* Hidden textarea – still the input capture mechanism */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onSelect={handleSelect}
          className="absolute inset-0 w-full h-full opacity-0 resize-none pointer-events-none"
          style={{ color: 'transparent', backgroundColor: 'transparent', borderColor: 'transparent', outline: 'none', caretColor: 'transparent' }}
          spellCheck={false}
          autoFocus
          aria-label="Typewriter input"
        />

        {/* Paper Container – pages rendered from document model */}
        <div
          className={cn(
            'absolute top-0 origin-top will-change-transform z-10 max-w-full',
            prefersReducedMotion ? 'transition-transform duration-75 linear' : 'transition-transform duration-150 ease-out'
          )}
          style={{ transform: paperTransform }}
        >
          <div ref={paperRef} className={cn('flex flex-col pointer-events-none', isMobile ? 'gap-5' : 'gap-8') }>
            {doc.pages.map((page, pageIndex) => (
              <div
                key={pageIndex}
                className={cn(
                  "relative paper-texture paper-shadow flex-shrink-0",
                  "transition-all duration-300 ease-in-out",
                  activeModel.font,
                  activeRibbon !== 'ink-stencil' && activeRibbon,
                  activeRibbon === 'ink-stencil' && 'ink-stencil',
                  "ink-bleed paper-sheet whitespace-pre pointer-events-auto"
                )}
                style={{
                  width: `${pageSpec.paper.width}px`,
                  height: `${pageSpec.paper.height}px`,
                  padding: `${pageSpec.marginTop}px ${pageSpec.marginRight}px ${pageSpec.marginBottom}px ${pageSpec.marginLeft}px`,
                  fontSize: `${typeMetrics.fontSize}px`,
                  // Trims each glyph's natural advance to the machine's pitch,
                  // so a line of text ends exactly where the layout engine and
                  // the margin guides say it should.
                  letterSpacing: `${pitch.letterSpacing}px`,
                  lineHeight: `${metrics.lineHeight}px`
                }}
              >
                <div className="paper-impression" />
                <div
                  className="margin-guides"
                  style={{
                    top: `${marginGuides.top}px`,
                    right: `${marginGuides.right}px`,
                    bottom: `${marginGuides.bottom}px`,
                    left: `${marginGuides.left}px`,
                  }}
                  aria-hidden="true"
                />
                <div className="relative z-10">
                  {page.lines.map((line, lineIndex) => {
                    const isCursorOnThisLine = viewingPage === null && cursorPageIdx === pageIndex && cursorLineIdx === lineIndex;

                    return (
                      <div
                        key={lineIndex}
                        className="flex relative cursor-text"
                        style={{
                          height: `${metrics.lineHeight}px`,
                          transform: `translateY(${(pseudoRandom((pageIndex + 1) * 7000 + lineIndex) - 0.5) * wearLevel * 0.75}px)`
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          let newPos = line.endIndex;
                          if (line.tokens.length > 0 && line.tokens[line.tokens.length - 1].type === 'newline') {
                            newPos = line.tokens[line.tokens.length - 1].index;
                          }
                          documentState.moveCursor(newPos);
                          if (textareaRef.current) {
                            textareaRef.current.focus();
                            textareaRef.current.setSelectionRange(newPos, newPos);
                          }
                        }}
                      >
                        {isCursorOnThisLine && line.tokens.length === 0 && selectionStart === selectionEnd && (
                          <span className="typewriter-caret absolute left-0 mt-[1px]" />
                        )}
                        {line.tokens.map((token: Token, tokenIndex: number) => {
                          const isLastToken = tokenIndex === line.tokens.length - 1;

                          if (token.type === 'newline') {
                            const isSelected = token.index >= selectionStart && token.index < selectionEnd;
                            return (
                              <span key={tokenIndex} className={cn("inline-block relative", isSelected && "bg-blue-500/30 w-[0.6em] h-[1.2em]")}>
                                {isCursorOnThisLine && cursorPos === token.index && selectionStart === selectionEnd && (
                                  <span className="typewriter-caret absolute left-0 mt-[1px]" />
                                )}
                              </span>
                            );
                          }

                          if (token.type === 'space') {
                            const format = charFormats[token.index] || { model, ribbon };
                            const charModel = MODELS[format.model];
                            const charRibbon = RIBBONS[format.ribbon];
                            const isSelected = token.index >= selectionStart && token.index < selectionEnd;
                            const isSpaceStruck = strikeEffect !== null && strikeEffect.charIndex === token.index;

                            return (
                              <span
                                key={isSpaceStruck ? `${tokenIndex}-s${strikeEffect.seq}` : tokenIndex}
                                className={cn(
                                  "inline-block relative whitespace-pre",
                                  charModel.font,
                                  charRibbon !== 'ink-stencil' && charRibbon,
                                  charRibbon === 'ink-stencil' && 'ink-stencil',
                                  isSelected && "bg-blue-500/30"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  documentState.moveCursor(token.index);
                                  if (textareaRef.current) {
                                    textareaRef.current.focus();
                                    textareaRef.current.setSelectionRange(token.index, token.index);
                                  }
                                }}
                              >
                                {isCursorOnThisLine && cursorPos === token.index && selectionStart === selectionEnd && (
                                  <span className="typewriter-caret absolute left-0 mt-[1px]" />
                                )}
                                {' '}
                                {isSpaceStruck && (
                                  <span className={cn("ribbon-contact", ribbonContactClass[format.ribbon] || 'ribbon-contact-black')} />
                                )}
                                {isCursorOnThisLine && isLastToken && cursorPos === token.index + 1 && selectionStart === selectionEnd && (
                                  <span className="typewriter-caret absolute right-0 translate-x-full mt-[1px]" />
                                )}
                              </span>
                            );
                          }

                          if (token.type === 'word') {
                            return (
                              <span key={tokenIndex} className="inline-block relative">
                                {token.text.split('').map((char: string, charIndex: number) => {
                                  const charPos = token.index + charIndex;
                                  const format = charFormats[charPos] || { model, ribbon };
                                  const charModel = MODELS[format.model];
                                  const charRibbon = RIBBONS[format.ribbon];
                                  const isSelected = charPos >= selectionStart && charPos < selectionEnd;
                                  const emphasis = charEmphasis[charPos] || { strikeCount: 1, underline: false };
                                  const i = globalCharIndex++;
                                  const lineSeedIndex = pageIndex * metrics.maxLinesPerPage + lineIndex;
                                  const baseStyle = getCharacterRenderStyle(i, charPos, lineSeedIndex, char, format.ribbon);
                                  const charStyle = {
                                    ...baseStyle,
                                    textDecoration: emphasis.underline ? 'underline' : undefined,
                                    textDecorationThickness: emphasis.underline ? '1px' : undefined,
                                    textUnderlineOffset: emphasis.underline ? '2px' : undefined,
                                    fontWeight: emphasis.strikeCount > 1 ? 700 : undefined,
                                    opacity: Math.min(1, 0.84 + (emphasis.strikeCount - 1) * 0.08),
                                  };

                                  const isStruck = strikeEffect !== null && strikeEffect.charIndex === charPos;

                                  return (
                                    <span key={isStruck ? `${charIndex}-s${strikeEffect.seq}` : charIndex} className="inline-block relative" onClick={(e) => {
                                      e.stopPropagation();
                                      const rect = (e.target as HTMLElement).getBoundingClientRect();
                                      const clickX = e.clientX - rect.left;
                                      const isRightHalf = clickX > rect.width / 2;
                                      const newPos = isRightHalf ? charPos + 1 : charPos;
                                      documentState.moveCursor(newPos);
                                      if (textareaRef.current) {
                                        textareaRef.current.focus();
                                        textareaRef.current.setSelectionRange(newPos, newPos);
                                      }
                                    }}>
                                      {isCursorOnThisLine && cursorPos === charPos && selectionStart === selectionEnd && (
                                        <span className="typewriter-caret absolute left-0 mt-[1px]" />
                                      )}
                                      <span
                                        className={cn(
                                          "inline-block",
                                          charModel.font,
                                          charRibbon !== 'ink-stencil' && charRibbon,
                                          charRibbon === 'ink-stencil' && 'ink-stencil',
                                          isSelected && "bg-blue-500/30",
                                          isStruck && "strike-impact"
                                        )}
                                        style={charStyle}
                                      >
                                        {char}
                                        {isStruck && (
                                          <>
                                            <span className={cn("ribbon-contact", ribbonContactClass[format.ribbon] || 'ribbon-contact-black')} />
                                            <span className="strike-shadow" />
                                          </>
                                        )}
                                      </span>
                                      {isCursorOnThisLine && isLastToken && charIndex === token.text.length - 1 && cursorPos === charPos + 1 && selectionStart === selectionEnd && (
                                        <span className="typewriter-caret absolute right-0 translate-x-full mt-[1px]" />
                                      )}
                                    </span>
                                  );
                                })}
                              </span>
                            );
                          }
                          return null;
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Margin scale, pinned above the printing line where the machine's
            own scale sits. Dragging a stop sets the margin directly. */}
        {!isMobile && (
          <div
            className="absolute left-0 z-30 flex w-full justify-center"
            style={{ top: `${Math.max(6, TYPING_OFFSET_Y - 118)}px` }}
          >
            <MarginRuler
              paper={pageSpec.paper}
              marginLeft={pageSpec.marginLeft}
              marginRight={pageSpec.marginRight}
              charWidth={pageSpec.charWidth}
              scale={scale}
              onChange={onMarginStopsChange}
            />
          </div>
        )}

        <MachineChassis
          model={model}
          ribbon={ribbon}
          paperWidth={pageSpec.paper.width}
          printingLineY={TYPING_OFFSET_Y}
          lineHeight={metrics.lineHeight}
          strikeX={carriageCueX}
          scale={scale}
          carriageX={motionState.carriageOffsetX + carriageTravelOffset}
          offsetX={motionState.machineOffsetX}
          offsetY={motionState.machineOffsetY}
          ribbonTurn={ribbonTurn}
          compact={!isDesktop}
          reducedMotion={prefersReducedMotion}
        />

        {/* Typewriter Guide overlay */}
        <div
          className={cn('absolute left-0 w-full pointer-events-none flex justify-center z-30', isMobile && 'opacity-80')}
          style={{ top: `${TYPING_OFFSET_Y}px`, height: `${metrics.lineHeight}px` }}
        >
          <div
            className="relative"
            style={{ width: `${pageSpec.paper.width}px`, transform: guideTransform, transformOrigin: 'center' }}
          >
            <div className="absolute inset-x-0 top-0 border-b border-black/5" />
            <div
              className={cn('carriage-bracket-cue', prefersReducedMotion && 'carriage-cue-reduced-motion')}
              style={{
                left: `${carriageCueX - 9}px`,
                top: `${Math.max(2, metrics.lineHeight * 0.14)}px`,
              }}
            >
              <span className="carriage-bracket-pin" />
            </div>
            <div
              className={cn('carriage-margin-cue', carriageLocked && 'carriage-margin-cue-locked')}
              style={{
                left: `${rightMarginX + 7}px`,
                top: `${Math.max(3, metrics.lineHeight * 0.06)}px`,
                opacity: carriageLocked ? 1 : 0.16 + marginApproach * 0.46,
              }}
            />
            {carriageLocked && (
              <div
                className="carriage-lock-flag"
                style={{ left: `${rightMarginX + 16}px` }}
                role="status"
              >
                Margin stop &middot; press Return
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
