import { ArrowUp, Image, Plus, Video, X } from 'lucide-react'
import { NodeMedia, NodeMediaType } from '../types'
import { createMediaId } from '../utils/media'

interface NodeMediaFieldsProps {
  media: NodeMedia[]
  onChange: (media: NodeMedia[]) => void
  compact?: boolean
  label?: string
  hint?: string
  inputClassName?: string
  selectClassName?: string
}

const defaultInput =
  'w-full px-3 py-2 text-sm text-slate-100 rounded-lg outline-none transition-all bg-[#0b1020]/95 border border-white/12 placeholder:text-slate-500 focus:border-white/25 focus:bg-[#111827]'

function blankMedia(type: NodeMediaType = 'image'): NodeMedia {
  return { id: createMediaId(), type, url: '' }
}

function mediaUrlIssue(url: string) {
  const trimmed = url.trim()
  if (!trimmed) return 'empty'
  if (/^(https?:|data:image\/|data:video\/|blob:|\/)/i.test(trimmed)) return null
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? null : 'invalid'
  } catch {
    return 'invalid'
  }
}

export default function NodeMediaFields({
  media,
  onChange,
  compact = false,
  label = 'Media',
  hint = 'First item is the main image/video; extras appear underneath.',
  inputClassName = defaultInput,
  selectClassName = defaultInput + ' cursor-pointer',
}: NodeMediaFieldsProps) {
  function update(index: number, patch: Partial<NodeMedia>) {
    onChange(media.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  function commitUrl(index: number, raw: string) {
    const trimmed = raw.trim()
    if (!trimmed && media.length > 1) {
      remove(index)
      return
    }
    update(index, { url: trimmed })
  }

  function add(type: NodeMediaType = 'image') {
    onChange([...media, blankMedia(type)])
  }

  function remove(index: number) {
    onChange(media.filter((_, i) => i !== index))
  }

  function makeMain(index: number) {
    if (index === 0) return
    const next = [...media]
    const [item] = next.splice(index, 1)
    onChange([item, ...next])
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className={compact ? 'text-[10px] text-slate-500' : 'text-xs font-medium text-slate-400'}>
            {label}
          </span>
          {hint && <p className="mt-0.5 text-[10px] leading-snug text-slate-600">{hint}</p>}
        </div>
        <button
          type="button"
          onClick={() => add()}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-slate-200 bg-white/8 hover:bg-white/12 border border-white/10 transition-colors"
        >
          <Plus size={12} />
          Add
        </button>
      </div>

      {media.length === 0 ? (
        <button
          type="button"
          onClick={() => add()}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/12 bg-slate-950/40 px-3 py-3 text-[11px] text-slate-500 hover:text-slate-300 hover:border-white/20 transition-colors"
        >
          <Image size={13} />
          Add main image/video
        </button>
      ) : (
        <div className="space-y-2">
          {media.map((item, index) => {
            const issue = mediaUrlIssue(item.url)
            const invalid = issue === 'invalid'
            return (
              <div
                key={item.id ?? index}
                className="rounded-xl border border-white/10 bg-slate-950/55 p-2.5 space-y-2"
              >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  {index === 0 ? 'Main' : `Sub ${index}`}
                </span>
                <div className="flex items-center gap-1">
                  {index > 0 && (
                    <button
                      type="button"
                      onClick={() => makeMain(index)}
                      title="Make main media"
                      className="p-1.5 rounded-md text-slate-500 hover:text-slate-200 hover:bg-white/8 transition-colors"
                    >
                      <ArrowUp size={12} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    title="Remove media"
                    className="p-1.5 rounded-md text-slate-500 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>

              <div className={compact ? 'grid grid-cols-[6.5rem_1fr] gap-2' : 'grid grid-cols-[7.5rem_1fr] gap-2'}>
                <select
                  className={selectClassName}
                  value={item.type}
                  onChange={(e) => update(index, { type: e.target.value as NodeMediaType })}
                >
                  <option value="image" className="bg-[#0b1020] text-slate-100">Image</option>
                  <option value="video" className="bg-[#0b1020] text-slate-100">Video</option>
                </select>
                <div className="relative">
                  {item.type === 'video' ? (
                    <Video size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                  ) : (
                    <Image size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                  )}
                  <input
                    className={`${inputClassName} pl-8 ${invalid ? 'border-red-400/60 focus:border-red-300' : ''}`}
                    value={item.url}
                    onChange={(e) => update(index, { url: e.target.value })}
                    onBlur={(e) => commitUrl(index, e.target.value)}
                    placeholder={item.type === 'video' ? 'https://...mp4 / YouTube / Vimeo' : 'https://...'}
                  />
                </div>
              </div>
              {invalid && (
                <p className="text-[10px] leading-snug text-red-300">
                  Add a valid http(s), local, data, or blob URL.
                </p>
              )}
              {issue === 'empty' && index > 0 && (
                <p className="text-[10px] leading-snug text-slate-600">
                  Empty media rows are ignored.
                </p>
              )}
            </div>
          )})}
        </div>
      )}
    </div>
  )
}
