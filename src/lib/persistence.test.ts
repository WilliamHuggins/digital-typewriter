import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TITLE,
  STORAGE_KEY,
  clearSheet,
  loadSheet,
  parseSheet,
  saveSheet,
  encodeFormats,
  encodeEmphasis,
  type PersistedSheet,
} from './persistence';

/** Minimal in-memory Storage stand-in for tests. */
function fakeStorage(initial: Record<string, string> = {}): Storage & { failWith?: Error } {
  const map = new Map(Object.entries(initial));
  const store = {
    get length() { return map.size; },
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    removeItem: (k: string) => { map.delete(k); },
    setItem(k: string, v: string) {
      if (store.failWith) throw store.failWith;
      map.set(k, v);
    },
  } as Storage & { failWith?: Error };
  return store;
}

const validSheet: Omit<PersistedSheet, 'version' | 'savedAt'> = {
  title: 'Chapter one',
  text: 'It was a dark and stormy night.',
  charFormats: [],
  charEmphasis: [],
  model: 'underwood',
  ribbon: 'red',
  lineSpacing: 1.5,
  paperSize: 'a4',
  marginPreset: 'wide',
  customMargins: { marginTop: 100, marginBottom: 100, marginLeft: 100, marginRight: 100 },
};

describe('persistence round trip', () => {
  it('saves and reloads a sheet', () => {
    const storage = fakeStorage();
    assert.deepEqual(saveSheet(validSheet, storage), { ok: true });

    const loaded = loadSheet(storage);
    assert.equal(loaded?.text, validSheet.text);
    assert.equal(loaded?.title, 'Chapter one');
    assert.equal(loaded?.model, 'underwood');
    assert.equal(loaded?.ribbon, 'red');
    assert.equal(loaded?.lineSpacing, 1.5);
    assert.ok((loaded?.savedAt ?? 0) > 0);
  });

  it('returns null when nothing is stored', () => {
    assert.equal(loadSheet(fakeStorage()), null);
  });

  it('clears the stored sheet', () => {
    const storage = fakeStorage();
    saveSheet(validSheet, storage);
    clearSheet(storage);
    assert.equal(loadSheet(storage), null);
  });

  it('reports a quota failure rather than throwing', () => {
    const storage = fakeStorage();
    storage.failWith = new DOMException('full', 'QuotaExceededError');
    assert.deepEqual(saveSheet(validSheet, storage), { ok: false, reason: 'quota' });
  });

  it('reports unavailable storage rather than throwing', () => {
    assert.deepEqual(saveSheet(validSheet, undefined), { ok: false, reason: 'unavailable' });
  });

  it('survives corrupt JSON in storage', () => {
    const storage = fakeStorage({ [STORAGE_KEY]: '{not json' });
    assert.equal(loadSheet(storage), null);
  });
});

describe('run-length encoding', () => {
  const fmt = (n: number) => Array.from({ length: n }, () => ({ model: 'royal' as const, ribbon: 'black' as const }));
  const emp = (n: number) => Array.from({ length: n }, () => ({ strikeCount: 1, underline: false }));

  it('collapses a uniform document to a single run', () => {
    assert.deepEqual(encodeFormats(fmt(5000)), [[5000, 'royal', 'black']]);
    assert.deepEqual(encodeEmphasis(emp(5000)), [[5000, 1, 0, 0, 0]]);
  });

  it('breaks a run where the ink changes', () => {
    assert.deepEqual(
      encodeFormats([
        { model: 'royal', ribbon: 'black' },
        { model: 'royal', ribbon: 'black' },
        { model: 'royal', ribbon: 'red' },
      ]),
      [[2, 'royal', 'black'], [1, 'royal', 'red']],
    );
  });

  it('breaks a run where a correction starts', () => {
    assert.deepEqual(
      encodeEmphasis([
        { strikeCount: 1, underline: false },
        { strikeCount: 1, underline: false, overstrike: 'x' },
      ]),
      [[1, 1, 0, 0, 0], [1, 1, 0, 'x', 0]],
    );
  });

  it('encodes an empty document as no runs', () => {
    assert.deepEqual(encodeFormats([]), []);
    assert.deepEqual(encodeEmphasis([]), []);
  });

  it('round-trips through save and load', () => {
    const storage = fakeStorage();
    const text = 'x'.repeat(400);
    saveSheet({ ...validSheet, text, charFormats: fmt(400), charEmphasis: emp(400) }, storage);

    const loaded = loadSheet(storage);
    assert.equal(loaded?.charFormats.length, 400);
    assert.equal(loaded?.charEmphasis.length, 400);
    assert.deepEqual(loaded?.charFormats[399], { model: 'royal', ribbon: 'black' });
  });

  it('shrinks the stored payload by orders of magnitude', () => {
    const storage = fakeStorage();
    const text = 'x'.repeat(20_000);
    saveSheet({ ...validSheet, text, charFormats: fmt(20_000), charEmphasis: emp(20_000) }, storage);

    const stored = storage.getItem(STORAGE_KEY) ?? '';
    const plain = JSON.stringify({ charFormats: fmt(20_000), charEmphasis: emp(20_000) });
    assert.ok(stored.length * 20 < plain.length, `${stored.length} vs ${plain.length} bytes`);
  });

  it('still reads sheets saved before run-length encoding', () => {
    const parsed = parseSheet({
      ...validSheet,
      version: 1,
      text: 'ab',
      charFormats: [{ model: 'ibm', ribbon: 'blue' }, { model: 'ibm', ribbon: 'blue' }],
      charEmphasis: [{ strikeCount: 2, underline: true }, { strikeCount: 1, underline: false }],
    });
    assert.deepEqual(parsed?.charFormats[0], { model: 'ibm', ribbon: 'blue' });
    assert.equal(parsed?.charEmphasis[0].strikeCount, 2);
    assert.equal(parsed?.charEmphasis[0].underline, true);
  });

  it('never expands runs past the length of the text', () => {
    const parsed = parseSheet({
      ...validSheet,
      version: 1,
      text: 'abc',
      charFormats: [[999_999_999, 'royal', 'black']],
      charEmphasis: [[999_999_999, 1, 0, 0, 0]],
    });
    assert.equal(parsed?.charFormats.length, 3);
    assert.equal(parsed?.charEmphasis.length, 3);
  });

  it('survives a malformed run', () => {
    const parsed = parseSheet({
      ...validSheet,
      version: 1,
      text: 'abc',
      charFormats: [['not a number', 'royal', 'black']],
    });
    assert.ok(parsed, 'the sheet still opens');
    assert.equal(parsed?.text, 'abc');
  });
});

