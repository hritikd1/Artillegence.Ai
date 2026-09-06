/**
 * Toast.tsx — Professional toast notification system for Artillegence AI
 * Supports: success, error, warning, info types with auto-dismiss and animations
 */
import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react'
import { X, CheckCircle2, AlertTriangle, AlertCircle, Info } from 'lucide-react'

interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  duration?: number
}

interface ToastContextType {
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

const ICONS = {
  success: <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0" />,
  error: <AlertCircle size={18} className="text-rose-400 flex-shrink-0" />,
  warning: <AlertTriangle size={18} className="text-amber-400 flex-shrink-0" />,
  info: <Info size={18} className="text-sky-400 flex-shrink-0" />,
}

const BORDER_COLORS = {
  success: 'border-l-emerald-500',
  error: 'border-l-rose-500',
  warning: 'border-l-amber-500',
  info: 'border-l-sky-500',
}

const GLOW_COLORS = {
  success: 'shadow-[0_0_15px_rgba(16,185,129,0.15)]',
  error: 'shadow-[0_0_15px_rgba(244,63,94,0.15)]',
  warning: 'shadow-[0_0_15px_rgba(245,158,11,0.15)]',
  info: 'shadow-[0_0_15px_rgba(56,189,248,0.15)]',
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    const duration = toast.duration ?? 5000
    const timer = setTimeout(() => {
      setIsExiting(true)
      setTimeout(() => onRemove(toast.id), 300)
    }, duration)
    return () => clearTimeout(timer)
  }, [toast, onRemove])

  const handleClose = () => {
    setIsExiting(true)
    setTimeout(() => onRemove(toast.id), 300)
  }

  return (
    <div
      className={`
        relative flex items-start gap-3 px-4 py-3 rounded-lg border border-slate-800/80
        bg-slate-950/95 backdrop-blur-xl border-l-4 ${BORDER_COLORS[toast.type]} ${GLOW_COLORS[toast.type]}
        transition-all duration-300 ease-out min-w-[320px] max-w-[440px]
        ${isExiting ? 'opacity-0 translate-x-8 scale-95' : 'opacity-100 translate-x-0 scale-100'}
      `}
      style={{ animation: isExiting ? 'none' : 'slideInRight 0.3s ease-out' }}
    >
      <div className="mt-0.5">{ICONS[toast.type]}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-white tracking-wide">{toast.title}</p>
        {toast.message && (
          <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{toast.message}</p>
        )}
      </div>
      <button
        onClick={handleClose}
        className="text-slate-600 hover:text-slate-300 transition flex-shrink-0 mt-0.5 cursor-pointer"
      >
        <X size={14} />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setToasts(prev => [...prev.slice(-4), { ...toast, id }]) // Keep max 5
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      {/* Toast Container — fixed bottom-right */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col-reverse gap-3 pointer-events-auto">
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
