import { describe, expect, it } from 'vitest'
import {
  getCommentSessionDatePattern,
  getCommentSessionDateTextPattern,
  getLmsTabReadySelector,
  getLmsTabPattern,
  getLmsSectionPattern,
  getLmsSectionEditorSelector,
  getAbsentStudentPattern,
  getLmsOverwriteAction,
  getStudentCommentManualModeSelector,
  isStudentCommentSaveConfirmed,
  getStudentCommentEditorSelector,
  getLmsDrawerRefreshSelector,
  getStudentCommentButtonPattern,
  makeLmsPostResult,
  shouldWriteLmsSection,
} from './LmsAutomator'

describe('getLmsTabPattern', () => {
  it('khớp tab nhận xét ở cả giao diện tiếng Việt và tiếng Anh', () => {
    const pattern = getLmsTabPattern('Nhận xét')

    expect(pattern.test('Nhận xét')).toBe(true)
    expect(pattern.test('Comments')).toBe(true)
  })
})

describe('getLmsTabReadySelector', () => {
  it('chờ carousel thật sự xuất hiện sau khi mở tab nhận xét', () => {
    expect(getLmsTabReadySelector('Nhận xét')).toBe(
      '#detail-content [id^="class-comments-slot-carousel-"]',
    )
  })
})

describe('getCommentSessionDatePattern', () => {
  it('khớp ngày trong carousel kể cả slot đang chọn có thêm giờ và năm', () => {
    const pattern = getCommentSessionDatePattern('2026-06-28')

    expect(pattern.test('28/06')).toBe(true)
    expect(pattern.test('08:00 28/06/2026')).toBe(true)
  })
})

describe('getLmsSectionPattern', () => {
  it('khớp nhãn Summary/Tổng kết và Homework/Bài về nhà', () => {
    expect(getLmsSectionPattern('summary').test('Summary')).toBe(true)
    expect(getLmsSectionPattern('summary').test('Tổng két')).toBe(true)
    expect(getLmsSectionPattern('homework').test('Homework')).toBe(true)
    expect(getLmsSectionPattern('homework').test('Bài về nhà')).toBe(true)
  })
})

describe('getLmsSectionEditorSelector', () => {
  it('chỉ nhận các phần tử có thể nhập nội dung thật', () => {
    expect(getLmsSectionEditorSelector()).toContain('[contenteditable="true"]')
    expect(getLmsSectionEditorSelector()).toContain('textarea')
  })
})

describe('getAbsentStudentPattern', () => {
  it('khớp thông báo học sinh nghỉ bằng tiếng Việt và tiếng Anh', () => {
    const pattern = getAbsentStudentPattern()
    expect(pattern.test('Không thể viết nhận xét cho học viên vắng mặt')).toBe(true)
    expect(pattern.test('Cannot comment on absent student')).toBe(true)
  })
})

describe('shouldWriteLmsSection', () => {
  it('bỏ qua phần nội dung trống để không chặn gửi', () => {
    expect(shouldWriteLmsSection('')).toBe(false)
    expect(shouldWriteLmsSection('   ')).toBe(false)
    expect(shouldWriteLmsSection('BTVN trang 10')).toBe(true)
  })
})

describe('getLmsOverwriteAction', () => {
  it('luôn thay nội dung cũ khi có nội dung mới', () => {
    expect(getLmsOverwriteAction('Nội dung cũ', 'Nội dung mới')).toBe('replace')
    expect(getLmsOverwriteAction('', 'Nội dung mới')).toBe('replace')
  })

  it('bỏ qua khi nội dung mới trống', () => {
    expect(getLmsOverwriteAction('Nội dung cũ', '   ')).toBe('skip')
  })
})

describe('getStudentCommentEditorSelector', () => {
  it('nhắm đúng Quill editor xuất hiện sau khi click vùng comment', () => {
    expect(getStudentCommentEditorSelector()).toBe('.ql-editor[contenteditable="true"]')
  })
})

describe('getStudentCommentManualModeSelector', () => {
  it('nhắm nút chuyển popup nhận xét sang manual mode', () => {
    expect(getStudentCommentManualModeSelector()).toBe(
      '[aria-label="In by-areas mode, click to switch to manual mode"]',
    )
  })
})

describe('isStudentCommentSaveConfirmed', () => {
  it('không xác nhận đã lưu khi popup không tự đóng sau Save', async () => {
    const saved = await isStudentCommentSaveConfirmed(async () => {
      throw new Error('popup remained open')
    })

    expect(saved).toBe(false)
  })
})

describe('getLmsDrawerRefreshSelector', () => {
  it('nhắm đúng nút Refresh trong drawer khi tab Comments treo tải', () => {
    expect(getLmsDrawerRefreshSelector()).toBe(
      '#detail-content header button:has(svg[data-testid="RefreshIcon"])',
    )
  })
})

describe('getStudentCommentButtonPattern', () => {
  it('khớp nút mở nhận xét học sinh', () => {
    expect(getStudentCommentButtonPattern().test('Nhận xét học sinh')).toBe(true)
  })
})

describe('makeLmsPostResult', () => {
  it('tách học sinh nghỉ khỏi lỗi/thiếu nội dung', () => {
    expect(makeLmsPostResult(['An'], ['Bình'], ['Bình', 'Lỗi'])).toEqual({
      posted: ['An'],
      absentStudentNames: ['Bình'],
      skipped: ['Bình', 'Lỗi'],
    })
  })
})

describe('getCommentSessionDateTextPattern', () => {
  it('chỉ khớp div ngày, không nhầm text ghép với số thứ tự buổi', () => {
    const pattern = getCommentSessionDateTextPattern('2026-06-28')

    expect(pattern.test('28/06')).toBe(true)
    expect(pattern.test('08:00 28/06/2026')).toBe(true)
    expect(pattern.test('# 128/06')).toBe(false)
  })
})
