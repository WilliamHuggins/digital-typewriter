import React, { useRef, useEffect, useState } from 'react';
import { cn, pseudoRandom } from '../lib/utils';
import { MODELS, RIBBONS } from './Toolbar';
import { type AudioStatus, audioEngine } from '../lib/audio';
import {
  canApplyTextWithinMaxColumns,
  evaluateBellState,
  shouldRearmBellAfterCursorOrEdit
} from '../lib/carriageModel';

interface TypewriterProps {
  model: keyof typeof MODELS;
  ribbon: keyof typeof RIBBONS;
  audioEnabled: boolean;
  audioStatus: AudioStatus;
  volume: number;
  lineSpacing: number;
  paperRef: React.RefObject<HTMLDivElement>;
}

const PAGE_WIDTH = 816;
const PAGE_HEIGHT = 1056;
const MARGIN_X = 104;
const MARGIN_TOP = 122;
const MARGIN_BOTTOM = 104;
const CHAR_WIDTH = 9.6; // Approximate width of 15px monospace char
const BASE_LINE_HEIGHT = 24; // 15px * 1.6
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const CONTENT_HEIGHT = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;
const MAX_CHARS_PER_LINE = Math.floor(CONTENT_WIDTH / CHAR_WIDTH);
const TYPING_OFFSET_Y = 250; // Distance from top of container to the typing line

interface CharFormat {
  model: keyof typeof MODELS;
  ribbon: keyof typeof RIBBONS;
}

