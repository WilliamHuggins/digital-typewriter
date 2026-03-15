import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Token } from './documentModel';
import { computeCalibratedFontSize, tokensToGlyphCells, calibratePdfFont, ribbonToPdfColor, wearAdjustedPdfColor, calculatePdfGlyphJitter, MAX_PDF_JITTER_X, MAX_PDF_JITTER_Y, calculatePdfLineWobble, MAX_PDF_LINE_WOBBLE_Y, type PdfFontCalibration, type PdfRgbColor } from './pdfExport';
import { COURIER_FONT, type PdfFontDef } from './pdfFonts';
import { createRibbonWearState, calculateRibbonInkStyle, type RibbonWearState } from './ribbonWear';

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

// ---------------------------------------------------------------------------
// ribbonToPdfColor – ribbon key → RGB mapping
// ---------------------------------------------------------------------------

describe('ribbonToPdfColor', () => {
  it('returns correct color for black ribbon', () => {
    const color = ribbonToPdfColor('black');
    assert.deepEqual(color, { r: 0x11, g: 0x18, b: 0x27 });
  });

  it('returns correct color for red ribbon', () => {
    const color = ribbonToPdfColor('red');
    assert.deepEqual(color, { r: 0x99, g: 0x1b, b: 0x1b });
  });

  it('returns correct color for blue ribbon', () => {
    const color = ribbonToPdfColor('blue');
    assert.deepEqual(color, { r: 0x1e, g: 0x40, b: 0xaf });
  });

  it('returns stencil color for stencil ribbon', () => {
    const color = ribbonToPdfColor('stencil');
    assert.deepEqual(color, { r: 0xc8, g: 0xc0, b: 0xb0 });
  });

  it('falls back to black for undefined ribbon', () => {
    const color = ribbonToPdfColor(undefined);
    assert.deepEqual(color, { r: 0x11, g: 0x18, b: 0x27 });
  });

  it('falls back to black for unknown ribbon key', () => {
    const color = ribbonToPdfColor('purple');
    assert.deepEqual(color, { r: 0x11, g: 0x18, b: 0x27 });
  });

  it('falls back to black for empty string', () => {
    const color = ribbonToPdfColor('');
    assert.deepEqual(color, { r: 0x11, g: 0x18, b: 0x27 });
  });
});

// ---------------------------------------------------------------------------
// PDF export with ribbon color – integration-level mock test
// ---------------------------------------------------------------------------

describe('PDF export applies ribbon color', () => {
  function makeMockPdfWithColorTracking() {
    let currentFontSize = 15;
    const textColors: Array<{ r: number; g: number; b: number }> = [];

    return {
      textColors,
      setFont(_family: string, _style: string) {},
      setFontSize(size: number) { currentFontSize = size; },
      getTextWidth(text: string): number {
        const scale = currentFontSize / 15;
        return text.length * 9.0 * scale;
      },
      setTextColor(r: number, g: number, b: number) {
        textColors.push({ r, g, b });
      },
      text(_text: string, _x: number, _y: number, _opts?: any) {},
      addPage(_format: any, _orientation: string) {},
      save(_filename: string) {},
    };
  }

  it('sets text color to red when ribbon is red', () => {
    const mock = makeMockPdfWithColorTracking();
    const color = ribbonToPdfColor('red');
    mock.setTextColor(color.r, color.g, color.b);
    assert.equal(mock.textColors.length, 1);
    assert.deepEqual(mock.textColors[0], { r: 0x99, g: 0x1b, b: 0x1b });
  });

  it('sets text color to blue when ribbon is blue', () => {
    const mock = makeMockPdfWithColorTracking();
    const color = ribbonToPdfColor('blue');
    mock.setTextColor(color.r, color.g, color.b);
    assert.deepEqual(mock.textColors[0], { r: 0x1e, g: 0x40, b: 0xaf });
  });

  it('defaults to black for missing ribbon option', () => {
    const mock = makeMockPdfWithColorTracking();
    const color = ribbonToPdfColor(undefined);
    mock.setTextColor(color.r, color.g, color.b);
    assert.deepEqual(mock.textColors[0], { r: 0x11, g: 0x18, b: 0x27 });
  });
});

// ---------------------------------------------------------------------------
// wearAdjustedPdfColor – deterministic wear-driven PDF color variation
// ---------------------------------------------------------------------------

