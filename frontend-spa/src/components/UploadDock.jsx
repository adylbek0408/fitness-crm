import { useState } from 'react'
import {
  Upload, CheckCircle2, AlertCircle, X, ChevronDown, ChevronUp, Loader2, Ban,
} from 'lucide-react'
import { useUploads } from '../contexts/UploadContext'

/**
 * Floating Gmail-style upload dock.
 * Mounted once at App root. Renders nothing when the upload list is empty,
 * so it has zero footprint for users who never upload anything.
 *
 * UI behaviour:
 *   - Collapsed: single header line with overall progress + active count.
 *   - Expanded: scrollable list of individual upload cards.
 *   - Cards persist for ~5 s after success, indefinitely after failure
 *     (failed uploads have a manual dismiss button).
 *
 * Positioning: bottom-right with safe-area inset. On mobile the dock takes
 * almost the full width so progress text is readable; on desktop it's a
 * fixed 360 px panel.
 */

const stageLabel = (u) => {
  if (u.status === 'failed')    return u.error || 'Ошибка'
  if (u.status === 'cancelled') return 'Отменено'
  if (u.status === 'done')      return 'Готово'
  if (u.stage === 'init')        return 'Подготовка…'
  if (u.stage === 'finalizing')  return 'Финализация…'
  if (u.stage === 'thumbnail')   return 'Загружаем превью…'
  return `${u.progress}%`
}

const fmtSize = (bytes) => {
  if (!bytes) return ''
  const mb = bytes / 1024 / 1024
  return mb > 999 ? `${(mb / 1024).toFixed(1)} ГБ` : `${mb.toFixed(1)} МБ`
}

export default function UploadDock() {
  const { uploads, cancelUpload, removeUpload } = useUploads()
  const [collapsed, setCollapsed] = useState(false)

  if (uploads.length === 0) return null

  const active = uploads.filter(u => ['queued', 'uploading', 'finalizing'].includes(u.status))
  const failed = uploads.filter(u => u.status === 'failed')
  const done   = uploads.filter(u => u.status === 'done')
  // Aggregate progress weighted by file size (so a 2 GB upload at 50%
  // doesn't get drowned out by a 5 MB one at 100%).
  const totalSize = uploads.reduce((s, u) => s + (u.sizeBytes || 1), 0)
  const aggPct = Math.round(
    uploads.reduce((s, u) => s + (u.sizeBytes || 1) * (u.progress / 100), 0)
    / totalSize * 100
  )

  const headerLabel = active.length > 0
    ? `Загрузка уроков (${active.length})`
    : failed.length > 0
      ? `Ошибки загрузки (${failed.length})`
      : `Готово (${done.length})`

  return (
    <div
      role="region"
      aria-label="Фоновые загрузки"
      className="fixed z-[60] right-3 bottom-3 sm:right-5 sm:bottom-5 w-[min(94vw,360px)] rounded-2xl bg-white border border-rose-200 shadow-2xl overflow-hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full px-4 py-2.5 flex items-center gap-3 bg-gradient-to-r from-rose-50 to-pink-50 border-b border-rose-100 hover:from-rose-100/60 hover:to-pink-100/60 transition focus:outline-none"
      >
        {active.length > 0
          ? <Loader2 size={16} className="text-rose-500 animate-spin shrink-0" />
          : failed.length > 0
            ? <AlertCircle size={16} className="text-rose-500 shrink-0" />
            : <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
        }
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-semibold text-gray-900 truncate">{headerLabel}</p>
          {active.length > 0 && (
            <p className="text-[11px] text-gray-500 truncate">
              Общий прогресс: {aggPct}% · можно закрыть модалку
            </p>
          )}
        </div>
        {collapsed
          ? <ChevronUp size={16} className="text-gray-400 shrink-0" />
          : <ChevronDown size={16} className="text-gray-400 shrink-0" />
        }
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="max-h-[55dvh] overflow-y-auto divide-y divide-gray-100">
          {uploads.map(u => (
            <UploadItem
              key={u.id}
              u={u}
              onCancel={() => cancelUpload(u.id)}
              onDismiss={() => removeUpload(u.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function UploadItem({ u, onCancel, onDismiss }) {
  const isActive = ['queued', 'uploading', 'finalizing'].includes(u.status)
  const isFailed = u.status === 'failed'
  const isDone   = u.status === 'done'

  const barColor =
    isFailed ? 'from-rose-500 to-rose-600' :
    isDone   ? 'from-emerald-500 to-emerald-600' :
               'from-rose-500 to-pink-500'

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{u.title || u.filename}</p>
          <p className="text-[11px] text-gray-500 truncate">
            {fmtSize(u.sizeBytes)}{u.filename ? ' · ' + u.filename : ''}
          </p>
        </div>
        {isActive && (
          <button
            type="button"
            onClick={onCancel}
            title="Отменить загрузку"
            className="p-1.5 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 transition"
          >
            <Ban size={14} />
          </button>
        )}
        {!isActive && (
          <button
            type="button"
            onClick={onDismiss}
            title="Скрыть"
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-50 transition"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${barColor} transition-all duration-300`}
          style={{ width: `${u.progress}%` }}
        />
      </div>

      <div className="mt-1 flex items-center justify-between gap-2">
        <span className={`text-[11px] ${isFailed ? 'text-rose-600 font-medium' : 'text-gray-500'} truncate`}>
          {stageLabel(u)}
        </span>
        {isActive && <span className="text-[11px] text-gray-400 tabular-nums">{u.progress}%</span>}
        {isDone && <span className="text-[11px] text-emerald-600 inline-flex items-center gap-1">
          <CheckCircle2 size={11} /> Загружено
        </span>}
      </div>
    </div>
  )
}
