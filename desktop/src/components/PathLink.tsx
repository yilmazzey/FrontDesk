import type { ReactNode } from 'react'
import { api } from '../lib/ipc'

type Props = {
  path: string
  children?: ReactNode
  className?: string
}

/** A file or folder path that reveals itself in Finder / Explorer on click. */
export default function PathLink({ path, children, className = '' }: Props) {
  return (
    <button
      type="button"
      className={`pathLink ${className}`.trim()}
      title="Reveal in Finder"
      onClick={() => void api.revealPath(path)}
    >
      {children ?? path}
    </button>
  )
}