describe('parseSheet rejects untrusted input', () => {
  it('rejects non-objects', () => {
    assert.equal(parseSheet(null), null);
    assert.equal(parseSheet('a string'), null);
    assert.equal(parseSheet(42), null);
  });

  it('rejects an unknown schema version', () => {
    assert.equal(parseSheet({ ...validSheet, version: 99 }), null);
  });

  it('rejects a sheet with no text', () => {
    assert.equal(parseSheet({ ...validSheet, version: 1, text: undefined }), null);
  });

  it('rejects an unknown machine or ribbon', () => {
    assert.equal(parseSheet({ ...validSheet, version: 1, model: 'olympia' }), null);
    assert.equal(parseSheet({ ...validSheet, version: 1, ribbon: 'purple' }), null);
  });
});

describe('parseSheet repairs recoverable damage', () => {
  it('falls back to a default title', () => {
    const parsed = parseSheet({ ...validSheet, version: 1, title: '   ' });
    assert.equal(parsed?.title, DEFAULT_TITLE);
  });

  it('truncates format arrays that outgrew the text', () => {
    const parsed = parseSheet({
      ...validSheet,
      version: 1,
      text: 'abc',
      charFormats: Array.from({ length: 99 }, () => ({ model: 'royal', ribbon: 'blue' })),
    });
    assert.equal(parsed?.charFormats.length, 3);
  });

  it('replaces unusable per-character entries with the sheet defaults', () => {
    const parsed = parseSheet({
      ...validSheet,
      version: 1,
      text: 'ab',
      charFormats: [{ model: 'nonsense', ribbon: 'nonsense' }, null],
    });
    assert.deepEqual(parsed?.charFormats, [
      { model: 'underwood', ribbon: 'red' },
      { model: 'underwood', ribbon: 'red' },
    ]);
  });

  it('normalises broken emphasis values', () => {
    const parsed = parseSheet({
      ...validSheet,
      version: 1,
      text: 'ab',
      charEmphasis: [{ strikeCount: -4, underline: 'yes' }, { strikeCount: Number.NaN }],
    });
    assert.deepEqual(parsed?.charEmphasis, [
      { strikeCount: 1, underline: true, overstrike: undefined, corrected: false },
      { strikeCount: 1, underline: false, overstrike: undefined, corrected: false },
    ]);
  });

  it('keeps X-outs and corrections across a reload', () => {
    const parsed = parseSheet({
      ...validSheet,
      version: 1,
      text: 'ab',
      charEmphasis: [
        { strikeCount: 1, underline: false, overstrike: 'x' },
        { strikeCount: 1, underline: false, corrected: true },
      ],
    });
    assert.equal(parsed?.charEmphasis[0].overstrike, 'x');
    assert.equal(parsed?.charEmphasis[1].corrected, true);
  });

  it('drops an overstrike that is not a single glyph', () => {
    const parsed = parseSheet({
      ...validSheet,
      version: 1,
      text: 'abc',
      charEmphasis: [
        { strikeCount: 1, overstrike: 'xxx' },
        { strikeCount: 1, overstrike: '' },
        { strikeCount: 1, overstrike: 42 },
      ],
    });
    assert.deepEqual(parsed?.charEmphasis.map((e) => e.overstrike), [undefined, undefined, undefined]);
  });

  it('supplies defaults for missing geometry', () => {
    const parsed = parseSheet({
      version: 1,
      text: 'hi',
      model: 'ibm',
      ribbon: 'black',
    });
    assert.equal(parsed?.lineSpacing, 1);
    assert.equal(parsed?.paperSize, 'letter');
    assert.equal(parsed?.marginPreset, 'normal');
    assert.equal(parsed?.customMargins.marginTop, 122);
  });
});
