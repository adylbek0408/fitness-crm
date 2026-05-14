import { useMemo, useState } from 'react'
import { Search, Users, CheckSquare, Square } from 'lucide-react'

/**
 * Reusable groups multi-select with search + select-all / clear-all.
 * Used in lesson upload, lesson edit, stream create, stream edit modals.
 *
 * Props:
 *   - groups: [{ id, number, trainer? }]
 *   - value: string[] of selected group ids
 *   - onChange: (ids: string[]) => void
 *   - accent: 'rose' | 'purple' | 'violet' — controls highlight colour
 *   - emptyText: shown when groups array is empty (loading state)
 *   - className: optional extra classes on the outer wrapper
 *
 * Performance note: filters are client-side, so the parent should already
 * have fetched all relevant groups (page_size=200 is the existing pattern).
 */
const ACCENTS = {
  rose:   { ring: 'focus:ring-rose-300',   chip: 'bg-rose-50 text-rose-700',     text: 'text-rose-600 hover:text-rose-800',     check: 'text-rose-500' },
  purple: { ring: 'focus:ring-purple-300', chip: 'bg-purple-50 text-purple-700', text: 'text-purple-600 hover:text-purple-800', check: 'text-purple-500' },
  violet: { ring: 'focus:ring-violet-300', chip: 'bg-violet-50 text-violet-700', text: 'text-violet-600 hover:text-violet-800', check: 'text-violet-500' },
}

export default function GroupPicker({
  groups,
  value,
  onChange,
  accent = 'rose',
  emptyText = 'Группы загружаются…',
  className = '',
  maxHeight = 'max-h-56',
}) {
  const [q, setQ] = useState('')
  const a = ACCENTS[accent] || ACCENTS.rose

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return groups
    return groups.filter(g => {
      const num = String(g.number ?? '').toLowerCase()
      const trainer = g.trainer
        ? `${g.trainer.first_name || ''} ${g.trainer.last_name || ''}`.toLowerCase()
        : ''
      return num.includes(needle) || trainer.includes(needle)
        || `группа ${num}`.includes(needle)
    })
  }, [groups, q])

  const selectedSet = useMemo(() => new Set(value || []), [value])
  const allFilteredIds = filtered.map(g => g.id)
  const allFilteredSelected = allFilteredIds.length > 0
    && allFilteredIds.every(id => selectedSet.has(id))

  const toggle = (id) => {
    if (selectedSet.has(id)) onChange((value || []).filter(x => x !== id))
    else onChange([...(value || []), id])
  }

  const selectAllFiltered = () => {
    if (allFilteredSelected) {
      // Unselect only the filtered subset — preserve any out-of-filter
      // selections so a "Group 5" remains picked when the user later
      // searches for "Group 10" and clicks "снять".
      const filteredSet = new Set(allFilteredIds)
      onChange((value || []).filter(x => !filteredSet.has(x)))
    } else {
      const next = new Set(value || [])
      for (const id of allFilteredIds) next.add(id)
      onChange([...next])
    }
  }

  return (
    <div className={className}>
      {groups.length > 5 && (
        <div className="relative mb-2">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Поиск по номеру или тренеру…"
            aria-label="Поиск групп"
            className={`w-full pl-7 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 ${a.ring}`}
          />
        </div>
      )}

      <div className={`rounded-xl border border-gray-200 ${maxHeight} overflow-y-auto p-2 space-y-1`}>
        {groups.length === 0 && (
          <p className="text-xs text-gray-400 p-2">{emptyText}</p>
        )}
        {groups.length > 0 && filtered.length === 0 && (
          <p className="text-xs text-gray-400 p-2">Ничего не найдено по «{q}»</p>
        )}
        {filtered.map(g => {
          const checked = selectedSet.has(g.id)
          return (
            <label
              key={g.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-sm transition ${
                checked ? a.chip : 'hover:bg-gray-50'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(g.id)}
                className={`rounded ${a.check} ${a.ring}`}
              />
              <span className="font-medium">Группа {g.number}</span>
              {g.trainer && (
                <span className="text-xs text-gray-400 truncate">
                  · {g.trainer.first_name} {g.trainer.last_name}
                </span>
              )}
            </label>
          )
        })}
      </div>

      {/* Footer: selection counters + select-all-filtered toggle.
          Hidden when there's nothing to act on so the picker stays tight
          for small group lists. */}
      {(filtered.length > 0 || (value?.length ?? 0) > 0) && (
        <div className="mt-1.5 flex items-center justify-between text-xs gap-2">
          <span className="text-gray-400">
            Выбрано: <strong className="text-gray-700">{value?.length || 0}</strong>
            {q && ` · найдено: ${filtered.length}`}
          </span>
          {filtered.length > 0 && (
            <button
              type="button"
              onClick={selectAllFiltered}
              className={`inline-flex items-center gap-1 font-medium ${a.text} hover:underline`}
            >
              {allFilteredSelected
                ? <><Square size={11} /> Снять {q ? 'найденные' : 'все'}</>
                : <><CheckSquare size={11} /> Выбрать {q ? 'найденные' : 'все'}</>}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Small helper for the field label — keeps consistent visual style across
 *  modals where the picker is reused. Optional; modals can render their own. */
export function GroupPickerLabel({ icon: Icon = Users, children }) {
  return (
    <label className="block text-xs text-gray-500 font-medium mb-1 flex items-center gap-1">
      <Icon size={12} /> {children}
    </label>
  )
}
