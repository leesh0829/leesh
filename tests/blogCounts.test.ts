import assert from 'node:assert/strict'
import test from 'node:test'

import { tallyBlogTypeCounts } from '../app/lib/blogCounts.ts'

const TYPES = ['INFO', 'REVIEW', 'DAILY']

test('zero-fills missing types and sums total', () => {
  const rows = [
    { blogCategory: 'REVIEW', _count: { _all: 3 } },
    { blogCategory: 'INFO', _count: { _all: 2 } },
  ]
  assert.deepEqual(tallyBlogTypeCounts(rows, TYPES), {
    total: 5,
    byType: { INFO: 2, REVIEW: 3, DAILY: 0 },
  })
})

test('empty rows -> all zero', () => {
  assert.deepEqual(tallyBlogTypeCounts([], TYPES), {
    total: 0,
    byType: { INFO: 0, REVIEW: 0, DAILY: 0 },
  })
})

test('unknown categories are ignored in total and byType', () => {
  const rows = [
    { blogCategory: 'REVIEW', _count: { _all: 1 } },
    { blogCategory: 'GHOST', _count: { _all: 9 } },
  ]
  const result = tallyBlogTypeCounts(rows, TYPES)
  assert.equal(result.total, 1)
  assert.equal(result.byType.REVIEW, 1)
})
