import { jsPDF } from 'jspdf';
import type { DocLine, DocumentModel, PageSpec, Token } from './documentModel';

const PDF_FONT_BASE_SIZE = 15;
const PDF_FONT_FAMILY = 'courier';
const CALIBRATION_PROBE_TEXT = 'MMMMMMMMMM';
const MIN_PDF_FONT_SIZE = 10;
const MAX_PDF_FONT_SIZE = 24;

interface GlyphCell {
  char: string;
  column: number;
}

interface PdfFontCalibration {
  fontSize: number;
  charCellWidth: number;
  measuredCharWidth: number;
  widthScale: number;
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

function calibratePdfFont(pdf: jsPDF, spec: PageSpec): PdfFontCalibration {
  pdf.setFont(PDF_FONT_FAMILY, 'normal');
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

function drawLine(pdf: jsPDF, line: DocLine, x: number, y: number, charCellWidth: number) {
  const glyphs = tokensToGlyphCells(line.tokens);
  if (glyphs.length === 0) return;

  glyphs.forEach(({ char, column }) => {
    pdf.text(char, x + column * charCellWidth, y, { baseline: 'top' });
  });
}

export function exportDocumentToPdf(doc: DocumentModel): void {
  const { spec, metrics } = doc;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'px',
    format: [spec.paper.width, spec.paper.height],
  });

  const calibration = calibratePdfFont(pdf, spec);

  doc.pages.forEach((page, pageIndex) => {
    if (pageIndex > 0) {
      pdf.addPage([spec.paper.width, spec.paper.height], 'portrait');
      pdf.setFont(PDF_FONT_FAMILY, 'normal');
      pdf.setFontSize(calibration.fontSize);
    }

    page.lines.forEach((line, lineIndex) => {
      const x = spec.marginLeft;
      const y = spec.marginTop + lineIndex * metrics.lineHeight;
      drawLine(pdf, line, x, y, calibration.charCellWidth);
    });
  });

  pdf.save(`typewriter-document-${Date.now()}.pdf`);
}
