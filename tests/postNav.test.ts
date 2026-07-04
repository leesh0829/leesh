import assert from 'node:assert/strict'
import test from 'node:test'

import {
  adjacentOrder,
  adjacentWhere,
  postHref,
  relatedWhere,
} from '../app/lib/postNav.ts'

const D = new Date('2026-01-01T00:00:00.000Z')

test('postHref builds surface-correct, encoded URLs', () => {
  assert.equal(postHref('BLOG', 'p1'), '/blog/p1')
  assert.equal(postHref('DOCS', 'a b'), '/docs/a%20b')
})

test('adjacentWhere older = createdAt lt, published, same surface', () => {
  assert.deepEqual(adjacentWhere('BLOG', D, 'older'), {
    board: { type: 'BLOG' },
    status: 'DONE',
    createdAt: { lt: D },
  })
})

test('adjacentWhere newer = createdAt gt', () => {
  assert.deepEqual(adjacentWhere('DOCS', D, 'newer'), {
    board: { type: 'DOCS' },
    status: 'DONE',
    createdAt: { gt: D },
  })
})

test('adjacentOrder: older desc, newer asc', () => {
  assert.equal(adjacentOrder('older'), 'desc')
  assert.equal(adjacentOrder('newer'), 'asc')
})

test('relatedWhere excludes current post, stays in published surface', () => {
  assert.deepEqual(relatedWhere('DOCS', 'p9'), {
    board: { type: 'DOCS' },
    status: 'DONE',
    id: { not: 'p9' },
  })
})

test('relatedWhere adds blogCategory when provided', () => {
  assert.deepEqual(relatedWhere('BLOG', 'p9', 'REVIEW'), {
    board: { type: 'BLOG' },
    status: 'DONE',
    id: { not: 'p9' },
    blogCategory: 'REVIEW',
  })
})

test('relatedWhere omits blogCategory when null', () => {
  assert.deepEqual(relatedWhere('BLOG', 'p9', null), {
    board: { type: 'BLOG' },
    status: 'DONE',
    id: { not: 'p9' },
  })
})
