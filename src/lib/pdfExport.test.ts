import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Token } from './documentModel';
import { computeCalibratedFontSize, tokensToGlyphCells } from './pdfExport';

describe('computeCalibratedFontSize', () => {
  it('scales font size to match target character width', () => {
    const fontSize = computeCalibratedFontSize(15, 9, 10.8);
    assert.equal(fontSize, 18);
  });

  it('clamps extreme values to keep sizing practical', () => {
    assert.equal(computeCalibratedFontSize(15, 1, 20), 24);
    assert.equal(computeCalibratedFontSize(15, 20, 2), 10);
  });
});

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
});
