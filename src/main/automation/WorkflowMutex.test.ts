import { describe, expect, it } from 'vitest'
import { WorkflowMutex } from './WorkflowMutex'

describe('WorkflowMutex', () => {
  it('không cho hai workflow bất đồng bộ chạy chồng lên nhau', async () => {
    let active = 0
    let maxActive = 0
    let releaseFirst!: () => void
    const firstBlocked = new Promise<void>(resolve => { releaseFirst = resolve })
    const order: string[] = []
    const mutex = new WorkflowMutex()

    const first = mutex.runExclusive(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      order.push('first:start')
      await firstBlocked
      order.push('first:end')
      active -= 1
    })
    const second = mutex.runExclusive(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      order.push('second:start')
      active -= 1
    })

    await Promise.resolve()
    expect(order).toEqual(['first:start'])
    releaseFirst()
    await Promise.all([first, second])

    expect(maxActive).toBe(1)
    expect(order).toEqual(['first:start', 'first:end', 'second:start'])
  })

  it('nhả khóa khi workflow trước bị lỗi', async () => {
    const mutex = new WorkflowMutex()

    await expect(mutex.runExclusive(async () => {
      throw new Error('boom')
    })).rejects.toThrow('boom')

    await expect(mutex.runExclusive(async () => 'next')).resolves.toBe('next')
  })
})
