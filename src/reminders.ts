// Browser notifications, per browser: they only fire while AutoTrade is open in a tab.
import { useCallback, useEffect, useState } from 'react'

export interface ReminderPrefs {
  /** 08:45 IST on weekdays, if a broker account isn't logged in yet. */
  login: boolean
  /** A strategy stopped with an error, or an order was rejected. */
  errors: boolean
  /** Every filled order. */
  fills: boolean
}

const KEY = 'autotrade.reminders'
const DEFAULTS: ReminderPrefs = { login: true, errors: true, fills: false }

export function loadPrefs(): ReminderPrefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<ReminderPrefs>) }
  } catch {
    return DEFAULTS
  }
}

export function usePrefs(): [ReminderPrefs, (p: ReminderPrefs) => void] {
  const [prefs, setPrefs] = useState(loadPrefs)
  const save = useCallback((p: ReminderPrefs) => {
    setPrefs(p)
    try {
      localStorage.setItem(KEY, JSON.stringify(p))
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event('autotrade-reminders'))
  }, [])
  useEffect(() => {
    const onChange = () => setPrefs(loadPrefs())
    window.addEventListener('autotrade-reminders', onChange)
    return () => window.removeEventListener('autotrade-reminders', onChange)
  }, [])
  return [prefs, save]
}

export function notificationsAllowed(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted'
}

export async function askPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  return (await Notification.requestPermission()) === 'granted'
}

export function notify(title: string, body: string, tag?: string) {
  if (!notificationsAllowed()) return
  try {
    new Notification(title, { body, tag })
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}
