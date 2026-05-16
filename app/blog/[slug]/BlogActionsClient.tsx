'use client'

import { NavEdit } from '@/app/components/PageNavIcons'

export default function BlogActionsClient({
  postId,
  canEdit,
  apiBasePath = '/api/blog/posts',
  detailBasePath = '/blog',
}: {
  postId: string
  canEdit: boolean
  apiBasePath?: string
  detailBasePath?: string
}) {
  if (!canEdit) return null

  const del = async () => {
    if (!confirm('이 글을 삭제할까요?')) return

    const res = await fetch(`${apiBasePath}/${postId}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)

    if (!res.ok) {
      alert(data?.message ?? '삭제 실패')
      return
    }

    window.location.href = detailBasePath
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <NavEdit href={`${detailBasePath}/edit/${postId}`} label="글 수정" />
      <button type="button" onClick={del} className="btn">
        삭제
      </button>
    </div>
  )
}
