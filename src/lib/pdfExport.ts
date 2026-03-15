import { jsPDF } from 'jspdf';
import type { DocLine, DocumentModel, PageSpec, Token } from './documentModel';
import { type RibbonKey, type RibbonWearState, type RibbonInkStyle, calculateRibbonInkStyle, createRibbonWearState } from './ribbonWear';
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
// Wear → PDF color mapping
// ---------------------------------------------------------------------------

/**
 * Map ribbon ink style (opacity/contrast/brightness from the ribbon wear model)
 * to a PDF-friendly RGB color adjustment.
 *
 * Strategy: the on-screen renderer uses CSS opacity + filter(contrast, brightness).
 * PDF has no per-glyph alpha or filter support, so we approximate the visual effect
 * by blending the base ink color toward the paper color (lighter = more worn).
 *
 * The blending factor combines:
 *   - opacity: primary wear signal (lower = more faded)
 *   - brightness: secondary lightening (higher = lighter ink)
 *   - contrast: tertiary sharpness (lower = softer)
 *
 * The result is a subtle per-glyph RGB shift that stays readable.
 */
const PDF_PAPER_COLOR = { r: 0xf4, g: 0xf1, b: 0xea };

export function wearAdjustedPdfColor(
  baseColor: PdfRgbColor,
  inkStyle: RibbonInkStyle,
): PdfRgbColor {
  // Combine wear signals into a single fade factor (0 = full ink, 1 = fully faded)
  // opacity is dominant; brightness > 1 lightens, contrast < 1 softens
  const opacityFade = 1 - inkStyle.opacity;
  const brightnessFade = Math.max(0, (inkStyle.brightness - 1) * 0.6);
  const contrastFade = Math.max(0, (1 - inkStyle.contrast) * 0.3);
  const fadeFactor = Math.min(0.45, opacityFade * 0.7 + brightnessFade + contrastFade);

  // Blend base ink color toward paper color
  return {
    r: Math.round(baseColor.r + (PDF_PAPER_COLOR.r - baseColor.r) * fadeFactor),
    g: Math.round(baseColor.g + (PDF_PAPER_COLOR.g - baseColor.g) * fadeFactor),
    b: Math.round(baseColor.b + (PDF_PAPER_COLOR.b - baseColor.b) * fadeFactor),
  };
}

// ---------------------------------------------------------------------------

interface GlyphCell {
  char: string;
  column: number;
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
      for (const char of token.text) {
        glyphs.push({ char, column });
        column += 1;
      }
    }
  });

  return glyphs;
}

function drawLine(
  pdf: jsPDF,
  line: DocLine,
  x: number,
  y: number,
  charCellWidth: number,
  wearContext?: { baseColor: PdfRgbColor; state: RibbonWearState; ribbon: RibbonKey; lineIndex: number },
) {
  const glyphs = tokensToGlyphCells(line.tokens);
  if (glyphs.length === 0) return;

  if (!wearContext) {
    // Uniform color fallback (no wear data)
    glyphs.forEach(({ char, column }) => {
      pdf.text(char, x + column * charCellWidth, y, { baseline: 'top' });
    });
    return;
  }

  // Per-glyph color variation via ribbon wear model
  let lastR = -1, lastG = -1, lastB = -1;
  glyphs.forEach(({ char, column }, glyphIndex) => {
    const inkStyle = calculateRibbonInkStyle({
      state: wearContext.state,
      ribbon: wearContext.ribbon,
      char,
      charIndex: glyphIndex,
      lineIndex: wearContext.lineIndex,
    });
    const adjusted = wearAdjustedPdfColor(wearContext.baseColor, inkStyle);

    // Only call setTextColor when color actually changes (performance)
    if (adjusted.r !== lastR || adjusted.g !== lastG || adjusted.b !== lastB) {
      pdf.setTextColor(adjusted.r, adjusted.g, adjusted.b);
      lastR = adjusted.r;
      lastG = adjusted.g;
      lastB = adjusted.b;
    }

    pdf.text(char, x + column * charCellWidth, y, { baseline: 'top' });
  });
}

export interface PdfExportOptions {
  /** Typewriter model key (e.g. 'remington', 'royal'). When set, the
   *  matching embedded font is used in the PDF. Falls back to Courier
   *  if the font cannot be loaded. */
  modelKey?: string;
  /** Active ribbon key. Determines text color in the PDF.
   *  Falls back to black when omitted or unrecognised. */
  ribbon?: string;
  /** Current ribbon wear state. When provided, per-glyph color variation
   *  is applied to approximate the on-screen ink wear effect. */
  wearState?: RibbonWearState;
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

  // Apply ribbon ink colour
  const inkColor = ribbonToPdfColor(options.ribbon);
  pdf.setTextColor(inkColor.r, inkColor.g, inkColor.b);

  // Resolve ribbon key for wear calculation
  const ribbonKey: RibbonKey = (options.ribbon && options.ribbon in RIBBON_PDF_COLORS)
    ? (options.ribbon as RibbonKey)
    : 'black';
  const wearState = options.wearState;

  let globalLineIndex = 0;

  doc.pages.forEach((page, pageIndex) => {
    if (pageIndex > 0) {
      pdf.addPage([spec.paper.width, spec.paper.height], 'portrait');
      pdf.setFont(calibration.fontFamily, calibration.fontStyle);
      pdf.setFontSize(calibration.fontSize);
      pdf.setTextColor(inkColor.r, inkColor.g, inkColor.b);
    }

    page.lines.forEach((line, lineIndex) => {
      const x = spec.marginLeft;
      const y = spec.marginTop + lineIndex * metrics.lineHeight;
      const wearContext = wearState
        ? { baseColor: inkColor, state: wearState, ribbon: ribbonKey, lineIndex: globalLineIndex }
        : undefined;
      drawLine(pdf, line, x, y, calibration.charCellWidth, wearContext);
      globalLineIndex++;
    });
  });

  pdf.save(`typewriter-document-${Date.now()}.pdf`);
}
