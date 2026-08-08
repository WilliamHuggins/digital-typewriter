import React from 'react';
import { cn, pseudoRandom } from '../lib/utils';
import { MODELS, RIBBONS, DEFAULT_EMPHASIS, type CharEmphasis, type CharFormat, type ModelKey, type RibbonKey } from '../lib/machines';
import type { DocLine, Token } from '../lib/documentModel';

/** Inline style produced for one struck character. */
export interface CharRenderStyle {
  transform: string;
  opacity: number;
  filter: string;
  marginRight: string;
}

export interface PageLineProps {
  line: DocLine;
  pageIndex: number;
  lineIndex: number;
  lineHeight: number;
  /** Seed for this line's vertical wobble and ink ledger */
  lineSeedIndex: number;
  wearLevel: number;

  charFormats: CharFormat[];
  charEmphasis: CharEmphasis[];
  model: ModelKey;
  ribbon: RibbonKey;

  cursorPos: number;
  selectionStart: number;
  selectionEnd: number;
  isCursorOnThisLine: boolean;
  /** Character index currently showing the strike animation, if on this line */
  struckCharIndex: number | null;
  strikeSeq: number;

  ribbonContactClass: Record<string, string>;
  getCharacterRenderStyle: (
    charPos: number,
    lineSeedIndex: number,
    char: string,
    charRibbonKey: RibbonKey,
  ) => CharRenderStyle;
  onCaretTo: (position: number) => void;
}

/**
 * One rendered line of type.
 *
 * Split out of the page so it can be memoised. A long draft runs to tens of
 * thousands of character spans, and before this every one of them was rebuilt
 * on every keystroke — the cost of typing scaled with how much you had already
 * written, which is precisely backwards for a drafting tool.
 */
