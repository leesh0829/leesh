'use client'

import { useCallback, useRef, useState } from 'react'

/**
 * Prevents the same async UI action from running more than once at a time.
 */
export function useAsyncLock() {
  const lockRef = useRef(false)
  const [pending, setPending] = useState(false)

  const run = useCallback(
    async function runWithLock<T>(
      task: () => Promise<T>
    ): Promise<T | undefined> {
      if (lockRef.current) return undefined

      lockRef.current = true
      setPending(true)

      try {
        return await task()
      } finally {
        lockRef.current = false
        setPending(false)
      }
    },
    []
  )

  return { pending, run }
}
