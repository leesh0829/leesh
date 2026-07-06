import assert from 'node:assert/strict'
import test from 'node:test'

import { collectTags, parseTags } from '../app/lib/blogTags.ts'

test('splits on commas/newlines, trims, lowercases', () => {
  assert.deepEqual(parseTags('React, 회고\nNext.js'), [
    'react',
    '회고',
    'next.js',
  ])
})

test('drops empties and duplicates (case-insensitive)', () => {
  assert.deepEqual(parseTags('a, , A ,b,a'), ['a', 'b'])
})

test('caps at 10 tags', () => {
  const raw = Array.from({ length: 15 }, (_, i) => 't' + i).join(',')
  assert.equal(parseTags(raw).length, 10)
})

test('truncates each tag to 30 chars', () => {
  const long = 'x'.repeat(50)
  assert.equal(parseTags(long)[0].length, 30)
})

test('empty input -> empty array', () => {
  assert.deepEqual(parseTags(''), [])
  assert.deepEqual(parseTags('   '), [])
})

test('collectTags counts across posts, sorted by count desc then name', () => {
  const result = collectTags([
    ['react', 'ts'],
    ['react', 'next'],
    ['react'],
    ['next'],
  ])
  assert.deepEqual(result, [
    { tag: 'react', count: 3 },
    { tag: 'next', count: 2 },
    { tag: 'ts', count: 1 },
  ])
})

test('collectTags on empty -> empty', () => {
  assert.deepEqual(collectTags([]), [])
})
