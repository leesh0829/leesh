import assert from 'node:assert/strict'
import test from 'node:test'

import { UNCATEGORIZED_LABEL, groupDocsByCategory } from '../app/lib/docsTree.ts'

const item = (id, docsCategory) => ({
  id,
  title: 'T' + id,
  docsCategory,
  createdAt: '2026-01-01',
})

test('groups by category, named A-Z then 기타 last', () => {
  const groups = groupDocsByCategory([
    item('1', 'Backend'),
    item('2', null),
    item('3', 'Algo'),
    item('4', 'Backend'),
  ])
  assert.deepEqual(
    groups.map((g) => g.category),
    ['Algo', 'Backend', UNCATEGORIZED_LABEL]
  )
  assert.equal(groups[1].items.length, 2)
})

test('empty -> no groups', () => {
  assert.deepEqual(groupDocsByCategory([]), [])
})

test('blank/whitespace category counts as 기타', () => {
  const groups = groupDocsByCategory([item('1', '   '), item('2', '')])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].category, UNCATEGORIZED_LABEL)
  assert.equal(groups[0].items.length, 2)
})

test('preserves input order within a group', () => {
  const groups = groupDocsByCategory([item('a', 'X'), item('b', 'X')])
  assert.deepEqual(
    groups[0].items.map((i) => i.id),
    ['a', 'b']
  )
})
