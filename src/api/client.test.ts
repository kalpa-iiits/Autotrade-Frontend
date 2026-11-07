import { describe, expect, it } from 'vitest'
import { ApiError, errorMessage, unwrap } from './client'

describe('API error handling', () => {
  it('returns successful response data', async () => {
    await expect(unwrap(Promise.resolve({ data: { ok: true }, response: new Response(null, { status: 200 }) }))).resolves.toEqual({ ok: true })
  })

  it('preserves validation detail and retry timing', async () => {
    const call = Promise.resolve({
      error: { detail: [{ loc: ['body', 'quantity'], msg: 'must be positive' }] },
      response: new Response(null, { status: 429, headers: { 'Retry-After': '30' } }),
    })
    await expect(unwrap(call)).rejects.toMatchObject({
      status: 429,
      message: 'quantity: must be positive',
      retryAfter: 30,
    })
  })

  it('does not hide unknown failures', () => {
    expect(errorMessage(new ApiError(503, 'broker unavailable'))).toBe('broker unavailable')
    expect(errorMessage(new Error('network down'))).toBe('network down')
  })
})
