/**
 * Lightweight document/page model for the digital typewriter.
 *
 * Centralises paper geometry, margin/line calculations, and text-to-page
 * layout so that rendering, export, and future features all draw from the
 * same source of truth instead of scattering constants across components.
 */

// ---------------------------------------------------------------------------
// Paper sizes
// ---------------------------------------------------------------------------

export interface PaperSize {
  /** Display name */
  name: string;
  /** Page width in CSS pixels */
  width: number;
  /** Page height in CSS pixels */
  height: number;
}

export const PAPER_SIZES: Record<string, PaperSize> = {
  letter: { name: 'US Letter', width: 816, height: 1056 },
  a4: { name: 'A4', width: 794, height: 1123 },
} as const;

export type PaperSizeKey = keyof typeof PAPER_SIZES;

// ---------------------------------------------------------------------------
// Margin presets
// ---------------------------------------------------------------------------

export interface MarginPreset {
  name: string;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
}

export const MARGIN_PRESETS: Record<string, MarginPreset> = {
  narrow: { name: 'Narrow', marginTop: 72, marginBottom: 72, marginLeft: 72, marginRight: 72 },
  normal: { name: 'Normal', marginTop: 122, marginBottom: 104, marginLeft: 104, marginRight: 104 },
  wide: { name: 'Wide', marginTop: 144, marginBottom: 144, marginLeft: 152, marginRight: 152 },
} as const;

export type MarginPresetKey = keyof typeof MARGIN_PRESETS | 'custom';

/** User-defined margin values in CSS pixels */
export interface CustomMargins {
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
}

// ---------------------------------------------------------------------------
// Margin validation
// ---------------------------------------------------------------------------

/** Minimum margin in px (~0.5 inch) */
export const MIN_MARGIN = 48;
/** Minimum content area in px (~2 inches) to prevent degenerate layouts */
export const MIN_CONTENT_SIZE = 192;

/** CSS pixels per inch (standard web resolution) */
export const PX_PER_INCH = 96;

/** Convert CSS pixels to inches (rounded to 2 decimal places) */
export function pxToInches(px: number): number {
  return Math.round((px / PX_PER_INCH) * 100) / 100;
}

/** Convert inches to CSS pixels (rounded to nearest integer) */
export function inchesToPx(inches: number): number {
  return Math.round(inches * PX_PER_INCH);
}

