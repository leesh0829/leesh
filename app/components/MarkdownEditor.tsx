'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import { sanitizedMarkdownSchema } from '@/app/lib/markdown'

type Tab = 'write' | 'preview'
type MarkdownHtmlMode = 'off' | 'safe' | 'raw'

type MarkdownEditorProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  disabled?: boolean
  className?: string
  previewEmptyText?: string
  htmlMode?: MarkdownHtmlMode
}

const markdownComponents: Parameters<typeof ReactMarkdown>[0]['components'] = {
  img: ({ alt, src, ...props }) => {
    const safeSrc = typeof src === 'string' ? src.trim() : ''
    if (!safeSrc) return null
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        {...props}
        src={safeSrc}
        alt={alt ?? ''}
        style={{ maxWidth: '100%', height: 'auto', borderRadius: 12 }}
      />
    )
  },
  pre: (props) => (
    <pre
      {...props}
      className="mt-3 overflow-x-auto rounded-xl border p-3 text-sm"
    />
  ),
  code: (props) => {
    const { className, children, ...rest } = props
    const isBlock =
      typeof className === 'string' && className.includes('language-')
    if (isBlock) {
      return (
        <code {...rest} className={className}>
          {children}
        </code>
      )
    }
    return (
      <code
        {...rest}
        className="rounded-md border bg-black/5 px-1 py-0.5 text-[0.85em]"
      >
        {children}
      </code>
    )
  },
}

/**
 * A two-tab Markdown editor with editable "Write" mode and rendered "Preview" mode.
 *
 * Renders a textarea for composing Markdown and a preview panel that renders Markdown
 * using configured remark/rehype plugins. The preview supports three HTML handling modes:
 * - "off": no raw HTML processing (only syntax highlighting)
 * - "safe": allows HTML but sanitizes it against a safe schema
 * - "raw": allows raw HTML without sanitization
 *
 * @param value - The current Markdown content
 * @param onChange - Called with the updated Markdown content when the textarea changes
 * @param placeholder - Placeholder text shown in the textarea when empty
 * @param rows - Number of visible textarea rows
 * @param disabled - If true, the textarea is disabled
 * @param className - Optional container CSS class
 * @param previewEmptyText - Text to display in the preview when `value` is empty or whitespace
 * @param htmlMode - Controls HTML handling in the preview: `'off' | 'safe' | 'raw'`
 * @returns The Markdown editor React element
 */
export default function MarkdownEditor({
  value,
  onChange,
  placeholder = '마크다운으로 작성...',
  rows = 12,
  disabled = false,
  className,
  previewEmptyText = '미리보기할 내용이 없습니다.',
  htmlMode = 'off',
}: MarkdownEditorProps) {
  const [tab, setTab] = useState<Tab>('write')
  const rehypePlugins: NonNullable<
    Parameters<typeof ReactMarkdown>[0]['rehypePlugins']
  > =
    htmlMode === 'raw'
      ? [rehypeRaw, rehypeHighlight]
      : htmlMode === 'safe'
        ? [rehypeRaw, [rehypeSanitize, sanitizedMarkdownSchema], rehypeHighlight]
        : [rehypeHighlight]

  return (
    <div className={className}>
      <div className="overflow-hidden rounded-xl border">
        <div
          className="flex items-center gap-1 border-b px-2 py-1.5"
          style={{ background: 'rgba(11, 16, 32, 0.03)' }}
        >
          <button
            type="button"
            className={`btn btn-ghost h-8 px-3 ${
              tab === 'write' ? 'font-semibold' : 'opacity-70'
            }`}
            onClick={() => setTab('write')}
            aria-pressed={tab === 'write'}
          >
            Write
          </button>
          <button
            type="button"
            className={`btn btn-ghost h-8 px-3 ${
              tab === 'preview' ? 'font-semibold' : 'opacity-70'
            }`}
            onClick={() => setTab('preview')}
            aria-pressed={tab === 'preview'}
          >
            Preview
          </button>
        </div>

        {tab === 'write' ? (
          <textarea
            className="textarea w-full rounded-none border-0"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            disabled={disabled}
            style={{ resize: 'vertical' }}
          />
        ) : (
          <div className="min-h-[220px] p-4">
            <div className="markdown-body text-sm leading-7">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                rehypePlugins={rehypePlugins}
                components={markdownComponents}
              >
                {value.trim() ? value : previewEmptyText}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
