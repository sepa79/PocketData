import { useCallback, useEffect, useRef, useState } from 'react'

export function useNotice() {
  const [message, setMessage] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notify = useCallback((message: string) => {
    if (timer.current) clearTimeout(timer.current)
    setMessage(message)
    if (message) timer.current = setTimeout(() => setMessage(''), 7000)
  }, [])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  return { message, notify }
}
