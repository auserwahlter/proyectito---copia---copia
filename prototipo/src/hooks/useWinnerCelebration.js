import { useCallback, useEffect, useRef, useState } from 'react'

export function useWinnerCelebration(timeout = 2600) {
  const [celebratingId, setCelebratingId] = useState(null)
  const timer = useRef(null)

  const celebrate = useCallback(
    (winnerId) => {
      if (!winnerId) return
      window.clearTimeout(timer.current)
      setCelebratingId(winnerId)
      timer.current = window.setTimeout(() => {
        setCelebratingId(null)
      }, timeout)
    },
    [timeout],
  )

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return [celebratingId, celebrate]
}
