'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { defaultLocale, isLocale, localeCookieName, type Locale } from './config'
import { getDictionary, type Messages } from './dictionaries'

type Replacements = Record<string, string | number>

type I18nContextValue = {
  locale: Locale
  messages: Messages
  t: (key: string, replacements?: Replacements) => string
  setLocale: (locale: Locale) => void
}

type PendingLocale = {
  locale: Locale
  messages: Messages
  /** Server messages the switch was made against; new server props supersede it. */
  basis: Messages
}

const I18nContext = createContext<I18nContextValue | null>(null)

function lookup(messages: Messages, key: string): string | undefined {
  const value = key.split('.').reduce<unknown>((node, part) => {
    if (node == null || typeof node !== 'object') return undefined
    return (node as Record<string, unknown>)[part]
  }, messages as unknown)

  return typeof value === 'string' ? value : undefined
}

function interpolate(value: string, replacements?: Replacements) {
  if (!replacements) return value
  return Object.entries(replacements).reduce(
    (text, [key, replacement]) =>
      text.replaceAll(`{${key}}`, String(replacement)),
    value,
  )
}

export function I18nProvider({
  children,
  locale,
  messages,
}: {
  children: ReactNode
  locale: Locale
  messages: Messages
}) {
  const router = useRouter()
  // Server props are authoritative. A local switch is held as an optimistic
  // pending pair only until the server delivers new props (refresh, navigation,
  // or a refresh that rejected the switch), so locale and messages never mix.
  const [pending, setPending] = useState<PendingLocale | null>(null)
  const optimistic = pending?.basis === messages ? pending : null
  const activeLocale = optimistic?.locale ?? locale
  const activeMessages = optimistic?.messages ?? messages

  useEffect(() => {
    document.documentElement.lang = activeLocale
  }, [activeLocale])

  const changeLocale = useCallback(
    (nextLocale: Locale) => {
      if (!isLocale(nextLocale)) return
      document.cookie = `${localeCookieName}=${nextLocale}; path=/; max-age=31536000; samesite=lax`
      setPending(
        nextLocale === locale
          ? null
          : { locale: nextLocale, messages: getDictionary(nextLocale), basis: messages },
      )
      router.refresh()
    },
    [locale, messages, router],
  )

  const t = useCallback(
    (key: string, replacements?: Replacements) =>
      interpolate(
        lookup(activeMessages, key) ??
          lookup(getDictionary(defaultLocale), key) ??
          key,
        replacements,
      ),
    [activeMessages],
  )

  const value = useMemo(
    () => ({
      locale: activeLocale,
      messages: activeMessages,
      t,
      setLocale: changeLocale,
    }),
    [activeLocale, activeMessages, changeLocale, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return context
}
