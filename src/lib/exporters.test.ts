import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, toFileBaseName, toPlainText } from './exporters';

describe('toPlainText', () => {
  it('preserves the writer’s own line breaks', () => {
    assert.equal(toPlainText('one\ntwo\nthree'), 'one\ntwo\nthree\n');
  });

  it('keeps intentional blank lines between paragraphs', () => {
    assert.equal(toPlainText('one\n\ntwo'), 'one\n\ntwo\n');
  });

  it('normalises CRLF and lone CR to LF', () => {
    assert.equal(toPlainText('a\r\nb\rc'), 'a\nb\nc\n');
  });

  it('strips trailing spaces left by the carriage', () => {
    assert.equal(toPlainText('padded   \nnext'), 'padded\nnext\n');
  });

  it('trims trailing blank lines and ends with exactly one newline', () => {
    assert.equal(toPlainText('done\n\n\n'), 'done\n');
  });

  it('emits a single newline for an empty sheet', () => {
    assert.equal(toPlainText(''), '\n');
  });
});

describe('toFileBaseName', () => {
  it('slugifies a plain title', () => {
    assert.equal(toFileBaseName('Chapter One'), 'Chapter-One');
  });

  it('collapses runs of whitespace and dashes', () => {
    assert.equal(toFileBaseName('a   b  --  c'), 'a-b-c');
  });

  it('drops characters that are unsafe in a filename', () => {
    assert.equal(toFileBaseName('re: draft/v2 "final"?'), 're-draftv2-final');
  });

  it('falls back when nothing usable survives', () => {
    assert.equal(toFileBaseName('///'), 'typewriter-sheet');
    assert.equal(toFileBaseName('   '), 'typewriter-sheet');
  });

  it('does not produce a leading dot that would hide the file', () => {
    assert.ok(!toFileBaseName('...hidden').startsWith('.'));
  });

  it('caps the length', () => {
    assert.ok(toFileBaseName('x'.repeat(500)).length <= 80);
  });
});

describe('computeStats', () => {
  it('counts words, characters and lines', () => {
    assert.deepEqual(computeStats('the quick brown fox\njumps'), {
      words: 5,
      characters: 25,
      lines: 2,
    });
  });

  it('reports zero words for an empty or blank sheet', () => {
    assert.equal(computeStats('').words, 0);
    assert.equal(computeStats('   \n  ').words, 0);
  });

  it('does not double-count runs of whitespace', () => {
    assert.equal(computeStats('  a    b  ').words, 2);
  });
});
