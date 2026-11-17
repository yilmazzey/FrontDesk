import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  category,
  dayLabel,
  linkMeeting,
  sourceDate,
  timeLabel,
} from '../lib/timeline'
import type { SourceRef } from '../types/source'

type Props = {
  sources: SourceRef[]
}

export default function TimelinePreview({ sources }: Props) {
  const meetings = useMemo(
    () => sources.filter((source) => source.kind === 'calendar'),
    [sources],
  )

  const recent = useMemo(
    () =>
      sources
        .filter((source) => sourceDate(source))
        .sort(
          (left, right) => (sourceDate(right)?.getTime() ?? 0) - (sourceDate(left)?.getTime() ?? 0),
        )
        .slice(0, 6),
    [sources],
  )

  return (
    <section className="panel timelinePreview" aria-labelledby="recent-timeline">
      <header className="panel__head">
        <h2 id="recent-timeline" className="panel__title">
          Recent timeline
        </h2>
        <Link className="panel__meta panel__link" to="/timeline">
          View timeline →
        </Link>
      </header>

      {recent.length ? (
        <ul className="timelinePreview__list">
          {recent.map((source) => {
            const date = sourceDate(source)
            const link = linkMeeting(source, meetings)
            return (
              <li key={source.id} className="timelinePreview__row">
                <span className="timelinePreview__when">
                  {date ? `${dayLabel(date)} · ${timeLabel(date)}` : 'Undated'}
                </span>
                <span className="timelinePreview__body">
                  <strong>{source.title}</strong>
                  <em>
                    {category(source)}
                    {link ? ` · linked to ${link.meeting.title}` : ''}
                  </em>
                </span>
                <span className="tag">{category(source)}</span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="panel__note">
          Grant a folder in <Link to="/access">Access</Link> or connect Microsoft 365 in{' '}
          <Link to="/settings">Settings</Link> to start the timeline.
        </p>
      )}
    </section>
  )
}
