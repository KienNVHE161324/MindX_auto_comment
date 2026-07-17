import { describe, it, expect, vi } from 'vitest'
import { createIpcHandlers } from './ipcHandlers'
import { DEFAULT_CONFIG, SchoolClass } from '../shared/types'

function makeDeps() {
  const configStore = {
    load: vi.fn(async () => DEFAULT_CONFIG),
    save: vi.fn(async () => {}),
    update: vi.fn(async (patch) => ({ ...DEFAULT_CONFIG, ...patch })),
  }
  const validateGeminiKey = vi.fn(async () => ({ valid: true }))
  const pickFolder = vi.fn(async () => '/chosen')
  return { configStore, validateGeminiKey, pickFolder }
}

describe('createIpcHandlers', () => {
  it('getConfig gọi configStore.load', async () => {
    const deps = makeDeps()
    const api = createIpcHandlers(deps as never)
    expect(await api.getConfig()).toEqual(DEFAULT_CONFIG)
    expect(deps.configStore.load).toHaveBeenCalledOnce()
  })

  it('updateConfig chuyển patch tới configStore.update', async () => {
    const deps = makeDeps()
    const api = createIpcHandlers(deps as never)
    const res = await api.updateConfig({ geminiApiKey: 'k' })
    expect(res.geminiApiKey).toBe('k')
    expect(deps.configStore.update).toHaveBeenCalledWith({ geminiApiKey: 'k' })
  })

  it('validateGeminiKey ủy quyền cho dep', async () => {
    const deps = makeDeps()
    const api = createIpcHandlers(deps as never)
    expect(await api.validateGeminiKey('k')).toEqual({ valid: true })
    expect(deps.validateGeminiKey).toHaveBeenCalledWith('k')
  })

  it('pickFolder ủy quyền cho dep', async () => {
    const deps = makeDeps()
    const api = createIpcHandlers(deps as never)
    expect(await api.pickFolder()).toBe('/chosen')
  })
})

describe('createIpcHandlers — class methods', () => {
  function makeClassDeps() {
    const repo = {
      list: vi.fn(async () => [] as SchoolClass[]),
      get: vi.fn(async () => null),
      save: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    }
    const base = {
      configStore: { load: vi.fn(), save: vi.fn(), update: vi.fn() },
      validateGeminiKey: vi.fn(),
      pickFolder: vi.fn(),
      getRepository: vi.fn(async () => repo),
    }
    return { base, repo }
  }

  it('listClasses ủy quyền cho repo.list', async () => {
    const { base, repo } = makeClassDeps()
    const api = createIpcHandlers(base as never)
    await api.listClasses()
    expect(repo.list).toHaveBeenCalledOnce()
  })
  it('getClass ủy quyền cho repo.get', async () => {
    const { base, repo } = makeClassDeps()
    const api = createIpcHandlers(base as never)
    await api.getClass('c1')
    expect(repo.get).toHaveBeenCalledWith('c1')
  })
  it('saveClass ủy quyền cho repo.save', async () => {
    const { base, repo } = makeClassDeps()
    const api = createIpcHandlers(base as never)
    const c: SchoolClass = { id: 'c1', code: 'A1', name: 'Lớp A1', students: [], sessions: [] }
    await api.saveClass(c)
    expect(repo.save).toHaveBeenCalledWith(c)
  })
  it('deleteClass ủy quyền cho repo.delete', async () => {
    const { base, repo } = makeClassDeps()
    const api = createIpcHandlers(base as never)
    await api.deleteClass('c1')
    expect(repo.delete).toHaveBeenCalledWith('c1')
  })
})
