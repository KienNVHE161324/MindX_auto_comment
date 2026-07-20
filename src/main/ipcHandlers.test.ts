import { describe, it, expect, vi } from 'vitest'
import { createIpcHandlers } from './ipcHandlers'
import { DEFAULT_CONFIG, SchoolClass, SessionContent, LmsPostParams } from '../shared/types'

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

describe('createIpcHandlers — content & gemini', () => {
  function makeDeps() {
    const contentRepo = { get: vi.fn(async () => null), save: vi.fn(async () => {}) }
    const base = {
      configStore: { load: vi.fn(), save: vi.fn(), update: vi.fn() },
      validateGeminiKey: vi.fn(), pickFolder: vi.fn(),
      getRepository: vi.fn(),
      getContentRepository: vi.fn(async () => contentRepo),
      extractPdf: vi.fn(async () => 'Nội dung PDF'),
      rewrite: vi.fn(async () => 'Nhận xét đã sửa'),
    }
    return { base, contentRepo }
  }

  it('getContent ủy quyền cho contentRepo.get', async () => {
    const { base, contentRepo } = makeDeps()
    const api = createIpcHandlers(base as never)
    await api.getContent('s1')
    expect(contentRepo.get).toHaveBeenCalledWith('s1')
  })
  it('saveContent ủy quyền cho contentRepo.save', async () => {
    const { base, contentRepo } = makeDeps()
    const api = createIpcHandlers(base as never)
    const c: SessionContent = { id: 's1', classId: 'c1', sessionId: 's1', lessonContent: '', homework: '', comments: [] }
    await api.saveContent(c)
    expect(contentRepo.save).toHaveBeenCalledWith(c)
  })
  it('extractLessonFromPdf ủy quyền cho extractPdf', async () => {
    const { base } = makeDeps()
    const api = createIpcHandlers(base as never)
    expect(await api.extractLessonFromPdf()).toBe('Nội dung PDF')
  })
  it('rewriteComment ủy quyền cho rewrite với đúng tham số', async () => {
    const { base } = makeDeps()
    const api = createIpcHandlers(base as never)
    expect(await api.rewriteComment('An', 'ngoan')).toBe('Nhận xét đã sửa')
    expect(base.rewrite).toHaveBeenCalledWith('An', 'ngoan')
  })
})

describe('createIpcHandlers — LMS automation', () => {
  function makeDeps() {
    return {
      configStore: { load: vi.fn(), save: vi.fn(), update: vi.fn() },
      validateGeminiKey: vi.fn(), pickFolder: vi.fn(),
      getRepository: vi.fn(), getContentRepository: vi.fn(),
      extractPdf: vi.fn(), rewrite: vi.fn(),
      lmsOpenBrowser: vi.fn(async () => ({ loggedIn: true })),
      lmsPostSession: vi.fn(async () => ({ posted: ['An'], skipped: [] })),
      lmsSyncAll: vi.fn(async () => ({ newClasses: [], contentResults: [], skippedClasses: [] })),
    }
  }

  it('lmsOpenBrowser ủy quyền cho dep', async () => {
    const deps = makeDeps()
    const api = createIpcHandlers(deps as never)
    const res = await api.lmsOpenBrowser()
    expect(res).toEqual({ loggedIn: true })
    expect(deps.lmsOpenBrowser).toHaveBeenCalledOnce()
  })

  it('lmsPostSession truyền params đúng', async () => {
    const deps = makeDeps()
    const api = createIpcHandlers(deps as never)
    const params: LmsPostParams = {
      classCode: 'A1', sessionDate: '2026-07-20',
      lessonContent: 'Bài học', homework: 'BT',
      comments: [{ studentName: 'An', text: 'Ngoan' }],
    }
    const res = await api.lmsPostSession(params)
    expect(res.posted).toEqual(['An'])
    expect(deps.lmsPostSession).toHaveBeenCalledWith(params)
  })

  it('lmsSyncAll truyền params và ủy quyền cho dep', async () => {
    const deps = makeDeps()
    const api = createIpcHandlers(deps as never)
    const params = { existingCodes: ['A1'], contentTargets: [{ classCode: 'A1', sessionId: 'ss1', sessionDate: '2026-07-10' }] }
    const res = await api.lmsSyncAll(params)
    expect(res).toEqual({ newClasses: [], contentResults: [], skippedClasses: [] })
    expect(deps.lmsSyncAll).toHaveBeenCalledWith(params)
  })
})
