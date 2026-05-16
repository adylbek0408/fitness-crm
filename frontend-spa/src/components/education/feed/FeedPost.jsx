import { Link } from 'react-router-dom'
import { CheckCircle2, ExternalLink } from 'lucide-react'
import FeedPostText from './FeedPostText'
import FeedPostAudio from './FeedPostAudio'
import FeedPostVideo from './FeedPostVideo'

const TYPE_COLOR = { video: '#0ea5e9', audio: '#f59e0b', text: '#e11d48' }
const TYPE_LABEL = { video: 'Видео',  audio: 'Аудио',  text: 'Текст'  }

function formatTime(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export default function ChatBubble({ lesson }) {
  const color    = TYPE_COLOR[lesson.lesson_type] || TYPE_COLOR.text
  const label    = TYPE_LABEL[lesson.lesson_type] || 'Урок'
  const completed = lesson.progress?.is_completed
  const progress  = lesson.progress?.percent || 0
  const time      = formatTime(lesson.published_at || lesson.created_at)

  return (
    <div className="flex items-end mb-1.5 pl-3">
      {/*
        Outer wrapper holds both the SVG tail and the bubble.
        filter:drop-shadow is applied here so the shadow wraps BOTH shapes,
        making them look like a single connected element.
        No overflow-hidden here — that lives only on the inner bubble div.
      */}
      <div
        className="relative"
        style={{
          maxWidth: 'min(88%, 480px)',
          minWidth: '200px',
          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.14))',
        }}
      >
        {/*
          TG-style incoming-message tail.
          SVG path: right-angle triangle (bottom-right, top-right, bottom-left).
          Placed at bottom-left of the wrapper, extending 9 px to the left.
          Fills white to match the bubble background.
        */}
        <svg
          aria-hidden="true"
          style={{ position: 'absolute', bottom: 0, left: -9, display: 'block', zIndex: 1 }}
          width="10"
          height="16"
          viewBox="0 0 10 16"
          fill="white"
        >
          <path d="M10 0 L10 16 L0 16 Z" />
        </svg>

        {/* ── Bubble ── */}
        <div
          className="bg-white overflow-hidden relative z-10"
          style={{ borderRadius: '4px 16px 16px 16px' }}
        >
          {/* Header */}
          <div className="flex items-start gap-2 px-3.5 pt-2.5 pb-1.5">
            <div className="flex-1 min-w-0">
              <span
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color }}
              >
                {label}
              </span>
              <h3 className="text-[14px] font-semibold text-gray-900 leading-snug mt-0.5">
                {lesson.title}
              </h3>
              {lesson.description && (
                <p className="text-[12px] text-gray-400 leading-snug mt-0.5 line-clamp-1">
                  {lesson.description}
                </p>
              )}
            </div>
            <Link
              to={`/cabinet/lessons/${lesson.id}`}
              className="shrink-0 mt-0.5 p-2 rounded-xl text-gray-300 hover:text-rose-500 hover:bg-rose-50 transition"
              aria-label="Открыть урок"
            >
              <ExternalLink size={14} />
            </Link>
          </div>

          {/* Divider between header and content */}
          {(lesson.lesson_type === 'text' || lesson.lesson_type === 'audio') && (
            <div className="h-px bg-gray-100 mx-3.5" />
          )}

          {/* Content */}
          {lesson.lesson_type === 'video' && <FeedPostVideo lesson={lesson} />}
          {lesson.lesson_type === 'audio' && <FeedPostAudio lesson={lesson} />}
          {lesson.lesson_type === 'text'  && <FeedPostText  lesson={lesson} />}

          {/* Footer: optional progress bar + timestamp + done check */}
          <div className="flex items-center gap-2 px-3.5 pb-2 pt-1">
            {progress > 0 && !completed && (
              <div className="flex-1 h-0.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${progress}%`, background: color }}
                />
              </div>
            )}
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-[10px] text-gray-400 tabular-nums">{time}</span>
              {completed && <CheckCircle2 size={12} className="text-emerald-400" />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
