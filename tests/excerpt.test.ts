import assert from 'node:assert/strict'
import test from 'node:test'

import { toExcerpt } from '../app/lib/excerpt.ts'

test('strips markdown and collapses whitespace', () => {
  assert.equal(
    toExcerpt('# 제목\n\n**굵게** 그리고 *기울임*'),
    '제목 굵게 그리고 기울임'
  )
})

test('links become their text', () => {
  assert.equal(toExcerpt('[네이버](https://naver.com) 링크'), '네이버 링크')
})

test('fenced code blocks are removed', () => {
  assert.equal(toExcerpt('앞\n```\ncode(1)\n```\n뒤'), '앞 뒤')
})

test('truncates long text with an ellipsis', () => {
  const r = toExcerpt('가'.repeat(200), 10)
  assert.equal(r.length, 10)
  assert.ok(r.endsWith('…'))
})

test('short text is returned unchanged', () => {
  assert.equal(toExcerpt('짧은 글'), '짧은 글')
})

test('hyphens inside words are preserved', () => {
  assert.equal(toExcerpt('well-known 사례'), 'well-known 사례')
})
