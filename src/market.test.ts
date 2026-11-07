import { describe, expect, it } from 'vitest'
import { marketStatus, minutesToIstMidnight } from './market'

describe('NSE session clock', () => {
  it('is open during the weekday session', () => {
    expect(marketStatus(new Date('2026-11-06T05:00:00Z'))).toEqual({ open: true, text: 'NSE open · closes 15:30' })
  })

  it('is closed after the session and on weekends', () => {
    expect(marketStatus(new Date('2026-11-06T11:00:00Z')).open).toBe(false)
    expect(marketStatus(new Date('2026-11-07T05:00:00Z')).open).toBe(false)
  })

  it('computes daily broker-token expiry in IST', () => {
    expect(minutesToIstMidnight(new Date('2026-11-06T18:00:00Z'))).toBe(30)
  })
})
