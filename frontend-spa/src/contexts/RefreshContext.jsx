import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'

const RefreshContext = createContext(null)

export function RefreshProvider({ children }) {
  const [refreshFn, setRefreshFn] = useState(null)
  const register = useCallback((fn) => setRefreshFn(() => fn), [])
  return (
    <RefreshContext.Provider value={{ refreshFn, register }}>
      {children}
    </RefreshContext.Provider>
  )
}

export function useRefresh(onRefresh) {
  const { register } = useContext(RefreshContext)
  const fnRef = useRef(onRefresh)
  fnRef.current = onRefresh
  useEffect(() => {
    if (!register) return
    const fn = onRefresh == null ? null : () => Promise.resolve(fnRef.current?.())
    register(fn)
    return () => register(null)
  }, [register, onRefresh])
}

export function useRefreshFn() {
  return useContext(RefreshContext)?.refreshFn ?? null
}
