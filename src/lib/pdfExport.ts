import { jsPDF } from 'jspdf';
import type { DocLine, DocumentModel, PageSpec, Token } from './documentModel';
import type { RibbonKey } from './ribbonWear';
import { type PdfFontDef, COURIER_FONT, resolvePdfFont } from './pdfFonts';

const PDF_FONT_BASE_SIZE = 15;
const CALIBRATION_PROBE_TEXT = 'MMMMMMMMMM';
const MIN_PDF_FONT_SIZE = 10;
const MAX_PDF_FONT_SIZE = 24;

// ---------------------------------------------------------------------------
// Ribbon → PDF color mapping
// ---------------------------------------------------------------------------

/** RGB triplet used by jsPDF's setTextColor. */
export interface PdfRgbColor {
  r: number;
  g: number;
  b: number;
}

/**
 * Centralized mapping from ribbon key to PDF text color.
 *
 * Values match the CSS ink colours defined in index.css:
 *   black  → #111827   red → #991b1b   blue → #1e40af
 *
 * Stencil mode: On screen, stencil renders as transparent text with a debossed
 * shadow to simulate cut-out lettering with no ink transfer. PDF has no native
 * equivalent of CSS text-shadow with transparent fill. We render stencil text
 * as a light warm gray (#c8c0b0) — close to the paper colour — so the text is
 * faintly visible but clearly distinct from inked ribbons, preserving the
 * "no ink" intent while keeping the export readable and printable.
 */
const RIBBON_PDF_COLORS: Record<RibbonKey, PdfRgbColor> = {
  black:   { r: 0x11, g: 0x18, b: 0x27 },
  red:     { r: 0x99, g: 0x1b, b: 0x1b },
  blue:    { r: 0x1e, g: 0x40, b: 0xaf },
  stencil: { r: 0xc8, g: 0xc0, b: 0xb0 },
};

const DEFAULT_PDF_COLOR: PdfRgbColor = RIBBON_PDF_COLORS.black;

/** Resolve a ribbon key to its PDF RGB colour, falling back to black. */
export function ribbonToPdfColor(ribbon: string | undefined): PdfRgbColor {
  if (ribbon && ribbon in RIBBON_PDF_COLORS) {
    return RIBBON_PDF_COLORS[ribbon as RibbonKey];
  }
  return DEFAULT_PDF_COLOR;
}

// ---------------------------------------------------------------------------

interface GlyphCell {
  char: string;
  column: number;
  /** Index into the original source text, used to look up per-character ribbon. */
  sourceIndex: number;
}

