import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG, DEFAULT_ZALO_TEMPLATE } from './types'

describe('DEFAULT_CONFIG', () => {
  it('mặc định backend là local, không có key/thư mục', () => {
    expect(DEFAULT_CONFIG.storageBackend).toBe('local')
    expect(DEFAULT_CONFIG.localFolderPath).toBeNull()
    expect(DEFAULT_CONFIG.geminiApiKey).toBeNull()
  })

  it('template mặc định chứa đủ 5 biến chèn', () => {
    for (const v of ['{ten_lop}', '{ngay_buoi_hoc}', '{noi_dung_bai_hoc}', '{danh_sach_nhan_xet}', '{bai_tap_ve_nha}']) {
      expect(DEFAULT_ZALO_TEMPLATE).toContain(v)
    }
  })

  it('DEFAULT_CONFIG dùng đúng template mặc định', () => {
    expect(DEFAULT_CONFIG.zaloMessageTemplate).toBe(DEFAULT_ZALO_TEMPLATE)
  })
})
