import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Info, MoreHorizontal, X } from 'lucide-react'

export function Avatar({ item, large = false, className = '' }) {
  return (
    <span
      className={`avatar avatar-${item?.color || 'neutral'} ${
        large ? 'large' : ''
      } ${className}`.trim()}
    >
      {item?.initials || '?'}
    </span>
  )
}

export function Modal({
  title,
  description,
  onClose,
  children,
  className = '',
  labelledBy,
}) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="modal-shade"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.()
      }}
    >
      <section
        className={`modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        {(title || description) && (
          <header>
            <div>
              {title && <h2 id={labelledBy}>{title}</h2>}
              {description && <p>{description}</p>}
            </div>
            {onClose && (
              <button aria-label="Cerrar" onClick={onClose}>
                <X size={18} />
              </button>
            )}
          </header>
        )}
        {children}
      </section>
    </div>
  )
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal title={title} description={description} onClose={onCancel}>
      <div className="modal-actions">
        <button type="button" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        <button
          className={`button ${danger ? 'danger' : 'primary'}`}
          type="button"
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? 'Procesando…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

export function ActionMenu({
  items,
  label = 'Más opciones',
  align = 'right',
  icon: Icon = MoreHorizontal,
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(event) {
      if (!wrap.current?.contains(event.target)) setOpen(false)
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const visible = items.filter((item) => item && !item.hidden)
  if (!visible.length) return null

  return (
    <div className="action-menu-wrap" ref={wrap}>
      <button
        type="button"
        className="icon-button"
        aria-label={label}
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon size={16} />
      </button>
      {open && (
        <div
          className="action-menu"
          style={align === 'left' ? { left: 0, right: 'auto' } : undefined}
          role="menu"
        >
          {visible.map((item, index) =>
            item.separator ? (
              <hr key={`sep-${index}`} />
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={item.danger ? 'danger' : ''}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false)
                  item.onClick?.()
                }}
              >
                {item.icon && <item.icon size={14} />}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="stream-empty">
      {Icon && <Icon size={26} />}
      <strong>{title}</strong>
      {description && <span>{description}</span>}
      {action}
    </div>
  )
}

export function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => {
        const Icon =
          toast.tone === 'error'
            ? AlertTriangle
            : toast.tone === 'success'
              ? Check
              : Info
        return (
          <div key={toast.id} className={`toast ${toast.tone || 'info'}`}>
            <Icon size={16} />
            <div>
              <strong>{toast.title}</strong>
              {toast.message && <small>{toast.message}</small>}
            </div>
            <button
              type="button"
              aria-label="Cerrar notificación"
              onClick={() => onDismiss(toast.id)}
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
