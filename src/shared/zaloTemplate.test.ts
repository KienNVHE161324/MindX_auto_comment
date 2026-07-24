import { describe, it, expect } from 'vitest'
import { fillTemplate, formatCommentLines, formatSessionDate, ZaloTemplateData } from './zaloTemplate'
import { DEFAULT_ZALO_TEMPLATE } from './types'

const data: ZaloTemplateData = {
  ten_lop: 'A1',
  ngay_buoi_hoc: '20/07/2026 18:00',
  noi_dung_bai_hoc: 'Bài 1',
  danh_sach_nhan_xet: 'An: ngoan',
  bai_tap_ve_nha: 'Làm bài 5',
}

describe('fillTemplate', () => {
  it('điền đủ 5 biến vào template mặc định', () => {
    const out = fillTemplate(DEFAULT_ZALO_TEMPLATE, data)
    expect(out).toContain('lớp A1 ngày 20/07/2026 18:00')
    expect(out).toContain('Bài 1')
    expect(out).toContain('An: ngoan')
    expect(out).toContain('Làm bài 5')
    expect(out).not.toContain('{')
  })
  it('giữ nguyên {key} lạ không có trong data', () => {
    expect(fillTemplate('Xin chào {khong_co}', data)).toBe('Xin chào {khong_co}')
  })
})

describe('formatCommentLines', () => {
  it('mỗi học sinh một dòng name: text', () => {
    expect(formatCommentLines([{ name: 'An', text: 'ngoan' }, { name: 'Bình', text: 'khá' }]))
      .toBe('An: ngoan\nBình: khá')
  })
  it('rỗng khi không có ai', () => {
    expect(formatCommentLines([])).toBe('')
  })
})

describe('formatSessionDate', () => {
  it('định dạng dd/mm/yyyy HH:mm', () => {
    expect(formatSessionDate('2026-07-20T18:05:00')).toBe('20/07/2026 18:05')
  })
  it('rỗng khi iso rỗng', () => {
    expect(formatSessionDate('')).toBe('')
  })
  it('rỗng khi iso không hợp lệ', () => {
    expect(formatSessionDate('không-phải-ngày')).toBe('')
  })
})
