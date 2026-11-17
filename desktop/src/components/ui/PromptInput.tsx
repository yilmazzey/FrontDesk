import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'

type Ripple = { x: number; y: number; id: number }

export type PromptInputProps = {
  initialValue?: string
  placeholder?: string
  onSubmit?: (value: string) => void
  disabled?: boolean
  className?: string
  textColor?: string
  backgroundOpacity?: number
  showEffects?: boolean
}

export default function PromptInput({
  initialValue = '',
  placeholder = 'Ask FrontDesk',
  onSubmit,
  disabled = false,
  className = '',
  textColor = 'var(--ink)',
  backgroundOpacity = 0.08,
  showEffects = true,
}: PromptInputProps) {
  const [value, setValue] = useState(initialValue)
  const [ripples, setRipples] = useState<Ripple[]>([])
  const [pointer, setPointer] = useState({ x: 50, y: 50 })
  const shellRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const throttleRef = useRef<number | null>(null)

  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  useEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = 'auto'
    const lineHeight = 22
    const maxHeight = lineHeight * 4 + 16
    textareaRef.current.style.height = `${Math.min(
      textareaRef.current.scrollHeight,
      maxHeight,
    )}px`
  }, [value])

  const submit = useCallback(() => {
    const text = value.trim()
    if (!text || disabled) return
    onSubmit?.(text)
    setValue('')
  }, [disabled, onSubmit, value])

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault()
      submit()
    },
    [submit],
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        submit()
      }
    },
    [submit],
  )

  const handleMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!showEffects || !shellRef.current || throttleRef.current) return
      throttleRef.current = window.setTimeout(() => {
        const rect = shellRef.current?.getBoundingClientRect()
        if (rect) {
          setPointer({
            x: ((event.clientX - rect.left) / rect.width) * 100,
            y: ((event.clientY - rect.top) / rect.height) * 100,
          })
        }
        throttleRef.current = null
      }, 60)
    },
    [showEffects],
  )

  const handleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!showEffects || !shellRef.current || ripples.length >= 4) return
      const rect = shellRef.current.getBoundingClientRect()
      const id = Date.now()
      setRipples((current) => [
        ...current,
        { x: event.clientX - rect.left, y: event.clientY - rect.top, id },
      ])
      window.setTimeout(() => {
        setRipples((current) => current.filter((ripple) => ripple.id !== id))
      }, 600)
    },
    [ripples.length, showEffects],
  )

  const style = {
    '--prompt-x': `${pointer.x}%`,
    '--prompt-y': `${pointer.y}%`,
    '--prompt-bg': `rgba(255, 255, 255, ${backgroundOpacity})`,
    color: textColor,
  } as CSSProperties

  return (
    <form
      className={`promptInput ${className}`.trim()}
      onSubmit={handleSubmit}
      aria-label="Ask FrontDesk"
    >
      <div
        ref={shellRef}
        className="promptInput__shell"
        style={style}
        onMouseMove={handleMove}
        onClick={handleClick}
      >
        {showEffects ? (
          <>
            <span className="promptInput__glow" aria-hidden="true" />
            <span className="promptInput__shimmer" aria-hidden="true" />
            {ripples.map((ripple) => (
              <span
                key={ripple.id}
                className="promptInput__ripple"
                style={{ left: ripple.x, top: ripple.y }}
                aria-hidden="true"
              />
            ))}
          </>
        ) : null}

        <textarea
          ref={textareaRef}
          className="promptInput__textarea"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label="Message input"
          rows={1}
          autoFocus
          disabled={disabled}
          style={{ color: textColor }}
        />

        <button
          type="submit"
          className="promptInput__send"
          disabled={disabled || !value.trim()}
          aria-label="Send message"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 19V5M12 5l-5 5M12 5l5 5" />
          </svg>
        </button>
      </div>
    </form>
  )
}
