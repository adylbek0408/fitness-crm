import { Link } from 'react-router-dom'
import { BookOpen, Headphones, Play, CheckCircle2, ExternalLink, Clock } from 'lucide-react'
import FeedPostText from './FeedPostText'
import FeedPostAudio from './FeedPostAudio'
import FeedPostVideo from './FeedPostVideo'

function formatDuration(sec) {
  if (!sec) return null
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const TYPE_META = {
  video: { label: 'Видео',  Icon: Play,       bg: 'bg-sky-50',   text: 'text-sky-600',   border: 'border-sky-100'  },
  audio: { label: 'Аудио',  Icon: Headphones, bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100' },
  text:  { label: 'Текст',  Icon: BookOpen,   bg: 'bg-rose-50',  text: 'text-rose-600',  border: 'border-rose-100'  },
}

export default function FeedPost({ lesson }) {
  const meta = TYPE_META[lesson.lesson_type] || TYPE_META.text
  const { Icon } = meta
  const progress = lesson.progress?.percent || 0
  const completed = lesson.progress?.is_completed

  return (
    <article className="bg-white border-b border-gray-100 last:border-0">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${meta.bg} ${meta.border} border`}>
          <Icon size={16} className={meta.text} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-semibold text-gray-900 line-clamp-2 leading-snug">
            {lesson.title}
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] font-medium ${meta.text}`}>{meta.label}</span>
            {lesson.duration_sec > 0 && (
              <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                <Clock size={9} /> {formatDuration(lesson.duration_sec)}
              </span>
            )}
            {completed && (
              <span className="text-[10px] text-emerald-500 flex items-center gap-0.5">
                <CheckCircle2 size={10} /> Просмотрено
              </span>
            )}
          </div>
        </div>
        <Link
          to={`/cabinet/lessons/${lesson.id}`}
          className="shrink-0 p-3 rounded-xl text-gray-400 hover:text-rose-500 hover:bg-rose-50 transition"
          aria-label="Открыть урок"
        >
          <ExternalLink size={15} />
        </Link>
      </div>

      {/* Description */}
      {lesson.description && (
        <p className="px-4 pb-2 text-[12px] text-gray-500 leading-relaxed">{lesson.description}</p>
      )}

      {/* Content */}
      {lesson.lesson_type === 'video' && <FeedPostVideo lesson={lesson} />}
      {lesson.lesson_type === 'audio' && <FeedPostAudio lesson={lesson} />}
      {lesson.lesson_type === 'text'  && <FeedPostText  lesson={lesson} />}

      {/* Progress bar — only for in-progress lessons */}
      {progress > 0 && !completed && (
        <div className="px-4 pb-4">
          <div className="flex justify-between text-[10px] text-gray-400 mb-1">
            <span>Прогресс</span>
            <span className="text-rose-500 font-medium">{progress}%</span>
          </div>
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-rose-400 to-pink-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </article>
  )
}