export function Typewriter({ model, ribbon, audioEnabled, audioStatus, volume, lineSpacing, paperRef }: TypewriterProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [cursorPos, setCursorPos] = useState(0);
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);
  const [charFormats, setCharFormats] = useState<CharFormat[]>([]);
  const [viewingPage, setViewingPage] = useState<number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const bellArmedRef = useRef(true);

  const activeModel = MODELS[model];
  const activeRibbon = RIBBONS[ribbon];
  const wearLevel = activeModel.wear;
  
  const currentLineHeight = BASE_LINE_HEIGHT * lineSpacing;
  const MAX_LINES_PER_PAGE = Math.floor(CONTENT_HEIGHT / currentLineHeight);

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

  // Load from session storage on mount
  useEffect(() => {
    // Removed sessionStorage persistence so refresh clears the pages
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        // Add some padding (e.g., 32px) so it doesn't touch the edges
        const availableWidth = width - 32;
        if (availableWidth < PAGE_WIDTH) {
          setScale(availableWidth / PAGE_WIDTH);
        } else {
          setScale(1);
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    audioEngine.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    bellArmedRef.current = true;
  }, [model]);

  const maybePlayBell = (nextCursorPos: number) => {
    const bellState = evaluateBellState(
      text,
      nextCursorPos,
      bellArmedRef.current,
      audioEngine.getBellColumns(MAX_CHARS_PER_LINE, model)
    );

    if (bellState.shouldRing) {
      audioEngine.playBell(model);
    }

    bellArmedRef.current = bellState.bellArmed;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!audioEnabled || audioStatus !== 'ready') return;

    const target = e.currentTarget;
    const nextCursorPos = target.selectionStart + 1;

    if (e.key === 'Enter') {
      audioEngine.playReturn(model);
      bellArmedRef.current = true;
    } else if (e.key === ' ') {
      audioEngine.playKeypress(true, model);
      maybePlayBell(nextCursorPos);
    } else if (e.key.length === 1) {
      audioEngine.playKeypress(false, model);

      maybePlayBell(nextCursorPos);
    } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key.startsWith('Arrow')) {
      if (
        shouldRearmBellAfterCursorOrEdit(
          text,
          target.selectionStart,
          audioEngine.getBellColumns(MAX_CHARS_PER_LINE, model)
        )
      ) {
        bellArmedRef.current = true;
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    const target = e.target;
    
    // Enforce max characters per line
    if (!canApplyTextWithinMaxColumns(newText, MAX_CHARS_PER_LINE)) {
      return; // Reject the change
    }
    
    // Find common prefix
    let prefixLen = 0;
    while (prefixLen < text.length && prefixLen < newText.length && text[prefixLen] === newText[prefixLen]) {
      prefixLen++;
    }
    
    // Find common suffix
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
    
    setText(newText);
    setCursorPos(target.selectionStart);
    setSelectionStart(target.selectionStart);
    setSelectionEnd(target.selectionEnd);
    setViewingPage(null); // Snap back to current typing position
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

  // Layout engine
  const pages: { lines: { tokens: any[], startIndex: number, endIndex: number }[] }[] = [];
  let currentLines: { tokens: any[], startIndex: number, endIndex: number }[] = [];
  let currentLine: any[] = [];
  let currentLineLength = 0;
  let currentLineStartIndex = 0;

  const finishLine = (endIndex: number) => {
    currentLines.push({ tokens: currentLine, startIndex: currentLineStartIndex, endIndex });
    if (currentLines.length >= MAX_LINES_PER_PAGE) {
      pages.push({ lines: currentLines });
      currentLines = [];
    }
    currentLine = [];
    currentLineStartIndex = endIndex;
    currentLineLength = 0;
  };

  let i = 0;
  while (i < text.length) {
    if (text[i] === '\n') {
      currentLine.push({ type: 'newline', index: i });
      finishLine(i + 1);
      i++;
    } else if (text[i] === ' ') {
      if (currentLineLength + 1 <= MAX_CHARS_PER_LINE) {
        currentLine.push({ type: 'space', index: i });
        currentLineLength += 1;
      } else {
        currentLine.push({ type: 'space', index: i });
        finishLine(i + 1);
      }
      i++;
    } else {
      let word = '';
      let startIndex = i;
      while (i < text.length && text[i] !== ' ' && text[i] !== '\n') {
        word += text[i];
        i++;
      }
      const wordLen = word.length;
      
      if (currentLineLength === 0) {
        currentLine.push({ type: 'word', text: word, index: startIndex });
        currentLineLength += wordLen;
      } else if (currentLineLength + wordLen <= MAX_CHARS_PER_LINE) {
        currentLine.push({ type: 'word', text: word, index: startIndex });
        currentLineLength += wordLen;
      } else {
        finishLine(startIndex);
        currentLine.push({ type: 'word', text: word, index: startIndex });
        currentLineLength += wordLen;
      }
    }
  }
  
  currentLines.push({ tokens: currentLine, startIndex: currentLineStartIndex, endIndex: text.length });
  if (currentLines.length > 0 || pages.length === 0) {
    pages.push({ lines: currentLines });
  }

  let cursorPageIdx = 0;
  let cursorLineIdx = 0;

  for (let pIdx = 0; pIdx < pages.length; pIdx++) {
    for (let lIdx = 0; lIdx < pages[pIdx].lines.length; lIdx++) {
      const line = pages[pIdx].lines[lIdx];
      
      if (cursorPos >= line.startIndex && cursorPos < line.endIndex) {
        cursorPageIdx = pIdx;
        cursorLineIdx = lIdx;
      } else if (cursorPos === line.endIndex && cursorPos === text.length) {
        cursorPageIdx = pIdx;
        cursorLineIdx = lIdx;
      }
    }
  }

  let globalCharIndex = 0;

  const getCharacterRenderStyle = (charSeedIndex: number) => {
    const seed = charSeedIndex * 1337;
    const xJitter = (pseudoRandom(seed) - 0.5) * 1.1 * wearLevel;
    const yJitter = (pseudoRandom(seed + 1) - 0.5) * 1.25 * wearLevel;
    const rotJitter = (pseudoRandom(seed + 2) - 0.5) * 1.6 * wearLevel;
    const inkFade = pseudoRandom(seed + 3) * wearLevel * 0.32;
    const pressVariance = (pseudoRandom(seed + 4) - 0.5) * wearLevel * 0.12;
    const spacingNudge = (pseudoRandom(seed + 5) - 0.5) * wearLevel * 0.04;

    return {
      transform: `translate(${xJitter}px, ${yJitter}px) rotate(${rotJitter}deg)`,
      opacity: 0.9 - inkFade,
      filter: `contrast(${1 + pressVariance})`,
      marginRight: `${spacingNudge}em`,
    };
  };

  // Calculate vertical offset to keep the typing line fixed
  const activePageIdx = viewingPage !== null ? viewingPage : cursorPageIdx;
  const activeLineIdx = viewingPage !== null ? 0 : cursorLineIdx;
  
  // 32px is the gap between pages
  const pageOffsetY = activePageIdx * (PAGE_HEIGHT + 32);
  const lineOffsetY = MARGIN_TOP + activeLineIdx * currentLineHeight;
  const totalOffsetY = pageOffsetY + lineOffsetY;
  
  const transformY = TYPING_OFFSET_Y - totalOffsetY * scale;

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
          {pages.map((_, idx) => (
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
        {/* Hidden textarea */}
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
        
        {/* Paper Container - Moves up as you type */}
        <div 
          className="absolute top-0 transition-transform duration-300 ease-out origin-top"
          style={{ transform: `translateY(${transformY}px) scale(${scale})` }}
        >
          <div ref={paperRef} className="flex flex-col gap-8 pointer-events-none">
            {pages.map((page, pageIndex) => (
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
                  width: `${PAGE_WIDTH}px`, 
                  height: `${PAGE_HEIGHT}px`,
                  padding: `${MARGIN_TOP}px ${MARGIN_X}px ${MARGIN_BOTTOM}px`,
                  lineHeight: `${currentLineHeight}px`
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
                          height: `${currentLineHeight}px`,
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
                        {line.tokens.map((token, tokenIndex) => {
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
                                  const charStyle = getCharacterRenderStyle(i);

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
        
        {/* Typewriter Guide overlay (optional visual flair for the "typing line") */}
        <div 
          className="absolute top-[250px] left-0 w-full pointer-events-none flex justify-center"
          style={{ height: `${currentLineHeight}px` }}
        >
          <div 
            className="w-[816px] border-b border-black/5" 
            style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}
          />
        </div>
      </div>
    </div>
  );
}