function PageLineImpl({
  line,
  pageIndex,
  lineIndex,
  lineHeight,
  lineSeedIndex,
  wearLevel,
  charFormats,
  charEmphasis,
  model,
  ribbon,
  cursorPos,
  selectionStart,
  selectionEnd,
  isCursorOnThisLine,
  struckCharIndex,
  strikeSeq,
  ribbonContactClass,
  getCharacterRenderStyle,
  onCaretTo,
}: PageLineProps) {
  const collapsed = selectionStart === selectionEnd;

  return (
    <div
      className="flex relative cursor-text"
      style={{
        height: `${lineHeight}px`,
        transform: `translateY(${(pseudoRandom((pageIndex + 1) * 7000 + lineIndex) - 0.5) * wearLevel * 0.75}px)`,
      }}
      onClick={(e) => {
        e.stopPropagation();
        let newPos = line.endIndex;
        if (line.tokens.length > 0 && line.tokens[line.tokens.length - 1].type === 'newline') {
          newPos = line.tokens[line.tokens.length - 1].index;
        }
        onCaretTo(newPos);
      }}
    >
      {isCursorOnThisLine && line.tokens.length === 0 && collapsed && (
        <span className="typewriter-caret absolute left-0 mt-[1px]" />
      )}

      {line.tokens.map((token: Token, tokenIndex: number) => {
        const isLastToken = tokenIndex === line.tokens.length - 1;

        if (token.type === 'newline') {
          const isSelected = token.index >= selectionStart && token.index < selectionEnd;
          return (
            <span key={tokenIndex} className={cn('inline-block relative', isSelected && 'bg-blue-500/30 w-[0.6em] h-[1.2em]')}>
              {isCursorOnThisLine && cursorPos === token.index && collapsed && (
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
          const isSpaceStruck = struckCharIndex === token.index;
          // Correction fluid covers the gaps between words too; X-ing out
          // historically did not, so spaces take the patch but never the mark.
          const spaceCorrected = charEmphasis[token.index]?.corrected ?? false;

          return (
            <span
              key={isSpaceStruck ? `${tokenIndex}-s${strikeSeq}` : tokenIndex}
              className={cn(
                'inline-block relative whitespace-pre',
                charModel.font,
                charRibbon !== 'ink-stencil' && charRibbon,
                charRibbon === 'ink-stencil' && 'ink-stencil',
                isSelected && 'bg-blue-500/30',
              )}
              onClick={(e) => {
                e.stopPropagation();
                onCaretTo(token.index);
              }}
            >
              {isCursorOnThisLine && cursorPos === token.index && collapsed && (
                <span className="typewriter-caret absolute left-0 mt-[1px]" />
              )}
              {' '}
              {spaceCorrected && <span className="correction-patch" aria-hidden="true" />}
              {isSpaceStruck && (
                <span className={cn('ribbon-contact', ribbonContactClass[format.ribbon] || 'ribbon-contact-black')} />
              )}
              {isCursorOnThisLine && isLastToken && cursorPos === token.index + 1 && collapsed && (
                <span className="typewriter-caret absolute right-0 translate-x-full mt-[1px]" />
              )}
            </span>
          );
        }

        return (
          <span key={tokenIndex} className="inline-block relative">
            {token.text.split('').map((char: string, charIndex: number) => {
              const charPos = token.index + charIndex;
              const format = charFormats[charPos] || { model, ribbon };
              const charModel = MODELS[format.model];
              const charRibbon = RIBBONS[format.ribbon];
              const isSelected = charPos >= selectionStart && charPos < selectionEnd;
              const emphasis = charEmphasis[charPos] || DEFAULT_EMPHASIS;
              const baseStyle = getCharacterRenderStyle(charPos, lineSeedIndex, char, format.ribbon);
              const charStyle = {
                ...baseStyle,
                textDecoration: emphasis.underline ? 'underline' : undefined,
                textDecorationThickness: emphasis.underline ? '1px' : undefined,
                textUnderlineOffset: emphasis.underline ? '2px' : undefined,
                fontWeight: emphasis.strikeCount > 1 ? 700 : undefined,
                // Correction fluid buries the glyph; a hint of it still shows
                // through, as it does on paper.
                opacity: emphasis.corrected
                  ? 0.14
                  : Math.min(1, 0.84 + (emphasis.strikeCount - 1) * 0.08),
              };

              const isStruck = struckCharIndex === charPos;

              return (
                <span
                  key={isStruck ? `${charIndex}-s${strikeSeq}` : charIndex}
                  className="inline-block relative"
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                    const isRightHalf = e.clientX - rect.left > rect.width / 2;
                    onCaretTo(isRightHalf ? charPos + 1 : charPos);
                  }}
                >
                  {isCursorOnThisLine && cursorPos === charPos && collapsed && (
                    <span className="typewriter-caret absolute left-0 mt-[1px]" />
                  )}
                  <span
                    className={cn(
                      'inline-block',
                      charModel.font,
                      charRibbon !== 'ink-stencil' && charRibbon,
                      charRibbon === 'ink-stencil' && 'ink-stencil',
                      isSelected && 'bg-blue-500/30',
                      isStruck && 'strike-impact',
                    )}
                    style={charStyle}
                  >
                    {char}
                    {isStruck && (
                      <>
                        <span className={cn('ribbon-contact', ribbonContactClass[format.ribbon] || 'ribbon-contact-black')} />
                        <span className="strike-shadow" />
                      </>
                    )}
                  </span>
                  {emphasis.corrected && <span className="correction-patch" aria-hidden="true" />}
                  {emphasis.overstrike && (
                    <span
                      className={cn('char-overstrike', charModel.font)}
                      style={{ opacity: baseStyle.opacity }}
                      aria-hidden="true"
                    >
                      {emphasis.overstrike}
                    </span>
                  )}
                  {isCursorOnThisLine && isLastToken && charIndex === token.text.length - 1 && cursorPos === charPos + 1 && collapsed && (
                    <span className="typewriter-caret absolute right-0 translate-x-full mt-[1px]" />
                  )}
                </span>
              );
            })}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Skip re-rendering a line whose appearance cannot have changed.
 *
 * The format and emphasis arrays get a fresh identity on every edit, so a
 * default shallow compare would never skip anything. Compare the slices this
 * line actually reads instead, and treat the caret and selection as relevant
 * only when they touch this line.
 */
function sameSlice<T>(a: T[], b: T[], from: number, to: number): boolean {
  for (let i = from; i < to; i++) {
    // Entries are replaced wholesale on edit, so identity is a sound proxy.
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function touchesLine(line: DocLine, from: number, to: number): boolean {
  return to >= line.startIndex && from <= line.endIndex;
}

function areEqual(prev: PageLineProps, next: PageLineProps): boolean {
  if (
    prev.line !== next.line
    && (prev.line.startIndex !== next.line.startIndex
      || prev.line.endIndex !== next.line.endIndex
      || prev.line.tokens.length !== next.line.tokens.length)
  ) {
    return false;
  }

  // Token text can change without the line's bounds changing — an overstrike
  // replaces a character in place.
  if (prev.line !== next.line) {
    for (let i = 0; i < prev.line.tokens.length; i++) {
      const a = prev.line.tokens[i];
      const b = next.line.tokens[i];
      if (a.type !== b.type || a.index !== b.index) return false;
      if (a.type === 'word' && b.type === 'word' && a.text !== b.text) return false;
    }
  }

  if (
    prev.lineHeight !== next.lineHeight
    || prev.lineSeedIndex !== next.lineSeedIndex
    || prev.pageIndex !== next.pageIndex
    || prev.lineIndex !== next.lineIndex
    || prev.wearLevel !== next.wearLevel
    || prev.model !== next.model
    || prev.ribbon !== next.ribbon
    || prev.getCharacterRenderStyle !== next.getCharacterRenderStyle
    || prev.onCaretTo !== next.onCaretTo
  ) {
    return false;
  }

  const from = next.line.startIndex;
  const to = next.line.endIndex;

  if (!sameSlice(prev.charFormats, next.charFormats, from, to)) return false;
  if (!sameSlice(prev.charEmphasis, next.charEmphasis, from, to)) return false;

  // The caret and the strike marker only matter while they are on this line.
  if (prev.isCursorOnThisLine !== next.isCursorOnThisLine) return false;
  if (next.isCursorOnThisLine && prev.cursorPos !== next.cursorPos) return false;

  const prevStruck = prev.struckCharIndex !== null && touchesLine(prev.line, prev.struckCharIndex, prev.struckCharIndex);
  const nextStruck = next.struckCharIndex !== null && touchesLine(next.line, next.struckCharIndex, next.struckCharIndex);
  if (prevStruck || nextStruck) {
    if (prev.struckCharIndex !== next.struckCharIndex || prev.strikeSeq !== next.strikeSeq) return false;
  }

  // Selection highlighting only matters if either range overlaps this line.
  const prevSelects = touchesLine(prev.line, prev.selectionStart, prev.selectionEnd);
  const nextSelects = touchesLine(next.line, next.selectionStart, next.selectionEnd);
  if (prevSelects || nextSelects) {
    if (prev.selectionStart !== next.selectionStart || prev.selectionEnd !== next.selectionEnd) return false;
  } else if ((prev.selectionStart === prev.selectionEnd) !== (next.selectionStart === next.selectionEnd)) {
    // Collapsing or opening a selection changes whether carets render at all.
    return false;
  }

  return true;
}

export const PageLine = React.memo(PageLineImpl, areEqual);
