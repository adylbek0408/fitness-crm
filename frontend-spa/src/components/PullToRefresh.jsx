import { useState, useRef, useCallback } from 'react'

const PULL_THRESHOLD = 60
const MAX_PULL = 80

export default function PullToRefresh({ children, onRefresh }) {
  const [pullY, setPullY] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(0)
  const scrollTop = useRef(0)

  const handleTouchStart = useCallback((e) => {
    startY.current = e.touches[0].clientY
    const el = e.currentTarget
    scrollTop.current = el?.scrollTop ?? 0
  }, [])

  const handleTouchMove = useCallback((e) => {
    if (refreshing) return
    const scrollEl = e.currentTarget
    if (scrollEl.scrollTop > 0) return
    const y = e.touches[0].clientY
    const diff = y - startY.current
    if (diff > 0) {
      setPullY(Math.min(diff, MAX_PULL))
    }
  }, [refreshing])

  const handleTouchEnd = useCallback(async () => {
    if (refreshing) return
    if (pullY >= PULL_THRESHOLD && typeof onRefresh === 'function') {
      setRefreshing(true)
      setPullY(0)
      try {
        await Promise.resolve(onRefresh())
      } finally {
        setRefreshing(false)
      }
    } else {
      setPullY(0)
    }
  }, [pullY, refreshing, onRefresh])

  const showIndicator = pullY > 0 || refreshing
  const progress = Math.min(pullY / PULL_THRESHOLD, 1)

  return (
    <div
      className="relative flex flex-col flex-1 min-h-0 overflow-auto touch-manipulation"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {showIndicator && (
        <div
          className="flex items-center justify-center shrink-0 text-blue-600 transition-all duration-150"
          style={{ height: refreshing ? 52 : Math.min(pullY, 52) }}
        >
          {refreshing ? (
            <span className="text-sm font-medium">Обновление…</span>
          ) : (
            <span className="text-sm font-medium opacity-90">
              {progress >= 1 ? 'Отпустите для обновления' : 'Потяните вниз'}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  )
}