describe('wearAdjustedPdfColor', () => {
  it('returns the base color when ink style is fully opaque with neutral contrast/brightness', () => {
    const base: PdfRgbColor = { r: 0x11, g: 0x18, b: 0x27 };
    const result = wearAdjustedPdfColor(base, { opacity: 1, contrast: 1, brightness: 1 });
    assert.deepEqual(result, base);
  });

  it('blends toward paper color when opacity is reduced', () => {
    const base: PdfRgbColor = { r: 0x11, g: 0x18, b: 0x27 };
    const result = wearAdjustedPdfColor(base, { opacity: 0.7, contrast: 1, brightness: 1 });
    // Should shift toward paper color (0xf4, 0xf1, 0xea)
    assert.ok(result.r > base.r, `r should increase toward paper: ${result.r}`);
    assert.ok(result.g > base.g, `g should increase toward paper: ${result.g}`);
    assert.ok(result.b > base.b, `b should increase toward paper: ${result.b}`);
  });

  it('is deterministic (same inputs produce same output)', () => {
    const base: PdfRgbColor = { r: 0x99, g: 0x1b, b: 0x1b };
    const ink = { opacity: 0.8, contrast: 0.95, brightness: 1.02 };
    const a = wearAdjustedPdfColor(base, ink);
    const b = wearAdjustedPdfColor(base, ink);
    assert.deepEqual(a, b);
  });

  it('does not exceed paper color even with very low opacity', () => {
    const base: PdfRgbColor = { r: 0x11, g: 0x18, b: 0x27 };
    const result = wearAdjustedPdfColor(base, { opacity: 0.3, contrast: 0.8, brightness: 1.1 });
    // fadeFactor is clamped to 0.45, so result stays between base and paper
    assert.ok(result.r <= 0xf4, `r should not exceed paper color`);
    assert.ok(result.g <= 0xf1, `g should not exceed paper color`);
    assert.ok(result.b <= 0xea, `b should not exceed paper color`);
    assert.ok(result.r >= base.r, `r should be at least base color`);
  });

  it('produces different colors for different ribbon base colors', () => {
    const ink = { opacity: 0.75, contrast: 1, brightness: 1 };
    const black = wearAdjustedPdfColor({ r: 0x11, g: 0x18, b: 0x27 }, ink);
    const red = wearAdjustedPdfColor({ r: 0x99, g: 0x1b, b: 0x1b }, ink);
    const blue = wearAdjustedPdfColor({ r: 0x1e, g: 0x40, b: 0xaf }, ink);
    // All should be different
    assert.notDeepEqual(black, red);
    assert.notDeepEqual(black, blue);
    assert.notDeepEqual(red, blue);
  });

  it('applies subtle variation — worn color stays close to base', () => {
    const base: PdfRgbColor = { r: 0x11, g: 0x18, b: 0x27 };
    // Mild wear
    const result = wearAdjustedPdfColor(base, { opacity: 0.9, contrast: 1.02, brightness: 1.0 });
    // Should be close to base (within ~30 per channel)
    assert.ok(Math.abs(result.r - base.r) < 30, `r variation should be subtle: delta=${Math.abs(result.r - base.r)}`);
    assert.ok(Math.abs(result.g - base.g) < 30, `g variation should be subtle: delta=${Math.abs(result.g - base.g)}`);
    assert.ok(Math.abs(result.b - base.b) < 30, `b variation should be subtle: delta=${Math.abs(result.b - base.b)}`);
  });
});

// ---------------------------------------------------------------------------
// Integration: ribbon wear model produces per-glyph color variation for PDF
// ---------------------------------------------------------------------------