export function validateMargins(
  paper: PaperSize,
  marginTop: number,
  marginBottom: number,
  marginLeft: number,
  marginRight: number,
): { valid: boolean; reason?: string } {
  if (marginTop < MIN_MARGIN || marginBottom < MIN_MARGIN || marginLeft < MIN_MARGIN || marginRight < MIN_MARGIN) {
    return { valid: false, reason: 'Margins must be at least 48px (~0.5")' };
  }
  const contentW = paper.width - marginLeft - marginRight;
  const contentH = paper.height - marginTop - marginBottom;
  if (contentW < MIN_CONTENT_SIZE) {
    return { valid: false, reason: 'Horizontal margins are too large for this paper size' };
  }
  if (contentH < MIN_CONTENT_SIZE) {
    return { valid: false, reason: 'Vertical margins are too large for this paper size' };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Page spec – everything needed to lay out a single page
// ---------------------------------------------------------------------------

export interface PageSpec {
  paper: PaperSize;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  /** Approximate width of one monospace character (px) */
  charWidth: number;
  /** Base line height before spacing multiplier (px) */
  baseLineHeight: number;
  /** Line spacing multiplier (1, 1.5, 2) */
  lineSpacing: number;
}

/** Derived measurements computed from a PageSpec. */
export interface PageMetrics {
  /** Usable content width (px) */
  contentWidth: number;
  /** Usable content height (px) */
  contentHeight: number;
  /** Effective line height (px) */
  lineHeight: number;
  /** Maximum printable characters per visual line */
  maxCharsPerLine: number;
  /** Maximum visual lines that fit on one page */
  maxLinesPerPage: number;
}

export function computeMetrics(spec: PageSpec): PageMetrics {
  const contentWidth = spec.paper.width - spec.marginLeft - spec.marginRight;
  const contentHeight = spec.paper.height - spec.marginTop - spec.marginBottom;
  const lineHeight = spec.baseLineHeight * spec.lineSpacing;
  const maxCharsPerLine = Math.floor(contentWidth / spec.charWidth);
  const maxLinesPerPage = Math.floor(contentHeight / lineHeight);

  return { contentWidth, contentHeight, lineHeight, maxCharsPerLine, maxLinesPerPage };
}

// ---------------------------------------------------------------------------
// Default page spec (matches existing app constants exactly)
// ---------------------------------------------------------------------------

export const DEFAULT_PAGE_SPEC: PageSpec = {
  paper: PAPER_SIZES.letter,
  marginTop: 122,
  marginBottom: 104,
  marginLeft: 104,
  marginRight: 104,
  charWidth: 9.6,
  baseLineHeight: 24,
  lineSpacing: 1,
};

// ---------------------------------------------------------------------------
// Token / line / page structures
// ---------------------------------------------------------------------------

export interface NewlineToken {
  type: 'newline';
  index: number;
}

export interface SpaceToken {
  type: 'space';
  index: number;
}

export interface WordToken {
  type: 'word';
  text: string;
  index: number;
}

export type Token = NewlineToken | SpaceToken | WordToken;

export interface DocLine {
  tokens: Token[];
  /** Character index in source text where this line starts */
  startIndex: number;
  /** Character index in source text one past the last char on this line */
  endIndex: number;
}

export interface DocPage {
  /** Zero-based page number */
  pageNumber: number;
  lines: DocLine[];
}

// ---------------------------------------------------------------------------
// Document model
// ---------------------------------------------------------------------------

export interface DocumentModel {
  /** The spec used to lay out these pages */
  spec: PageSpec;
  /** Derived metrics */
  metrics: PageMetrics;
  /** Paginated lines */
  pages: DocPage[];
  /** Total number of pages */
  pageCount: number;
}

// ---------------------------------------------------------------------------
// Layout engine – text → DocumentModel
// ---------------------------------------------------------------------------

export function layoutDocument(text: string, spec: PageSpec): DocumentModel {
  const metrics = computeMetrics(spec);

  const pages: DocPage[] = [];
  let currentLines: DocLine[] = [];
  let currentTokens: Token[] = [];
  let currentLineLength = 0;
  let currentLineStartIndex = 0;

  const finishLine = (endIndex: number) => {
    currentLines.push({ tokens: currentTokens, startIndex: currentLineStartIndex, endIndex });

    if (currentLines.length >= metrics.maxLinesPerPage) {
      pages.push({ pageNumber: pages.length, lines: currentLines });
      currentLines = [];
    }

    currentTokens = [];
    currentLineStartIndex = endIndex;
    currentLineLength = 0;
  };

  let i = 0;
  while (i < text.length) {
    if (text[i] === '\n') {
      currentTokens.push({ type: 'newline', index: i });
      finishLine(i + 1);
      i++;
    } else if (text[i] === ' ') {
      if (currentLineLength + 1 <= metrics.maxCharsPerLine) {
        currentTokens.push({ type: 'space', index: i });
        currentLineLength += 1;
      } else {
        currentTokens.push({ type: 'space', index: i });
        finishLine(i + 1);
      }
      i++;
    } else {
      let word = '';
      const startIndex = i;
      while (i < text.length && text[i] !== ' ' && text[i] !== '\n') {
        word += text[i];
        i++;
      }
      const wordLen = word.length;

      if (currentLineLength === 0) {
        currentTokens.push({ type: 'word', text: word, index: startIndex });
        currentLineLength += wordLen;
      } else if (currentLineLength + wordLen <= metrics.maxCharsPerLine) {
        currentTokens.push({ type: 'word', text: word, index: startIndex });
        currentLineLength += wordLen;
      } else {
        finishLine(startIndex);
        currentTokens.push({ type: 'word', text: word, index: startIndex });
        currentLineLength += wordLen;
      }
    }
  }

  // Push remaining tokens as the last line
  currentLines.push({ tokens: currentTokens, startIndex: currentLineStartIndex, endIndex: text.length });

  if (currentLines.length > 0 || pages.length === 0) {
    pages.push({ pageNumber: pages.length, lines: currentLines });
  }

  return { spec, metrics, pages, pageCount: pages.length };
}

// ---------------------------------------------------------------------------
// Cursor helpers
// ---------------------------------------------------------------------------

export interface CursorLocation {
  pageIndex: number;
  lineIndex: number;
}

export function locateCursor(doc: DocumentModel, cursorPos: number): CursorLocation {
  let pageIndex = 0;
  let lineIndex = 0;

  for (let pIdx = 0; pIdx < doc.pages.length; pIdx++) {
    const page = doc.pages[pIdx];
    for (let lIdx = 0; lIdx < page.lines.length; lIdx++) {
      const line = page.lines[lIdx];
      if (cursorPos >= line.startIndex && cursorPos < line.endIndex) {
        return { pageIndex: pIdx, lineIndex: lIdx };
      }
      if (cursorPos === line.endIndex && cursorPos === doc.pages[doc.pageCount - 1].lines[doc.pages[doc.pageCount - 1].lines.length - 1].endIndex) {
        pageIndex = pIdx;
        lineIndex = lIdx;
      }
    }
  }

  return { pageIndex, lineIndex };
}

/**
 * Compute the visual column of the cursor on its current wrapped line.
 */
export function cursorColumn(doc: DocumentModel, loc: CursorLocation, cursorPos: number): number {
  const line = doc.pages[loc.pageIndex]?.lines[loc.lineIndex];
  if (!line) return 0;
  const lineContentEnd = line.tokens.length > 0 && line.tokens[line.tokens.length - 1].type === 'newline'
    ? line.endIndex - 1
    : line.endIndex;
  return Math.max(0, Math.min(cursorPos - line.startIndex, lineContentEnd - line.startIndex));
}

// ---------------------------------------------------------------------------
// Visual positioning helpers
// ---------------------------------------------------------------------------

/** Gap between rendered pages in the scrolling view (px). */
export const PAGE_GAP = 32;

/** Distance from the top of the viewport to the active typing line (px). */
export const TYPING_OFFSET_Y = 250;

export interface ScrollPosition {
  /** CSS transform Y offset (px) to keep the active line at TYPING_OFFSET_Y */
  transformY: number;
}

export function computeScrollPosition(
  doc: DocumentModel,
  activePageIdx: number,
  activeLineIdx: number,
  scale: number,
): ScrollPosition {
  const pageOffsetY = activePageIdx * (doc.spec.paper.height + PAGE_GAP);
  const lineOffsetY = doc.spec.marginTop + activeLineIdx * doc.metrics.lineHeight;
  const totalOffsetY = pageOffsetY + lineOffsetY;
  return { transformY: TYPING_OFFSET_Y - totalOffsetY * scale };
}
