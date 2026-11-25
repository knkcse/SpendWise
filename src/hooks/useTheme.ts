import { useEffect } from 'react'
import { useStore } from '@/data/store'

export function useApplyTheme() {
  const { prefs } = useStore()
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.classList.toggle('dark', prefs.theme === 'dark' || (prefs.theme === 'system' && mq.matches))
    apply(); mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [prefs.theme])
}