describe('ribbon wear produces per-glyph PDF color variation', () => {
  function getWornColor(ribbon: 'black' | 'red' | 'blue', char: string, charIndex: number, lineIndex: number, impressionCount: number) {
    const state: RibbonWearState = {
      ...createRibbonWearState(ribbon),
      impressionCount,
      lineImpressions: Array(lineIndex + 1).fill(Math.floor(impressionCount / (lineIndex + 1))),
    };
    const base = ribbonToPdfColor(ribbon);
    const ink = calculateRibbonInkStyle({ state, ribbon, char, charIndex, lineIndex });
    return wearAdjustedPdfColor(base, ink);
  }

  it('produces variation between different characters on the same line', () => {
    const colorA = getWornColor('black', 'a', 0, 0, 200);
    const colorE = getWornColor('black', 'e', 5, 0, 200);
    // Should differ (worn key signatures differ for 'a' vs 'e')
    const differs = colorA.r !== colorE.r || colorA.g !== colorE.g || colorA.b !== colorE.b;
    assert.ok(differs, 'different characters should produce different wear colors');
  });

  it('produces variation between different lines', () => {
    const line0 = getWornColor('black', 'a', 0, 0, 300);
    const line5 = getWornColor('black', 'a', 0, 5, 300);
    const differs = line0.r !== line5.r || line0.g !== line5.g || line0.b !== line5.b;
    assert.ok(differs, 'same character on different lines should produce different wear colors');
  });

  it('increases fade with higher impression count', () => {
    const fresh = getWornColor('black', 'h', 3, 0, 0);
    const worn = getWornColor('black', 'h', 3, 0, 500);
    // Worn ribbon should shift further from base (higher RGB toward paper)
    const freshBase = ribbonToPdfColor('black');
    const freshDist = Math.abs(fresh.r - freshBase.r) + Math.abs(fresh.g - freshBase.g) + Math.abs(fresh.b - freshBase.b);
    const wornDist = Math.abs(worn.r - freshBase.r) + Math.abs(worn.g - freshBase.g) + Math.abs(worn.b - freshBase.b);
    assert.ok(wornDist >= freshDist, `worn ribbon should fade more: freshDist=${freshDist}, wornDist=${wornDist}`);
  });

  it('works correctly for all ribbon colors', () => {
    for (const ribbon of ['black', 'red', 'blue'] as const) {
      const color = getWornColor(ribbon, 't', 2, 1, 100);
      const base = ribbonToPdfColor(ribbon);
      // Color should be valid RGB
      assert.ok(color.r >= 0 && color.r <= 255, `${ribbon} r in range`);
      assert.ok(color.g >= 0 && color.g <= 255, `${ribbon} g in range`);
      assert.ok(color.b >= 0 && color.b <= 255, `${ribbon} b in range`);
      // Should be between base and paper
      assert.ok(color.r >= Math.min(base.r, 0xf4) && color.r <= Math.max(base.r, 0xf4), `${ribbon} r between base and paper`);
    }
  });

  it('falls back gracefully with zero-impression wear state', () => {
    const state = createRibbonWearState('black');
    const base = ribbonToPdfColor('black');
    const ink = calculateRibbonInkStyle({ state, ribbon: 'black', char: 'x', charIndex: 0, lineIndex: 0 });
    const result = wearAdjustedPdfColor(base, ink);
    // Should still produce a valid color close to the base
    assert.ok(result.r >= 0 && result.r <= 255);
    assert.ok(Math.abs(result.r - base.r) < 40, 'fresh ribbon should be close to base');
  });
});

// ---------------------------------------------------------------------------
// calculatePdfGlyphJitter – deterministic per-character spatial offsets
// ---------------------------------------------------------------------------

describe('calculatePdfGlyphJitter', () => {
  it('is deterministic — same inputs produce same output', () => {
    const a = calculatePdfGlyphJitter(42, 1);
    const b = calculatePdfGlyphJitter(42, 1);
    assert.equal(a.dx, b.dx);
    assert.equal(a.dy, b.dy);
  });

  it('produces different offsets for different character indices', () => {
    const a = calculatePdfGlyphJitter(0, 1);
    const b = calculatePdfGlyphJitter(1, 1);
    const differs = a.dx !== b.dx || a.dy !== b.dy;
    assert.ok(differs, 'adjacent characters should have different jitter');
  });

  it('stays within ±MAX_PDF_JITTER_X/Y bounds at full wear', () => {
    // Test a large range of indices to confirm no outliers
    for (let i = 0; i < 500; i++) {
      const j = calculatePdfGlyphJitter(i, 1);
      assert.ok(Math.abs(j.dx) <= MAX_PDF_JITTER_X,
        `dx out of bounds at index ${i}: ${j.dx}`);
      assert.ok(Math.abs(j.dy) <= MAX_PDF_JITTER_Y,
        `dy out of bounds at index ${i}: ${j.dy}`);
    }
  });

  it('returns zero jitter when wearLevel is 0', () => {
    const j = calculatePdfGlyphJitter(42, 0);
    assert.equal(j.dx, 0);
    assert.equal(j.dy, 0);
  });

  it('scales jitter proportionally with wearLevel', () => {
    const full = calculatePdfGlyphJitter(10, 1);
    const half = calculatePdfGlyphJitter(10, 0.5);
    // At half wear, magnitude should be roughly half (same sign, smaller)
    if (full.dx !== 0) {
      assert.ok(Math.abs(half.dx) < Math.abs(full.dx) + 0.001,
        `half-wear dx should not exceed full-wear dx`);
    }
    if (full.dy !== 0) {
      assert.ok(Math.abs(half.dy) < Math.abs(full.dy) + 0.001,
        `half-wear dy should not exceed full-wear dy`);
    }
  });

  it('does not produce drift that exceeds one character cell width', () => {
    const charCellWidth = 9.6; // default spec
    for (let i = 0; i < 500; i++) {
      const j = calculatePdfGlyphJitter(i, 1);
      assert.ok(Math.abs(j.dx) < charCellWidth * 0.1,
        `dx should be <10% of cell width at index ${i}: ${j.dx}`);
    }
  });

  it('produces non-zero jitter for most characters at full wear', () => {
    let nonZeroCount = 0;
    for (let i = 0; i < 100; i++) {
      const j = calculatePdfGlyphJitter(i, 1);
      if (j.dx !== 0 || j.dy !== 0) nonZeroCount++;
    }
    assert.ok(nonZeroCount > 90,
      `expected most characters to have jitter, got ${nonZeroCount}/100`);
  });

  it('clamps negative wearLevel to zero jitter', () => {
    const j = calculatePdfGlyphJitter(42, -0.5);
    assert.equal(j.dx, 0);
    assert.equal(j.dy, 0);
  });
});

