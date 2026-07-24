import { describe, expect, it, vi } from 'vitest'
import { ZaloDesktopBridge } from './ZaloDesktopBridge'

describe('ZaloDesktopBridge', () => {
  it('passes Unicode JSON through stdin and maps a sent response', async () => {
    const run = vi.fn(async () => ({
      exitCode: 0,
      stdout: '{"status":"sent"}',
      stderr: '',
    }))
    const bridge = new ZaloDesktopBridge('C:/app/resources/zalo-desktop-uia.ps1', run)

    await expect(bridge.send({
      searchTerm: 'Dương',
      message: 'Xin chào',
      debugDir: 'C:/debug',
    })).resolves.toEqual({ status: 'sent' })
    expect(run).toHaveBeenCalledWith(
      expect.stringMatching(/powershell\.exe$/i),
      expect.arrayContaining(['-File', 'C:/app/resources/zalo-desktop-uia.ps1']),
      expect.stringContaining('"searchTerm":"Dương"'),
    )
  })

  it('throws the step-specific error returned by PowerShell', async () => {
    const run = vi.fn(async () => ({
      exitCode: 1,
      stdout: '{"status":"error","step":"search","message":"Không thấy ô tìm kiếm"}',
      stderr: '',
    }))
    const bridge = new ZaloDesktopBridge('script.ps1', run)

    await expect(bridge.send({
      searchTerm: 'Dương',
      message: 'x',
      debugDir: 'C:/debug',
    })).rejects.toThrow('Zalo PC [search]: Không thấy ô tìm kiếm')
  })

  it('rejects malformed output instead of reporting success', async () => {
    const run = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: 'bad' }))
    const bridge = new ZaloDesktopBridge('script.ps1', run)
    await expect(bridge.send({
      searchTerm: 'Dương',
      message: 'x',
      debugDir: 'C:/debug',
    })).rejects.toThrow('Zalo PC trả về dữ liệu không hợp lệ')
  })
})
