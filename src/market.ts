// NSE session clock, in IST. Weekends only: exchange holidays are not known here.
const OPEN_MIN = 9 * 60 + 15
const CLOSE_MIN = 15 * 60 + 30
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface IstParts {
  weekday: number
  minutes: number
}

function istParts(d: Date): IstParts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  )
  return { weekday: DAYS.indexOf(parts.weekday), minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}

export interface MarketStatus {
  open: boolean
  text: string
}

export function marketStatus(now: Date = new Date()): MarketStatus {
  const { weekday, minutes } = istParts(now)
  const weekdayOpen = weekday >= 1 && weekday <= 5
  if (weekdayOpen && minutes >= OPEN_MIN && minutes < CLOSE_MIN) return { open: true, text: 'NSE open · closes 15:30' }
  if (weekdayOpen && minutes < OPEN_MIN) return { open: false, text: 'NSE closed · opens 09:15' }
  // After the close or on a weekend: the next weekday.
  let next = (weekday + 1) % 7
  while (next === 0 || next === 6) next = (next + 1) % 7
  return { open: false, text: `NSE closed · opens ${DAYS[next]} 09:15` }
}

/** "Mon, 26 Oct 2026 · 11:42 IST". */
export function istHeadline(now: Date = new Date()): string {
  const day = now.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const time = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })
  return `${day.replace(/^(\w+) /, '$1, ')} · ${time} IST`
}

/** Monday to Friday in IST. */
export function isIstWeekday(now: Date = new Date()): boolean {
  const { weekday } = istParts(now)
  return weekday >= 1 && weekday <= 5
}

/** Minutes until midnight IST, when a daily broker token stops being used. */
export function minutesToIstMidnight(now: Date = new Date()): number {
  return 24 * 60 - istParts(now).minutes
}