// ---------------------------------------------------------------------------
// calculatePdfLineWobble – deterministic per-line vertical offsets
// ---------------------------------------------------------------------------

describe('calculatePdfLineWobble', () => {
  it('is deterministic — same inputs produce same output', () => {
    const a = calculatePdfLineWobble(0, 5, 1);
    const b = calculatePdfLineWobble(0, 5, 1);
    assert.equal(a.dy, b.dy);
  });

  it('produces different offsets for different lines on the same page', () => {
    const a = calculatePdfLineWobble(0, 0, 1);
    const b = calculatePdfLineWobble(0, 1, 1);
    assert.notEqual(a.dy, b.dy, 'adjacent lines should have different wobble');
  });

  it('produces different offsets for the same line on different pages', () => {
    const a = calculatePdfLineWobble(0, 3, 1);
    const b = calculatePdfLineWobble(1, 3, 1);
    assert.notEqual(a.dy, b.dy, 'same line on different pages should differ');
  });

  it('stays within ±MAX_PDF_LINE_WOBBLE_Y bounds at full wear', () => {
    for (let page = 0; page < 5; page++) {
      for (let line = 0; line < 50; line++) {
        const w = calculatePdfLineWobble(page, line, 1);
        assert.ok(Math.abs(w.dy) <= MAX_PDF_LINE_WOBBLE_Y,
          `dy out of bounds at page ${page}, line ${line}: ${w.dy}`);
      }
    }
  });

  it('returns zero wobble when wearLevel is 0', () => {
    const w = calculatePdfLineWobble(0, 5, 0);
    assert.equal(w.dy, 0);
  });

  it('returns zero wobble when wearLevel is negative', () => {
    const w = calculatePdfLineWobble(0, 5, -0.3);
    assert.equal(w.dy, 0);
  });

  it('scales wobble with wearLevel', () => {
    const full = calculatePdfLineWobble(2, 10, 1);
    const half = calculatePdfLineWobble(2, 10, 0.5);
    if (full.dy !== 0) {
      assert.ok(Math.abs(half.dy) <= Math.abs(full.dy) + 0.001,
        `half-wear wobble should not exceed full-wear wobble`);
    }
  });

  it('does not cause excessive drift that would break line spacing', () => {
    const lineHeight = 24; // default spec
    // Maximum wobble should be a tiny fraction of line height
    assert.ok(MAX_PDF_LINE_WOBBLE_Y < lineHeight * 0.03,
      `max wobble (${MAX_PDF_LINE_WOBBLE_Y}px) should be <3% of line height (${lineHeight}px)`);

    // Verify that adjacent line wobbles cannot cause overlap
    for (let page = 0; page < 3; page++) {
      for (let line = 0; line < 49; line++) {
        const a = calculatePdfLineWobble(page, line, 1);
        const b = calculatePdfLineWobble(page, line + 1, 1);
        // Worst case: one line shifts down max, next shifts up max
        // Even then, gap = lineHeight - 2 * MAX_PDF_LINE_WOBBLE_Y
        const worstCaseGap = lineHeight - Math.abs(a.dy) - Math.abs(b.dy);
        assert.ok(worstCaseGap > lineHeight * 0.95,
          `adjacent lines should maintain >95% of line height gap at page ${page}, line ${line}`);
      }
    }
  });

  it('produces non-zero wobble for most lines at full wear', () => {
    let nonZeroCount = 0;
    for (let i = 0; i < 100; i++) {
      const w = calculatePdfLineWobble(0, i, 1);
      if (w.dy !== 0) nonZeroCount++;
    }
    assert.ok(nonZeroCount > 90,
      `expected most lines to have wobble, got ${nonZeroCount}/100`);
  });
});
