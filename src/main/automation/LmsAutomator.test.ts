import { describe, expect, it, vi } from 'vitest'
import {
  LmsAutomator,
  getCommentSessionDatePattern,
  getCommentSessionDateTextPattern,
  getLmsTabReadySelector,
  getLmsTabPattern,
  getLmsSectionPattern,
  getLmsSectionEditorSelector,
  getAbsentStudentPattern,
  getLmsOverwriteAction,
  getStudentCommentModeFromAriaLabel,
  getStudentCommentInitialEditorWaitMs,
  getStudentCommentManualActiveSelector,
  getStudentCommentManualModeSelector,
  isStudentCommentSaveConfirmed,
  getStudentCommentEditorSelector,
  getLmsDrawerRefreshSelector,
  getStudentCommentButtonPattern,
  makeLmsPostResult,
  matchLmsCommentByStudentName,
  isStudentCommentContentEqual,
  isUpdateSlotCommentRequest,
  isUpdateSlotCommentResponse,
  shouldWriteLmsSection,
} from './LmsAutomator'

describe('LmsAutomator workflow serialization', () => {
  it('dùng cùng mutex cho các public workflow nên không overlap', async () => {
    const automator = new LmsAutomator('unused-in-test')
    const internals = automator as unknown as {
      openBrowserUnlocked: () => Promise<{ loggedIn: boolean }>
      syncClassesUnlocked: (codes: string[]) => Promise<{ classes: [] }>
    }
    let releaseFirst!: () => void
    const firstBlocked = new Promise<void>(resolve => { releaseFirst = resolve })
    const order: string[] = []
    internals.openBrowserUnlocked = async () => {
      order.push('open:start')
      await firstBlocked
      order.push('open:end')
      return { loggedIn: true }
    }
    internals.syncClassesUnlocked = async () => {
      order.push('sync:start')
      return { classes: [] }
    }

    const opening = automator.openBrowser()
    await vi.waitFor(() => expect(order).toEqual(['open:start']))
    const syncing = automator.syncClasses()
    await Promise.resolve()
    expect(order).toEqual(['open:start'])

    releaseFirst()
    await Promise.all([opening, syncing])
    expect(order).toEqual(['open:start', 'open:end', 'sync:start'])
  })
})

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
  it('nhắm nút chuyển popup sang manual mode ở cả LMS tiếng Anh và tiếng Việt', () => {
    expect(getStudentCommentManualModeSelector()).toBe(
      [
        '[aria-label="In by-areas mode, click to switch to manual mode"]',
        '[aria-label="Đang ở chế độ nhận xét theo các tiêu chí, click để chuyển sang nhận xét tự do"]',
      ].join(', '),
    )
  })
})

describe('getStudentCommentManualActiveSelector', () => {
  it('nhận biết switch đã ở chế độ nhận xét tự do', () => {
    expect(getStudentCommentManualActiveSelector()).toBe(
      'input.MuiSwitch-input[type="checkbox"]:checked',
    )
  })
})

describe('getStudentCommentModeFromAriaLabel', () => {
  it('nhận biết mode Area và Manual bằng nhãn tiếng Việt', () => {
    expect(getStudentCommentModeFromAriaLabel(
      'Đang ở chế độ nhận xét theo các tiêu chí, click để chuyển sang nhận xét tự do',
    )).toBe('area')
    expect(getStudentCommentModeFromAriaLabel(
      'Đang ở chế độ nhận xét tự do, click để chuyển sang nhận xét theo các tiêu chí',
    )).toBe('manual')
  })

  it('trả unknown khi LMS đổi nhãn ngoài các mode đã biết', () => {
    expect(getStudentCommentModeFromAriaLabel('Chế độ khác')).toBe('unknown')
  })
})

describe('getStudentCommentInitialEditorWaitMs', () => {
  it('cho Area editor đủ thời gian render trước khi thử click vùng hiển thị', () => {
    expect(getStudentCommentInitialEditorWaitMs()).toBe(15000)
  })
})

describe('isStudentCommentSaveConfirmed', () => {
  it('xác nhận đã lưu khi editor quay về trạng thái hiển thị dù popup còn mở', async () => {
    const saved = await isStudentCommentSaveConfirmed(async () => {})

    expect(saved).toBe(true)
  })

  it('không xác nhận đã lưu khi popup không tự đóng sau Save', async () => {
    const saved = await isStudentCommentSaveConfirmed(async () => {
      throw new Error('popup remained open')
    })

    expect(saved).toBe(false)
  })
})

describe('matchLmsCommentByStudentName', () => {
  const comments = [
    { studentName: 'Bảo An', text: 'Nhận xét Bảo An' },
    { studentName: 'An', text: 'Nhận xét An' },
  ]

  it('ưu tiên exact nên LMS "An" không lấy nhận xét của "Bảo An"', () => {
    expect(matchLmsCommentByStudentName(comments, 'An')?.text).toBe('Nhận xét An')
  })

  it('trả undefined khi partial khớp nhiều học sinh', () => {
    expect(matchLmsCommentByStudentName([
      { studentName: 'Nguyễn Văn An', text: 'Một' },
      { studentName: 'Trần Bảo An', text: 'Hai' },
    ], 'An')).toBeUndefined()
  })
})

describe('isStudentCommentContentEqual', () => {
  it('so sánh equality sau khi chuẩn hóa khoảng trắng', () => {
    expect(isStudentCommentContentEqual('  Tiến bộ\n đều  ', 'Tiến bộ đều')).toBe(true)
  })

  it('không coi chuỗi dài chỉ chứa expected là nội dung đã ghi đúng', () => {
    expect(isStudentCommentContentEqual('An tiến bộ', 'An')).toBe(false)
  })
})

describe('UpdateSlotComment GraphQL confirmation', () => {
  it('chỉ khớp request lưu nhận xét học sinh của LMS', () => {
    expect(isUpdateSlotCommentRequest(
      'https://lms-api.mindx.edu.vn/',
      JSON.stringify({ operationName: 'UpdateSlotComment' }),
    )).toBe(true)
    expect(isUpdateSlotCommentRequest(
      'https://lms-api.mindx.edu.vn/',
      JSON.stringify({ operationName: 'OtherMutation' }),
    )).toBe(false)
  })

  it('xác nhận response có updateSlotComment và không có GraphQL errors', () => {
    expect(isUpdateSlotCommentResponse(200, {
      data: { classes: { updateSlotComment: { id: 'class-1' } } },
    })).toBe(true)
    expect(isUpdateSlotCommentResponse(200, {
      errors: [{ message: 'Save failed' }],
    })).toBe(false)
    expect(isUpdateSlotCommentResponse(500, {
      data: { classes: { updateSlotComment: { id: 'class-1' } } },
    })).toBe(false)
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
    expect(makeLmsPostResult(['An'], ['Bình'], ['Bình', 'Lỗi'], ['An'])).toEqual({
      posted: ['An'],
      absentStudentNames: ['Bình'],
      skipped: ['Bình', 'Lỗi'],
      attendedStudentNames: ['An'],
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
