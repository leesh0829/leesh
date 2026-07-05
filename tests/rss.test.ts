import assert from 'node:assert/strict'
import test from 'node:test'

import { buildRssXml } from '../app/lib/rss.ts'

test('renders channel and items', () => {
  const xml = buildRssXml(
    { title: 'Blog', link: 'https://x.com/blog', description: 'desc' },
    [
      {
        title: 'Hello',
        link: 'https://x.com/blog/1',
        description: 'hi',
        pubDate: '2026-01-02T00:00:00Z',
      },
    ]
  )
  assert.ok(xml.startsWith('<?xml'))
  assert.ok(xml.includes('<title>Blog</title>'))
  assert.ok(xml.includes('<link>https://x.com/blog/1</link>'))
  assert.ok(xml.includes('<title>Hello</title>'))
})

test('escapes XML special characters', () => {
  const xml = buildRssXml(
    { title: 'A & B <c>', link: 'https://x.com', description: 'd' },
    []
  )
  assert.ok(xml.includes('A &amp; B &lt;c&gt;'))
  assert.ok(!xml.includes('A & B <c>'))
})

test('pubDate is RFC-822 (GMT)', () => {
  const xml = buildRssXml({ title: 't', link: 'l', description: 'd' }, [
    {
      title: 'i',
      link: 'il',
      description: 'id',
      pubDate: '2026-01-02T00:00:00Z',
    },
  ])
  assert.ok(
    /<pubDate>[A-Za-z]{3}, 02 Jan 2026 00:00:00 GMT<\/pubDate>/.test(xml)
  )
})

test('self atom link is included when feedUrl is given', () => {
  const xml = buildRssXml(
    {
      title: 't',
      link: 'l',
      description: 'd',
      feedUrl: 'https://x.com/blog/rss.xml',
    },
    []
  )
  assert.ok(xml.includes('rel="self"'))
  assert.ok(xml.includes('href="https://x.com/blog/rss.xml"'))
})
