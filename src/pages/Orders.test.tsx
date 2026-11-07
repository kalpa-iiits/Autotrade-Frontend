import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Account, Order } from '../api/types'
import { api } from '../api/client'
import { OrderTable } from './Orders'

const account = { id: 7, broker: 'paper', label: 'Paper' } as Account
const order: Order = {
  id: 'order-1',
  symbol: 'NSE:SBIN-EQ',
  side: 'BUY',
  quantity: 2,
  order_type: 'MARKET',
  status: 'OPEN',
  filled_quantity: 0,
}

describe('order cancellation safety', () => {
  it('does not call the API when confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const request = vi.spyOn(api, 'DELETE')
    render(<OrderTable account={account} orders={[order]} source={new Map()} showDate={false} onChanged={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(request).not.toHaveBeenCalled()
  })

  it('cancels only after confirmation and publishes the result', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const cancelled = { ...order, status: 'CANCELLED' as const }
    vi.spyOn(api, 'DELETE').mockResolvedValue({ data: cancelled, response: new Response(null, { status: 200 }) } as never)
    const onChanged = vi.fn()
    render(<OrderTable account={account} orders={[order]} source={new Map()} showDate={false} onChanged={onChanged} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(cancelled))
  })
})
