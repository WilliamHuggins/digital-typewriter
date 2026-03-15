import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Token } from './documentModel';
import { computeCalibratedFontSize, tokensToGlyphCells, calibratePdfFont, type PdfFontCalibration } from './pdfExport';
import { COURIER_FONT, type PdfFontDef } from './pdfFonts';

// ---------------------------------------------------------------------------
// computeCalibratedFontSize – pure scaling logic
// ---------------------------------------------------------------------------

describe('computeCalibratedFontSize', () => {
  it('scales font size to match target character width', () => {
    const fontSize = computeCalibratedFontSize(15, 9, 10.8);
    assert.equal(fontSize, 18);
  });

  it('clamps extreme values to keep sizing practical', () => {
    assert.equal(computeCalibratedFontSize(15, 1, 20), 24);
    assert.equal(computeCalibratedFontSize(15, 20, 2), 10);
  });

  it('returns baseFontSize when measuredCharWidth is zero', () => {
    assert.equal(computeCalibratedFontSize(15, 0, 9.6), 15);
  });

  it('returns baseFontSize when targetCharWidth is zero', () => {
    assert.equal(computeCalibratedFontSize(15, 9, 0), 15);
  });
});

// ---------------------------------------------------------------------------
// tokensToGlyphCells
// ---------------------------------------------------------------------------

describe('tokensToGlyphCells', () => {
  it('maps characters onto fixed-width columns while skipping newline tokens', () => {
    const tokens: Token[] = [
      { type: 'word', text: 'AB', index: 0 },
      { type: 'space', index: 2 },
      { type: 'word', text: 'C', index: 3 },
      { type: 'newline', index: 4 },
    ];

    assert.deepEqual(tokensToGlyphCells(tokens), [
      { char: 'A', column: 0 },
      { char: 'B', column: 1 },
      { char: 'C', column: 3 },
    ]);
  });

  it('returns empty array for empty tokens', () => {
    assert.deepEqual(tokensToGlyphCells([]), []);
  });

  it('handles multiple spaces between words', () => {
    const tokens: Token[] = [
      { type: 'word', text: 'X', index: 0 },
      { type: 'space', index: 1 },
      { type: 'space', index: 2 },
      { type: 'word', text: 'Y', index: 3 },
    ];

    assert.deepEqual(tokensToGlyphCells(tokens), [
      { char: 'X', column: 0 },
      { char: 'Y', column: 3 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// calibratePdfFont – calibration with different font definitions
// ---------------------------------------------------------------------------

describe('calibratePdfFont', () => {
  function makeMockPdf(charWidthAtBase: number) {
    let currentFontSize = 15;
    const fontHistory: { family: string; style: string }[] = [];

    return {
      fontHistory,
      setFont(family: string, style: string) {
        fontHistory.push({ family, style });
      },
      setFontSize(size: number) {
        currentFontSize = size;
      },
      getTextWidth(text: string): number {
        // Simulate: width scales linearly with font size
        const scale = currentFontSize / 15;
        return text.length * charWidthAtBase * scale;
      },
    };
  }

  it('calibrates using the supplied font definition family', () => {
    const mock = makeMockPdf(9.0);
    const spec = { charWidth: 9.6 } as any;
    const customFont: PdfFontDef = {
      family: 'SpecialElite',
      style: 'normal',
      vfsFilename: 'SpecialElite-Regular.ttf',
      loadBase64: async () => '',
    };

    const cal = calibratePdfFont(mock as any, spec, customFont);
    assert.equal(cal.fontFamily, 'SpecialElite');
    assert.equal(cal.fontStyle, 'normal');
    // Font was set to SpecialElite
    assert.equal(mock.fontHistory[0].family, 'SpecialElite');
  });

  it('calibrates with Courier fallback font', () => {
    const mock = makeMockPdf(9.0);
    const spec = { charWidth: 9.6 } as any;

    const cal = calibratePdfFont(mock as any, spec, COURIER_FONT);
    assert.equal(cal.fontFamily, 'courier');
    assert.equal(cal.fontStyle, 'normal');
    assert.equal(mock.fontHistory[0].family, 'courier');
  });

  it('produces valid calibration values for different char widths', () => {
    // Font with wider glyphs needs smaller font size
    const widerMock = makeMockPdf(12.0);
    const spec = { charWidth: 9.6 } as any;
    const font: PdfFontDef = {
      family: 'WideFont',
      style: 'normal',
      vfsFilename: 'wide.ttf',
      loadBase64: async () => '',
    };

    const cal = calibratePdfFont(widerMock as any, spec, font);
    assert.ok(cal.fontSize < 15, `expected scaled-down font size, got ${cal.fontSize}`);
    assert.equal(cal.charCellWidth, 9.6);
  });

  it('produces valid calibration values for narrower fonts', () => {
    // Font with narrower glyphs needs larger font size
    const narrowMock = makeMockPdf(6.0);
    const spec = { charWidth: 9.6 } as any;
    const font: PdfFontDef = {
      family: 'NarrowFont',
      style: 'normal',
      vfsFilename: 'narrow.ttf',
      loadBase64: async () => '',
    };

    const cal = calibratePdfFont(narrowMock as any, spec, font);
    assert.ok(cal.fontSize > 15, `expected scaled-up font size, got ${cal.fontSize}`);
    assert.equal(cal.charCellWidth, 9.6);
  });
});
