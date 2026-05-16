import { Link } from 'react-router-dom'
import { CheckCircle2, ExternalLink } from 'lucide-react'
import FeedPostText from './FeedPostText'
import FeedPostAudio from './FeedPostAudio'
import FeedPostVideo from './FeedPostVideo'

const TYPE_COLOR = {
  video: '#0ea5e9',
  audio: '#f59e0b',
  text:  '#e11d48',
}
const TYPE_LABEL = { video: 'Видео', audio: 'Аудио', text: 'Текст' }

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
    <div className="flex items-end gap-1 mb-1 pl-1">
      {/* Tiny dot — hint of the bubble "origin" without complex tail geometry */}
      <div
        className="w-2 h-2 rounded-full shrink-0 mb-1.5"
        style={{ background: 'rgba(255,255,255,0.75)' }}
      />

      {/* Bubble */}
      <div
        className="bg-white overflow-hidden"
        style={{
          maxWidth: '88%',
          minWidth: '180px',
          borderRadius: '4px 16px 16px 16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
        }}
      >
        {/* ── Header ── */}
        <div className="flex items-start gap-2 px-3 pt-2.5 pb-1.5">
          <div className="flex-1 min-w-0">
            <span
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color }}
            >
              {label}
            </span>
            <h3 className="text-[14px] font-semibold text-gray-900 leading-snug mt-0.5">
              {lesson.title}
            </h3>
            {lesson.description && (
              <p className="text-[12px] text-gray-500 leading-snug mt-0.5 line-clamp-2">
                {lesson.description}
              </p>
            )}
          </div>
          <Link
            to={`/cabinet/lessons/${lesson.id}`}
            className="shrink-0 mt-0.5 p-1.5 rounded-lg text-gray-300 hover:text-rose-500 hover:bg-rose-50 transition"
            aria-label="Открыть урок"
          >
            <ExternalLink size={14} />
          </Link>
        </div>

        {/* ── Content ── */}
        {lesson.lesson_type === 'video' && <FeedPostVideo lesson={lesson} />}
        {lesson.lesson_type === 'audio' && <FeedPostAudio lesson={lesson} />}
        {lesson.lesson_type === 'text'  && <FeedPostText  lesson={lesson} />}

        {/* ── Footer: progress + timestamp + done-check ── */}
        <div className="flex items-center gap-2 px-3 pb-2 pt-0.5">
          {progress > 0 && !completed && (
            <div className="flex-1 h-0.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${progress}%`, background: color }}
              />
            </div>
          )}
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-[10px] text-gray-400">{time}</span>
            {completed && <CheckCircle2 size={12} className="text-emerald-400" />}
          </div>
        </div>
      </div>
    </div>
  )
}
