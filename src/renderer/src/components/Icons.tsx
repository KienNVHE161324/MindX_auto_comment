interface IconProps {
  size?: number
}

/** Icon bút chì (Sửa) — nét đơn sắc, kế thừa currentColor. */
export function EditIcon({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h4L18.5 9.5a2 2 0 0 0-2.83-2.83L5 17.5 4 20Z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  )
}

/** Icon thùng rác (Xóa) — nét đơn sắc, kế thừa currentColor. */
export function TrashIcon({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

/** Icon mũi tên trái (Quay lại). */
export function ArrowLeftIcon({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

/** Icon sao chép (Sao chép buổi trước). */
export function CopyIcon({ size = 15 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </svg>
  )
}
