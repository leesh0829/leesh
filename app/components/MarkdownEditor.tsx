'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'

type Tab = 'write' | 'preview'

type MarkdownEditorProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  disabled?: boolean
  className?: string
  previewEmptyText?: string
}

const markdownComponents: Parameters<typeof ReactMarkdown>[0]['components'] = {
  img: ({ alt, ...props }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      alt={alt ?? ''}
      style={{ maxWidth: '100%', height: 'auto', borderRadius: 12 }}
    />
  ),
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

export default function MarkdownEditor({
  value,
  onChange,
  placeholder = '마크다운으로 작성...',
  rows = 12,
  disabled = false,
  className,
  previewEmptyText = '미리보기할 내용이 없습니다.',
}: MarkdownEditorProps) {
  const [tab, setTab] = useState<Tab>('write')

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
          <div className="min-h-[220px] p-4 text-sm leading-7">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              rehypePlugins={[rehypeHighlight]}
              components={markdownComponents}
            >
              {value.trim() ? value : previewEmptyText}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}
