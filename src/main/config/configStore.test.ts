import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ConfigStore } from './configStore'
import { DEFAULT_CONFIG } from '../../shared/types'

let dir: string

beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), 'cfg-'))
})
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

describe('ConfigStore', () => {
  it('load trả về DEFAULT_CONFIG khi chưa có file', async () => {
    const store = new ConfigStore(dir)
    expect(await store.load()).toEqual(DEFAULT_CONFIG)
  })

  it('save rồi load trả lại đúng dữ liệu', async () => {
    const store = new ConfigStore(dir)
    const cfg = { ...DEFAULT_CONFIG, geminiApiKey: 'abc', localFolderPath: '/data' }
    await store.save(cfg)
    expect(await store.load()).toEqual(cfg)
  })

  it('update chỉ đổi field được truyền, giữ nguyên phần còn lại', async () => {
    const store = new ConfigStore(dir)
    const next = await store.update({ geminiApiKey: 'key-1' })
    expect(next.geminiApiKey).toBe('key-1')
    expect(next.storageBackend).toBe('local')
    expect((await store.load()).geminiApiKey).toBe('key-1')
  })

  it('load hợp nhất field thiếu với default (forward-compatible)', async () => {
    await fs.writeFile(join(dir, 'config.json'), JSON.stringify({ geminiApiKey: 'x' }), 'utf-8')
    const cfg = await new ConfigStore(dir).load()
    expect(cfg.geminiApiKey).toBe('x')
    expect(cfg.zaloMessageTemplate).toBe(DEFAULT_CONFIG.zaloMessageTemplate)
  })

  it('load trả DEFAULT_CONFIG khi file config.json hỏng (không phải JSON)', async () => {
    await fs.writeFile(join(dir, 'config.json'), '{ hỏng không phải json', 'utf-8')
    expect(await new ConfigStore(dir).load()).toEqual(DEFAULT_CONFIG)
  })

  it('save không để lại file tạm sau khi ghi', async () => {
    const store = new ConfigStore(dir)
    await store.save(DEFAULT_CONFIG)
    const files = await fs.readdir(dir)
    expect(files).toEqual(['config.json'])
  })
})
