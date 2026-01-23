'use client'

import Link from 'next/link'

export default function BlogActionsClient({
  postId,
  canEdit,
}: {
  postId: string
  canEdit: boolean
}) {
  if (!canEdit) return null

  const del = async () => {
    if (!confirm('이 글을 삭제할까요?')) return

    const res = await fetch(`/api/blog/posts/${postId}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)

    if (!res.ok) {
      alert(data?.message ?? '삭제 실패')
      return
    }

    window.location.href = '/blog'
  }

  return (
    <div
      style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center' }}
    >
      <Link href={`/blog/edit/${postId}`}>수정</Link>
      <button type="button" onClick={del}>
        삭제
      </button>
    </div>
  )
}
