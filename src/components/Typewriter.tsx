import React, { useRef, useEffect, useState, useMemo } from 'react';
import { cn, pseudoRandom } from '../lib/utils';
import { MODELS, RIBBONS } from './Toolbar';
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
  validateMargins,
  TYPING_OFFSET_Y,
  PAGE_GAP,
  type PageSpec,
  type PaperSizeKey,
  type MarginPresetKey,
  type DocumentModel,
  type Token,
} from '../lib/documentModel';

interface TypewriterProps {
  model: keyof typeof MODELS;
  ribbon: keyof typeof RIBBONS;
  audioEnabled: boolean;
  audioStatus: AudioStatus;
  volume: number;
  lineSpacing: number;
  paperSize: PaperSizeKey;
  marginPreset: MarginPresetKey;
  paperRef: React.RefObject<HTMLDivElement>;
}

interface CharFormat {
  model: keyof typeof MODELS;
  ribbon: keyof typeof RIBBONS;
}

interface MechanicalMotionState {
  carriageOffsetX: number;
  paperOffsetY: number;
  machineOffsetX: number;
  machineOffsetY: number;
}

export function Typewriter({ model, ribbon, audioEnabled, audioStatus, volume, lineSpacing, paperSize, marginPreset, paperRef }: TypewriterProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [cursorPos, setCursorPos] = useState(0);
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);
  const [charFormats, setCharFormats] = useState<CharFormat[]>([]);
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
  const containerRef = useRef<HTMLDivElement>(null);
  const bellArmedRef = useRef(true);
  const typeMotionTimeoutRef = useRef<number | null>(null);
  const returnMotionTimeoutsRef = useRef<number[]>([]);

  const activeModel = MODELS[model];
  const activeRibbon = RIBBONS[ribbon];
  const wearLevel = activeModel.wear;

  // ---------------------------------------------------------------------------
  // Document model – the single source of truth for page/line layout
  // ---------------------------------------------------------------------------

  const pageSpec: PageSpec = useMemo(() => {
    const paper = PAPER_SIZES[paperSize];
    const margins = MARGIN_PRESETS[marginPreset];
    const spec: PageSpec = {
      ...DEFAULT_PAGE_SPEC,
      paper,
      marginTop: margins.marginTop,
      marginBottom: margins.marginBottom,
      marginLeft: margins.marginLeft,
      marginRight: margins.marginRight,
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
  }, [lineSpacing, paperSize, marginPreset]);

  const doc: DocumentModel = useMemo(
    () => layoutDocument(text, pageSpec),
    [text, pageSpec],
  );

  const { metrics } = doc;

  // ---------------------------------------------------------------------------
  // Effects (unchanged behaviour, now uses doc model constants)
  // ---------------------------------------------------------------------------

  const prevModelRef = useRef(model);
  const prevRibbonRef = useRef(ribbon);

  useEffect(() => {
    if (model !== prevModelRef.current || ribbon !== prevRibbonRef.current) {
      if (selectionStart !== selectionEnd) {
        setCharFormats(prev => {
          const next = [...prev];
          for (let i = selectionStart; i < selectionEnd; i++) {
            if (next[i]) {
              next[i] = {
                ...next[i],
                model: model !== prevModelRef.current ? model : next[i].model,
                ribbon: ribbon !== prevRibbonRef.current ? ribbon : next[i].ribbon
              };
            } else {
              next[i] = { model, ribbon };
            }
          }
          return next;
        });
      }
      prevModelRef.current = model;
      prevRibbonRef.current = ribbon;

      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(selectionStart, selectionEnd);
      }
    }
  }, [model, ribbon, selectionStart, selectionEnd]);

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
        const availableWidth = width - 32;
        if (availableWidth < pageSpec.paper.width) {
          setScale(availableWidth / pageSpec.paper.width);
        } else {
          setScale(1);
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [pageSpec.paper.width]);

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
  // Bell (uses metrics from the document model)
  // ---------------------------------------------------------------------------

  const maybePlayBell = (nextCursorPos: number) => {
    const bellState = evaluateBellState(
      text,
      nextCursorPos,
      bellArmedRef.current,
      audioEngine.getBellColumns(metrics.maxCharsPerLine, model)
    );

    if (bellState.shouldRing) {
      audioEngine.playBell(model);
    }

    bellArmedRef.current = bellState.bellArmed;
  };

  // ---------------------------------------------------------------------------
  // Input handlers (textarea still captures input; layout comes from doc model)
  // ---------------------------------------------------------------------------

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!audioEnabled || audioStatus !== 'ready') return;

    const target = e.currentTarget;
    const nextCursorPos = target.selectionStart + 1;

    if (e.key === 'Enter') {
      audioEngine.playReturn(model);
      bellArmedRef.current = true;
      triggerCarriageReturnMotion();
    } else if (e.key === ' ') {
      audioEngine.playKeypress(true, model);
      audioEngine.playRibbon(model);
      maybePlayBell(nextCursorPos);
      triggerTypingMotion();
    } else if (e.key.length === 1) {
      audioEngine.playKeypress(false, model);
      audioEngine.playRibbon(model);

      maybePlayBell(nextCursorPos);
      triggerTypingMotion();
    } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key.startsWith('Arrow')) {
      if (
        shouldRearmBellAfterCursorOrEdit(
          text,
          target.selectionStart,
          audioEngine.getBellColumns(metrics.maxCharsPerLine, model)
        )
      ) {
        bellArmedRef.current = true;
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    const target = e.target;

    if (!canApplyTextWithinMaxColumns(newText, metrics.maxCharsPerLine)) {
      return;
    }

    let prefixLen = 0;
    while (prefixLen < text.length && prefixLen < newText.length && text[prefixLen] === newText[prefixLen]) {
      prefixLen++;
    }

    let suffixLen = 0;
    while (suffixLen < text.length - prefixLen && suffixLen < newText.length - prefixLen && text[text.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]) {
      suffixLen++;
    }

    const oldReplacedLen = text.length - prefixLen - suffixLen;
    const newInsertedLen = newText.length - prefixLen - suffixLen;

    setCharFormats(prev => {
      const next = [...prev];
      next.splice(prefixLen, oldReplacedLen, ...Array(newInsertedLen).fill({ model, ribbon }));
      return next;
    });

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

    setText(newText);
    setCursorPos(target.selectionStart);
    setSelectionStart(target.selectionStart);
    setSelectionEnd(target.selectionEnd);
    setViewingPage(null);
  };

  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    setCursorPos(target.selectionStart);
    setSelectionStart(target.selectionStart);
    setSelectionEnd(target.selectionEnd);
    setViewingPage(null);
  };

  const handleClick = () => {
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

  const scroll = computeScrollPosition(doc, activePageIdx, activeLineIdx, scale);

  const paperTransform = `translate3d(${motionState.carriageOffsetX}px, ${scroll.transformY + motionState.paperOffsetY}px, 0) scale(${scale})`;
  const guideTransform = `translate3d(${motionState.machineOffsetX}px, ${motionState.machineOffsetY}px, 0) scale(${scale})`;

  const cursorColumnOnLine = cursorColumn(doc, cursor, cursorPos);
  const carriageCueX = pageSpec.marginLeft + cursorColumnOnLine * pageSpec.charWidth;
  const rightMarginX = pageSpec.marginLeft + metrics.maxCharsPerLine * pageSpec.charWidth;
  const marginApproach = Math.min(1, Math.max(0, (cursorColumnOnLine / metrics.maxCharsPerLine - 0.72) / 0.28));

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex-1 flex overflow-hidden bg-neutral-900 relative">
      {/* Sidebar */}
      <div
        className={cn(
          "w-64 bg-neutral-950 border-r border-neutral-800 flex flex-col transition-all duration-300 z-20",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full absolute h-full"
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
      {!isSidebarOpen && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="absolute left-4 top-4 z-20 bg-neutral-800 text-neutral-400 p-2 rounded-md hover:text-white hover:bg-neutral-700 transition-colors"
        >
          ☰ Pages
        </button>
      )}

      {/* Main Typing Area */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden flex justify-center"
        onClick={handleClick}
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
            'absolute top-0 origin-top will-change-transform',
            prefersReducedMotion ? 'transition-transform duration-75 linear' : 'transition-transform duration-150 ease-out'
          )}
          style={{ transform: paperTransform }}
        >
          <div ref={paperRef} className="flex flex-col gap-8 pointer-events-none">
            {doc.pages.map((page, pageIndex) => (
              <div
                key={pageIndex}
                className={cn(
                  "relative paper-texture paper-shadow flex-shrink-0",
                  "transition-all duration-300 ease-in-out",
                  activeModel.font,
                  activeRibbon !== 'ink-stencil' && activeRibbon,
                  activeRibbon === 'ink-stencil' && 'ink-stencil',
                  "ink-bleed paper-sheet text-[15px] tracking-[0.01em] whitespace-pre pointer-events-auto"
                )}
                style={{
                  width: `${pageSpec.paper.width}px`,
                  height: `${pageSpec.paper.height}px`,
                  padding: `${pageSpec.marginTop}px ${pageSpec.marginRight}px ${pageSpec.marginBottom}px ${pageSpec.marginLeft}px`,
                  lineHeight: `${metrics.lineHeight}px`
                }}
              >
                <div className="paper-impression" />
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
                          setCursorPos(newPos);
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

                            return (
                              <span
                                key={tokenIndex}
                                className={cn(
                                  "inline-block relative whitespace-pre",
                                  charModel.font,
                                  charRibbon !== 'ink-stencil' && charRibbon,
                                  charRibbon === 'ink-stencil' && 'ink-stencil',
                                  isSelected && "bg-blue-500/30"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCursorPos(token.index);
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
                                  const i = globalCharIndex++;
                                  const lineSeedIndex = pageIndex * metrics.maxLinesPerPage + lineIndex;
                                  const charStyle = getCharacterRenderStyle(i, charPos, lineSeedIndex, char, format.ribbon);

                                  return (
                                    <span key={charIndex} className="inline-block relative" onClick={(e) => {
                                      e.stopPropagation();
                                      const rect = (e.target as HTMLElement).getBoundingClientRect();
                                      const clickX = e.clientX - rect.left;
                                      const isRightHalf = clickX > rect.width / 2;
                                      const newPos = isRightHalf ? charPos + 1 : charPos;
                                      setCursorPos(newPos);
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
                                          isSelected && "bg-blue-500/30"
                                        )}
                                        style={charStyle}
                                      >
                                        {char}
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

        {/* Typewriter Guide overlay */}
        <div
          className="absolute left-0 w-full pointer-events-none flex justify-center"
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
              className="carriage-margin-cue"
              style={{
                left: `${rightMarginX + 7}px`,
                top: `${Math.max(3, metrics.lineHeight * 0.06)}px`,
                opacity: 0.16 + marginApproach * 0.46,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