export interface PdfFontCalibration {
  fontSize: number;
  charCellWidth: number;
  measuredCharWidth: number;
  widthScale: number;
  fontFamily: string;
  fontStyle: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computeCalibratedFontSize(baseFontSize: number, measuredCharWidth: number, targetCharWidth: number): number {
  if (measuredCharWidth <= 0 || targetCharWidth <= 0) return baseFontSize;
  const nextSize = (baseFontSize * targetCharWidth) / measuredCharWidth;
  return clamp(nextSize, MIN_PDF_FONT_SIZE, MAX_PDF_FONT_SIZE);
}

function measureCharWidth(pdf: jsPDF): number {
  const probeWidth = pdf.getTextWidth(CALIBRATION_PROBE_TEXT);
  return probeWidth / CALIBRATION_PROBE_TEXT.length;
}

/**
 * Calibrate PDF font sizing for a specific font against spec.charWidth.
 * Works for both embedded typewriter fonts and the Courier fallback.
 */
export function calibratePdfFont(pdf: jsPDF, spec: PageSpec, fontDef: PdfFontDef): PdfFontCalibration {
  pdf.setFont(fontDef.family, fontDef.style);
  pdf.setFontSize(PDF_FONT_BASE_SIZE);

  const baseMeasuredCharWidth = measureCharWidth(pdf);
  const fontSize = computeCalibratedFontSize(PDF_FONT_BASE_SIZE, baseMeasuredCharWidth, spec.charWidth);

  pdf.setFontSize(fontSize);
  const measuredCharWidth = measureCharWidth(pdf);

  return {
    fontSize,
    charCellWidth: spec.charWidth,
    measuredCharWidth,
    widthScale: measuredCharWidth > 0 ? spec.charWidth / measuredCharWidth : 1,
    fontFamily: fontDef.family,
    fontStyle: fontDef.style,
  };
}

export function tokensToGlyphCells(tokens: Token[]): GlyphCell[] {
  const glyphs: GlyphCell[] = [];
  let column = 0;

  tokens.forEach((token) => {
    if (token.type === 'space') {
      column += 1;
      return;
    }

    if (token.type === 'word') {
      for (let i = 0; i < token.text.length; i++) {
        glyphs.push({ char: token.text[i], column, sourceIndex: token.index + i });
        column += 1;
      }
    }
  });

  return glyphs;
}

/** Thickness of the simulated underline stroke in px. */
const PDF_UNDERLINE_THICKNESS = 0.8;
/** Offset below the text baseline for the underline stroke. */
const PDF_UNDERLINE_OFFSET = 2;

function drawLine(
  pdf: jsPDF,
  line: DocLine,
  x: number,
  y: number,
  charCellWidth: number,
  fontSize: number,
  charRibbons: string[] | undefined,
  charEmphasis: CharEmphasisEntry[] | undefined,
  fallbackColor: PdfRgbColor,
) {
  const glyphs = tokensToGlyphCells(line.tokens);
  if (glyphs.length === 0) return;

  let activeColor = fallbackColor;

  glyphs.forEach(({ char, column, sourceIndex }) => {
    // Resolve per-character color
    if (charRibbons) {
      const ribbonKey = charRibbons[sourceIndex];
      const color = ribbonKey ? ribbonToPdfColor(ribbonKey) : fallbackColor;
      if (color.r !== activeColor.r || color.g !== activeColor.g || color.b !== activeColor.b) {
        pdf.setTextColor(color.r, color.g, color.b);
        activeColor = color;
      }
    }

    const glyphX = x + column * charCellWidth;

    // Render the character — overstrike (strikeCount > 1) adds a second
    // pass with a slight offset to simulate typewriter bold.
    const emphasis = charEmphasis?.[sourceIndex];
    const isBold = emphasis && emphasis.strikeCount > 1;

    pdf.text(char, glyphX, y, { baseline: 'top' });

    if (isBold) {
      // Second strike slightly offset, mimicking a mechanical re-strike
      pdf.text(char, glyphX + 0.4, y, { baseline: 'top' });
    }

    // Render overstrikes — different characters typed over this position
    if (emphasis?.overstrikes && emphasis.overstrikes.length > 0) {
      for (const oChar of emphasis.overstrikes) {
        pdf.text(oChar, glyphX, y, { baseline: 'top' });
      }
    }

    // Draw underline
    if (emphasis?.underline) {
      const underlineY = y + fontSize + PDF_UNDERLINE_OFFSET;
      pdf.setDrawColor(activeColor.r, activeColor.g, activeColor.b);
      pdf.setLineWidth(PDF_UNDERLINE_THICKNESS);
      pdf.line(glyphX, underlineY, glyphX + charCellWidth, underlineY);
    }
  });
}

/** Per-character emphasis data mirroring the on-screen typewriter effects. */
export interface CharEmphasisEntry {
  /** Number of times the character was struck (1 = normal, >1 = bold). */
  strikeCount: number;
  /** Whether the character has been underlined. */
  underline: boolean;
  /** Additional characters typed over this position (different from base char). */
  overstrikes: string[];
}

export interface PdfExportOptions {
  /** Typewriter model key (e.g. 'remington', 'royal'). When set, the
   *  matching embedded font is used in the PDF. Falls back to Courier
   *  if the font cannot be loaded. */
  modelKey?: string;
  /** Fallback ribbon key used when charRibbons is not provided or a
   *  character has no entry. Falls back to black when omitted. */
  ribbon?: string;
  /** Per-character ribbon keys indexed by source-text position.
   *  When provided, each glyph is rendered in the colour of the ribbon
   *  that was active when it was typed, enabling multi-colour export. */
  charRibbons?: string[];
  /** Per-character emphasis data indexed by source-text position.
   *  When provided, overstrikes render as bold and underlines are drawn. */
  charEmphasis?: CharEmphasisEntry[];
}

/**
 * Export a DocumentModel to PDF, optionally embedding a typewriter-style font.
 *
 * The function is async because embedded font data may need to be
 * lazy-loaded on first use.
 */
export async function exportDocumentToPdf(
  doc: DocumentModel,
  options: PdfExportOptions = {},
): Promise<void> {
  const { spec, metrics } = doc;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'px',
    format: [spec.paper.width, spec.paper.height],
  });

  // Resolve font: try embedded font for model, fall back to Courier
  const fontDef = await resolvePdfFont(pdf, options.modelKey);
  const calibration = calibratePdfFont(pdf, spec, fontDef);

  // Apply ribbon ink colour — per-character when charRibbons is available,
  // otherwise uniform using the fallback ribbon key.
  const fallbackColor = ribbonToPdfColor(options.ribbon);
  pdf.setTextColor(fallbackColor.r, fallbackColor.g, fallbackColor.b);

  const { charRibbons, charEmphasis } = options;

  doc.pages.forEach((page, pageIndex) => {
    if (pageIndex > 0) {
      pdf.addPage([spec.paper.width, spec.paper.height], 'portrait');
      pdf.setFont(calibration.fontFamily, calibration.fontStyle);
      pdf.setFontSize(calibration.fontSize);
      pdf.setTextColor(fallbackColor.r, fallbackColor.g, fallbackColor.b);
    }

    page.lines.forEach((line, lineIndex) => {
      const x = spec.marginLeft;
      const y = spec.marginTop + lineIndex * metrics.lineHeight;
      drawLine(pdf, line, x, y, calibration.charCellWidth, calibration.fontSize, charRibbons, charEmphasis, fallbackColor);
    });
  });

  pdf.save(`typewriter-document-${Date.now()}.pdf`);
}
