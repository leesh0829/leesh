export type RssChannel = {
  title: string
  link: string
  description: string
  feedUrl?: string
}

export type RssItem = {
  title: string
  link: string
  description: string
  pubDate: Date | string
  guid?: string
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function toRfc822(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toUTCString()
}

export function buildRssXml(channel: RssChannel, items: RssItem[]): string {
  const itemXml = items
    .map(
      (it) => `    <item>
      <title>${esc(it.title)}</title>
      <link>${esc(it.link)}</link>
      <guid isPermaLink="false">${esc(it.guid ?? it.link)}</guid>
      <pubDate>${toRfc822(it.pubDate)}</pubDate>
      <description>${esc(it.description)}</description>
    </item>`
    )
    .join('\n')

  const selfLink = channel.feedUrl
    ? `\n    <atom:link href="${esc(channel.feedUrl)}" rel="self" type="application/rss+xml"/>`
    : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(channel.title)}</title>
    <link>${esc(channel.link)}</link>
    <description>${esc(channel.description)}</description>${selfLink}
${itemXml}
  </channel>
</rss>
`
}
