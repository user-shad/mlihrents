import { createContext, ReactNode, useContext, useEffect, useState } from 'react'
import { Lang, t } from '../i18n'

interface LangContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  tr: (key: string) => string
}

const LangContext = createContext<LangContextValue | null>(null)

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en')

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])

  function setLang(next: Lang) {
    setLangState(next)
  }

  const tr = (key: string) => t(lang, key)

  return <LangContext.Provider value={{ lang, setLang, tr }}>{children}</LangContext.Provider>
}

export function useLang() {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used within LangProvider')
  return ctx
}
