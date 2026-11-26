import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

const Ctx = createContext<(msg: string) => void>(() => {})
export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const show = useCallback((m: string) => { setMsg(m); setTimeout(() => setMsg((x) => (x === m ? null : x)), 2600) }, [])
  return (
    <Ctx.Provider value={show}>
      {children}
      {msg && (
        <div role="status" className="fixed inset-x-0 bottom-36 z-[60] mx-auto w-fit max-w-[90%] rounded-xl bg-foreground px-4 py-2.5 text-sm text-background shadow-lg animate-in fade-in slide-in-from-bottom-2">
          {msg}
        </div>
      )}
    </Ctx.Provider>
  )
}
