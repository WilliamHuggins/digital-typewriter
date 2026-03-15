import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeMetrics,
  layoutDocument,
  locateCursor,
  cursorColumn,
  computeScrollPosition,
  DEFAULT_PAGE_SPEC,
  PAPER_SIZES,
  TYPING_OFFSET_Y,
  PAGE_GAP,
  type PageSpec,
} from './documentModel';

// ---------------------------------------------------------------------------
// computeMetrics
// ---------------------------------------------------------------------------

test('computeMetrics returns correct values for default spec', () => {
  const m = computeMetrics(DEFAULT_PAGE_SPEC);
  assert.equal(m.contentWidth, 816 - 104 - 104); // 608
  assert.equal(m.contentHeight, 1056 - 122 - 104); // 830
  assert.equal(m.lineHeight, 24);
  assert.equal(m.maxCharsPerLine, Math.floor(608 / 9.6)); // 63
  assert.equal(m.maxLinesPerPage, Math.floor(830 / 24)); // 34
});

test('computeMetrics adjusts for line spacing', () => {
  const spec: PageSpec = { ...DEFAULT_PAGE_SPEC, lineSpacing: 2 };
  const m = computeMetrics(spec);
  assert.equal(m.lineHeight, 48);
  assert.equal(m.maxLinesPerPage, Math.floor(830 / 48)); // 17
});

// ---------------------------------------------------------------------------
// layoutDocument – basic cases
// ---------------------------------------------------------------------------

test('empty text produces one page with one empty line', () => {
  const doc = layoutDocument('', DEFAULT_PAGE_SPEC);
  assert.equal(doc.pageCount, 1);
  assert.equal(doc.pages[0].lines.length, 1);
  assert.equal(doc.pages[0].lines[0].tokens.length, 0);
});

test('single word on one line', () => {
  const doc = layoutDocument('hello', DEFAULT_PAGE_SPEC);
  assert.equal(doc.pageCount, 1);
  assert.equal(doc.pages[0].lines.length, 1);
  const tokens = doc.pages[0].lines[0].tokens;
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].type, 'word');
  if (tokens[0].type === 'word') {
    assert.equal(tokens[0].text, 'hello');
  }
});

test('newline creates two lines', () => {
  const doc = layoutDocument('abc\ndef', DEFAULT_PAGE_SPEC);
  assert.equal(doc.pages[0].lines.length, 2);
  assert.equal(doc.pages[0].lines[0].endIndex, 4); // past the \n
  assert.equal(doc.pages[0].lines[1].startIndex, 4);
});

test('spaces are preserved as tokens', () => {
  const doc = layoutDocument('a b', DEFAULT_PAGE_SPEC);
  const tokens = doc.pages[0].lines[0].tokens;
  assert.equal(tokens.length, 3); // word, space, word
  assert.equal(tokens[0].type, 'word');
  assert.equal(tokens[1].type, 'space');
  assert.equal(tokens[2].type, 'word');
});

// ---------------------------------------------------------------------------
// layoutDocument – page overflow
// ---------------------------------------------------------------------------

test('enough newlines cause page overflow', () => {
  const metrics = computeMetrics(DEFAULT_PAGE_SPEC);
  // Create exactly maxLinesPerPage newlines → should create 2 pages
  const text = '\n'.repeat(metrics.maxLinesPerPage);
  const doc = layoutDocument(text, DEFAULT_PAGE_SPEC);
  assert.equal(doc.pageCount, 2);
  assert.equal(doc.pages[0].lines.length, metrics.maxLinesPerPage);
});

test('word wrap does not exceed max chars per line', () => {
  const metrics = computeMetrics(DEFAULT_PAGE_SPEC);
  // One long word that fits, then a word that would overflow
  const longWord = 'a'.repeat(metrics.maxCharsPerLine - 5);
  const text = longWord + ' hello';
  const doc = layoutDocument(text, DEFAULT_PAGE_SPEC);
  // 'hello' should be on second line because longWord + space + hello > maxCharsPerLine
  assert.equal(doc.pages[0].lines.length, 2);
});

