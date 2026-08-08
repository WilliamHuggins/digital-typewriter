import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ELITE,
  MODELS,
  MODEL_KEYS,
  PICA,
  charWidthFor,
  describeSubstitution,
  isModelKey,
  isRibbonKey,
  resolveKeystroke,
  typeMetricsFor,
} from './machines';

describe('type metrics', () => {
  it('derives cell width from the machine’s pitch', () => {
    // 96 CSS px to the inch: pica puts 10 characters in it, elite 12.
    assert.equal(charWidthFor('underwood'), 9.6);
    assert.equal(charWidthFor('olivetti'), 8);
  });

  it('gives the pre-war machines pica and the post-war ones elite', () => {
    assert.equal(MODELS.remington.pitch, PICA);
    assert.equal(MODELS.underwood.pitch, PICA);
    assert.equal(MODELS.royal.pitch, PICA);
    assert.equal(MODELS.olivetti.pitch, ELITE);
    assert.equal(MODELS.ibm.pitch, ELITE);
  });

  it('produces a materially different line length between pitches', () => {
    // A US Letter page at the normal margins: 816 - 104 - 104 = 608px.
    const printingWidth = 608;
    const pica = Math.floor(printingWidth / charWidthFor('royal'));
    const elite = Math.floor(printingWidth / charWidthFor('ibm'));
    assert.equal(pica, 63);
    assert.equal(elite, 76);
  });

  it('reports metrics for every machine', () => {
    for (const key of MODEL_KEYS) {
      const metrics = typeMetricsFor(key);
      assert.ok(metrics.charWidth > 0, `${key} has a cell width`);
      assert.ok(metrics.fontSize > 0, `${key} has a type size`);
      assert.ok(metrics.baseLineHeight > metrics.fontSize, `${key} leads its type`);
    }
  });
});

describe('period-correct keyboards', () => {
  it('strikes a lowercase L for the figure 1 on an Underwood', () => {
    const struck = resolveKeystroke('underwood', '1');
    assert.equal(struck.char, 'l');
    assert.equal(struck.substitutedFor, '1');
  });

  it('leaves the figure 1 alone on machines that have the key', () => {
    for (const key of ['remington', 'royal', 'olivetti', 'ibm'] as const) {
      assert.equal(resolveKeystroke(key, '1').char, '1');
      assert.equal(resolveKeystroke(key, '1').substitutedFor, undefined);
    }
  });

  it('builds an exclamation mark from an apostrophe and a full stop', () => {
    const struck = resolveKeystroke('royal', '!');
    assert.equal(struck.char, "'");
    assert.equal(struck.overstrike, '.');
    assert.equal(struck.substitutedFor, '!');
  });

  it('gives the post-war machines a real exclamation key', () => {
    for (const key of ['olivetti', 'ibm'] as const) {
      const struck = resolveKeystroke(key, '!');
      assert.equal(struck.char, '!');
      assert.equal(struck.overstrike, undefined);
    }
  });

  it('passes ordinary letters straight through on every machine', () => {
    for (const key of MODEL_KEYS) {
      for (const char of ['a', 'Z', ' ', ',', '9']) {
        const struck = resolveKeystroke(key, char);
        assert.equal(struck.char, char);
        assert.equal(struck.substitutedFor, undefined);
      }
    }
  });

  it('explains a substitution once it happens', () => {
    assert.match(describeSubstitution('underwood', '1') ?? '', /no 1 key/);
    assert.match(describeSubstitution('royal', '!') ?? '', /' over \./);
    assert.equal(describeSubstitution('ibm', '!'), null);
    assert.equal(describeSubstitution('underwood', 'a'), null);
  });
});

describe('key guards', () => {
  it('accepts the real keys and rejects anything else', () => {
    assert.equal(isModelKey('royal'), true);
    assert.equal(isModelKey('olympia'), false);
    assert.equal(isModelKey(null), false);
    assert.equal(isRibbonKey('stencil'), true);
    assert.equal(isRibbonKey('purple'), false);
    assert.equal(isRibbonKey(7), false);
  });
});
