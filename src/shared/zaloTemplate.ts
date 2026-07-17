export interface ZaloTemplateData {
  ten_lop: string
  ngay_buoi_hoc: string
  noi_dung_bai_hoc: string
  danh_sach_nhan_xet: string
  bai_tap_ve_nha: string
}

/** Thay {key} bằng data[key]; giữ nguyên {key} nếu không có trong data. */
export function fillTemplate(template: string, data: ZaloTemplateData): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in data ? String(data[key as keyof ZaloTemplateData]) : match,
  )
}

/** Mỗi học sinh một dòng "Tên: nhận xét". */
export function formatCommentLines(items: { name: string; text: string }[]): string {
  return items.map(i => `${i.name}: ${i.text}`).join('\n')
}

/** ISO 8601 -> "dd/mm/yyyy HH:mm"; chuỗi rỗng nếu iso rỗng/không hợp lệ. */
export function formatSessionDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
