interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element {
  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={onCancel}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>{cancelLabel}</button>
          <button className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
