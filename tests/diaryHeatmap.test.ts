import assert from 'node:assert/strict'
import test from 'node:test'

import { buildDiaryHeatmap } from '../app/lib/diaryHeatmap.ts'

test('grid has `weeks` columns, each of 7 days', () => {
  const grid = buildDiaryHeatmap([], '2026-07-05', 4)
  assert.equal(grid.length, 4)
  for (const w of grid) assert.equal(w.length, 7)
})

test('each column starts on Sunday (row 0)', () => {
  const grid = buildDiaryHeatmap([], '2026-07-05', 6)
  for (const week of grid) {
    const dow = new Date(week[0].date + 'T00:00:00Z').getUTCDay()
    assert.equal(dow, 0)
  }
})

test('the most recent in-range cell is today', () => {
  const grid = buildDiaryHeatmap([], '2026-07-05', 4)
  const inRange = grid
    .flat()
    .filter((c) => c.inRange)
    .map((c) => c.date)
    .sort()
  assert.equal(inRange[inRange.length - 1], '2026-07-05')
})

test('cells after today are padding (inRange false, hasEntry false)', () => {
  const grid = buildDiaryHeatmap(['2026-07-31'], '2026-07-05', 4)
  for (const c of grid.flat()) {
    if (c.date > '2026-07-05') {
      assert.equal(c.inRange, false)
      assert.equal(c.hasEntry, false)
    }
  }
})

test('hasEntry reflects the entry set within range', () => {
  const grid = buildDiaryHeatmap(['2026-07-01', '2026-07-05'], '2026-07-05', 4)
  const flat = grid.flat()
  assert.equal(flat.find((c) => c.date === '2026-07-01')?.hasEntry, true)
  assert.equal(flat.find((c) => c.date === '2026-07-05')?.hasEntry, true)
  assert.equal(flat.find((c) => c.date === '2026-07-02')?.hasEntry, false)
})

test('accepts a Set as input', () => {
  const grid = buildDiaryHeatmap(new Set(['2026-07-03']), '2026-07-05', 4)
  assert.equal(
    grid.flat().find((c) => c.date === '2026-07-03')?.hasEntry,
    true
  )
})
