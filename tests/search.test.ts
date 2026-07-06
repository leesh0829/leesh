import assert from 'node:assert/strict'
import test from 'node:test'

import {
  blogWhere,
  boardsWhere,
  docsWhere,
  helpWhere,
  isQueryTooShort,
  normalizeQuery,
  titleFilter,
  toBoardItem,
  toContentItem,
} from '../app/lib/search.ts'

test('normalizeQuery trims and coerces null to empty string', () => {
  assert.equal(normalizeQuery('  hi '), 'hi')
  assert.equal(normalizeQuery(null), '')
})

test('isQueryTooShort requires at least 2 chars', () => {
  assert.equal(isQueryTooShort(''), true)
  assert.equal(isQueryTooShort('a'), true)
  assert.equal(isQueryTooShort('ab'), false)
})

test('blog/docs where restrict to published (status DONE) and the right board type', () => {
  const t = titleFilter('x')
  assert.deepEqual(blogWhere(t), {
    board: { type: 'BLOG' },
    status: 'DONE',
    title: t,
  })
  assert.deepEqual(docsWhere(t), {
    board: { type: 'DOCS' },
    status: 'DONE',
    title: t,
  })
})

test('help where is public (no login/owner restriction)', () => {
  const t = titleFilter('x')
  assert.deepEqual(helpWhere(t), { board: { type: 'HELP' }, title: t })
})

test('boards search is DISABLED when not logged in (security gate)', () => {
  assert.equal(boardsWhere(null, titleFilter('x')), null)
})

test('boards search is scoped to the current owner when logged in', () => {
  const t = titleFilter('x')
  assert.deepEqual(boardsWhere('user-1', t), {
    board: { type: 'GENERAL', ownerId: 'user-1' },
    title: t,
  })
})

test('titleFilter is a case-insensitive contains filter', () => {
  assert.deepEqual(titleFilter('Foo'), { contains: 'Foo', mode: 'insensitive' })
})

test('content items build correct URLs and never leak body fields', () => {
  const item = toContentItem('blog', { id: 'p1', title: 'T', isSecret: true })
  assert.deepEqual(item, { id: 'p1', title: 'T', url: '/blog/p1', isSecret: true })
  assert.equal('contentMd' in item, false)
})

test('help items omit isSecret and build a /help URL', () => {
  const item = toContentItem('help', { id: 'h1', title: 'Q' })
  assert.deepEqual(item, { id: 'h1', title: 'Q', url: '/help/h1' })
})

test('board items build a /boards/{boardId}/{id} URL', () => {
  const item = toBoardItem({ id: 'p9', title: 'B', boardId: 'b3', isSecret: false })
  assert.deepEqual(item, {
    id: 'p9',
    title: 'B',
    url: '/boards/b3/p9',
    isSecret: false,
  })
})

test('ids are URL-encoded in generated links', () => {
  const item = toContentItem('docs', { id: 'a b/c', title: 'T' })
  assert.equal(item.url, '/docs/a%20b%2Fc')
})