// ---------------------------------------------------------------------------
// locateCursor
// ---------------------------------------------------------------------------

test('locateCursor finds cursor on first line', () => {
  const doc = layoutDocument('hello world', DEFAULT_PAGE_SPEC);
  const loc = locateCursor(doc, 3);
  assert.equal(loc.pageIndex, 0);
  assert.equal(loc.lineIndex, 0);
});

test('locateCursor finds cursor on second line after newline', () => {
  const doc = layoutDocument('abc\ndef', DEFAULT_PAGE_SPEC);
  const loc = locateCursor(doc, 5); // 'd' of 'def'
  assert.equal(loc.pageIndex, 0);
  assert.equal(loc.lineIndex, 1);
});

test('locateCursor at end of text', () => {
  const doc = layoutDocument('abc', DEFAULT_PAGE_SPEC);
  const loc = locateCursor(doc, 3);
  assert.equal(loc.pageIndex, 0);
  assert.equal(loc.lineIndex, 0);
});

// ---------------------------------------------------------------------------
// cursorColumn
// ---------------------------------------------------------------------------

test('cursorColumn returns correct column', () => {
  const doc = layoutDocument('abc\ndef', DEFAULT_PAGE_SPEC);
  const loc = locateCursor(doc, 5);
  const col = cursorColumn(doc, loc, 5);
  assert.equal(col, 1); // 'd'=0, 'e'=1
});

test('cursorColumn at start of line is 0', () => {
  const doc = layoutDocument('abc\ndef', DEFAULT_PAGE_SPEC);
  const loc = locateCursor(doc, 4);
  const col = cursorColumn(doc, loc, 4);
  assert.equal(col, 0);
});

// ---------------------------------------------------------------------------
// computeScrollPosition
// ---------------------------------------------------------------------------

test('computeScrollPosition page 0 line 0 at scale 1', () => {
  const doc = layoutDocument('hello', DEFAULT_PAGE_SPEC);
  const scroll = computeScrollPosition(doc, 0, 0, 1);
  const expected = TYPING_OFFSET_Y - (0 + DEFAULT_PAGE_SPEC.marginTop + 0);
  assert.equal(scroll.transformY, expected);
});

test('computeScrollPosition page 1 accounts for page gap', () => {
  const metrics = computeMetrics(DEFAULT_PAGE_SPEC);
  const text = '\n'.repeat(metrics.maxLinesPerPage);
  const doc = layoutDocument(text, DEFAULT_PAGE_SPEC);

  const scroll = computeScrollPosition(doc, 1, 0, 1);
  const pageOffset = 1 * (DEFAULT_PAGE_SPEC.paper.height + PAGE_GAP);
  const expected = TYPING_OFFSET_Y - (pageOffset + DEFAULT_PAGE_SPEC.marginTop);
  assert.equal(scroll.transformY, expected);
});

// ---------------------------------------------------------------------------
// Paper sizes
// ---------------------------------------------------------------------------

test('letter and a4 paper sizes are defined', () => {
  assert.ok(PAPER_SIZES.letter);
  assert.ok(PAPER_SIZES.a4);
  assert.equal(PAPER_SIZES.letter.width, 816);
  assert.equal(PAPER_SIZES.a4.width, 794);
});

// ---------------------------------------------------------------------------
// Multi-page layout preserves page numbers
// ---------------------------------------------------------------------------

test('pages have sequential pageNumber values', () => {
  const metrics = computeMetrics(DEFAULT_PAGE_SPEC);
  const text = '\n'.repeat(metrics.maxLinesPerPage * 3);
  const doc = layoutDocument(text, DEFAULT_PAGE_SPEC);
  assert.ok(doc.pageCount >= 3);
  for (let i = 0; i < doc.pageCount; i++) {
    assert.equal(doc.pages[i].pageNumber, i);
  }
});
