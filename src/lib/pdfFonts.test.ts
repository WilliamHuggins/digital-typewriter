import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getFontDefForModel,
  COURIER_FONT,
  registerEmbeddedFont,
  resolvePdfFont,
  type PdfFontDef,
} from './pdfFonts';

// ---------------------------------------------------------------------------
// getFontDefForModel – font selection / mapping
// ---------------------------------------------------------------------------

describe('getFontDefForModel', () => {
  it('returns a font definition for each known model key', () => {
    const models = ['remington', 'underwood', 'royal', 'olivetti', 'ibm'];
    for (const key of models) {
      const def = getFontDefForModel(key);
      assert.ok(def, `expected font def for model "${key}"`);
      assert.ok(def!.family.length > 0, 'family should be non-empty');
      assert.ok(def!.vfsFilename.endsWith('.ttf'), 'vfsFilename should be a .ttf');
    }
  });

  it('maps each model to its expected font family', () => {
    assert.equal(getFontDefForModel('remington')!.family, 'SpecialElite');
    assert.equal(getFontDefForModel('underwood')!.family, 'CutiveMono');
    assert.equal(getFontDefForModel('royal')!.family, 'CourierPrime');
    assert.equal(getFontDefForModel('olivetti')!.family, 'SpaceMono');
    assert.equal(getFontDefForModel('ibm')!.family, 'Cousine');
  });

  it('returns undefined for unknown model key', () => {
    assert.equal(getFontDefForModel('unknown'), undefined);
  });

  it('returns undefined when model key is undefined', () => {
    assert.equal(getFontDefForModel(undefined), undefined);
  });

  it('returns undefined for empty string', () => {
    assert.equal(getFontDefForModel(''), undefined);
  });
});

// ---------------------------------------------------------------------------
// COURIER_FONT – fallback constant
// ---------------------------------------------------------------------------

describe('COURIER_FONT', () => {
  it('uses "courier" family', () => {
    assert.equal(COURIER_FONT.family, 'courier');
  });

  it('has empty vfsFilename (built-in, no embedding needed)', () => {
    assert.equal(COURIER_FONT.vfsFilename, '');
  });

  it('loadBase64 returns empty string', async () => {
    const data = await COURIER_FONT.loadBase64();
    assert.equal(data, '');
  });
});

// ---------------------------------------------------------------------------
// registerEmbeddedFont – font registration with mock jsPDF
// ---------------------------------------------------------------------------

describe('registerEmbeddedFont', () => {
  function makeMockPdf(shouldThrow = false) {
    const calls: { method: string; args: unknown[] }[] = [];
    return {
      calls,
      addFileToVFS(...args: unknown[]) {
        if (shouldThrow) throw new Error('VFS failure');
        calls.push({ method: 'addFileToVFS', args });
      },
      addFont(...args: unknown[]) {
        if (shouldThrow) throw new Error('addFont failure');
        calls.push({ method: 'addFont', args });
      },
    };
  }

  it('registers font and returns the definition on success', async () => {
    const mock = makeMockPdf();
    const fontDef: PdfFontDef = {
      family: 'TestFont',
      style: 'normal',
      vfsFilename: 'TestFont.ttf',
      loadBase64: async () => 'A'.repeat(200), // valid-length base64
    };

    const result = await registerEmbeddedFont(mock as any, fontDef);
    assert.ok(result);
    assert.equal(result!.family, 'TestFont');
    assert.equal(mock.calls.length, 2);
    assert.equal(mock.calls[0].method, 'addFileToVFS');
    assert.equal(mock.calls[1].method, 'addFont');
  });

  it('returns undefined when base64 data is too short', async () => {
    const mock = makeMockPdf();
    const fontDef: PdfFontDef = {
      family: 'TestFont',
      style: 'normal',
      vfsFilename: 'TestFont.ttf',
      loadBase64: async () => 'short',
    };

    const result = await registerEmbeddedFont(mock as any, fontDef);
    assert.equal(result, undefined);
    assert.equal(mock.calls.length, 0); // should not attempt registration
  });

  it('returns undefined when base64 data is empty', async () => {
    const mock = makeMockPdf();
    const fontDef: PdfFontDef = {
      family: 'TestFont',
      style: 'normal',
      vfsFilename: 'TestFont.ttf',
      loadBase64: async () => '',
    };

    const result = await registerEmbeddedFont(mock as any, fontDef);
    assert.equal(result, undefined);
  });

  it('returns undefined when loadBase64 throws', async () => {
    const mock = makeMockPdf();
    const fontDef: PdfFontDef = {
      family: 'TestFont',
      style: 'normal',
      vfsFilename: 'TestFont.ttf',
      loadBase64: async () => { throw new Error('network error'); },
    };

    const result = await registerEmbeddedFont(mock as any, fontDef);
    assert.equal(result, undefined);
  });

  it('returns undefined when jsPDF addFileToVFS throws', async () => {
    const mock = makeMockPdf(true); // throws on VFS methods
    const fontDef: PdfFontDef = {
      family: 'TestFont',
      style: 'normal',
      vfsFilename: 'TestFont.ttf',
      loadBase64: async () => 'A'.repeat(200),
    };

    const result = await registerEmbeddedFont(mock as any, fontDef);
    assert.equal(result, undefined);
  });
});

// ---------------------------------------------------------------------------
// resolvePdfFont – full resolution with fallback
// ---------------------------------------------------------------------------

describe('resolvePdfFont', () => {
  function makeMockPdf() {
    const calls: { method: string; args: unknown[] }[] = [];
    return {
      calls,
      addFileToVFS(...args: unknown[]) {
        calls.push({ method: 'addFileToVFS', args });
      },
      addFont(...args: unknown[]) {
        calls.push({ method: 'addFont', args });
      },
    };
  }

  it('falls back to Courier when no model key is provided', async () => {
    const mock = makeMockPdf();
    const result = await resolvePdfFont(mock as any);
    assert.equal(result.family, 'courier');
    assert.equal(mock.calls.length, 0); // no font registration attempted
  });

  it('falls back to Courier for unknown model key', async () => {
    const mock = makeMockPdf();
    const result = await resolvePdfFont(mock as any, 'unknown-model');
    assert.equal(result.family, 'courier');
  });

  it('falls back to Courier when model key is empty string', async () => {
    const mock = makeMockPdf();
    const result = await resolvePdfFont(mock as any, '');
    assert.equal(result.family, 'courier');
  });
});
