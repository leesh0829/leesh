import assert from 'node:assert/strict'
import test from 'node:test'

import { CHARS_PER_MIN, estimateReadingMinutes } from '../app/lib/readingTime.ts'

test('empty or whitespace content is at least 1 minute', () => {
  assert.equal(estimateReadingMinutes(''), 1)
  assert.equal(estimateReadingMinutes('   \n\n  '), 1)
})

test('counts letters and numbers only (spaces/punctuation ignored)', () => {
  assert.equal(estimateReadingMinutes('가나다라마바사아자차'), 1)
})

test('scales at ~500 chars/min', () => {
  const text = '가'.repeat(CHARS_PER_MIN * 2 + 1) // 1001 -> ceil(1001/500)=3
  assert.equal(estimateReadingMinutes(text), 3)
})

test('fenced code blocks are excluded from the count', () => {
  const withCode = '가나다\n```\n' + 'x'.repeat(5000) + '\n```\n라마바'
  assert.equal(estimateReadingMinutes(withCode), 1) // only 6 hangul counted
})

test('markdown heading punctuation does not inflate the count', () => {
  assert.equal(estimateReadingMinutes('# 제목'), 1)
})
