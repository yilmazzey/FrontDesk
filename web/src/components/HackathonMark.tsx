import pfizerOnDark from '../assets/brand/pfizer-on-dark.png'
import pfizerOnLight from '../assets/brand/pfizer-on-light.png'
import newpageOnDark from '../assets/brand/newpage-on-dark.png'
import newpageOnLight from '../assets/brand/newpage-on-light.png'

type Props = {
  suffix?: string
  compact?: boolean
  className?: string
}

export default function HackathonMark({
  suffix = 'Hackathon Challenge',
  compact = false,
  className = '',
}: Props) {
  return (
    <span
      className={`hackathonMark${compact ? ' hackathonMark--compact' : ''}${
        className ? ` ${className}` : ''
      }`}
    >
      <span className="hackathonMark__logos" role="img" aria-label="Pfizer and Newpage Solutions">
        <img
          className="hackathonMark__logo hackathonMark__logo--pfizer hackathonMark__onDark"
          src={pfizerOnDark}
          alt="Pfizer"
        />
        <img
          className="hackathonMark__logo hackathonMark__logo--pfizer hackathonMark__onLight"
          src={pfizerOnLight}
          alt="Pfizer"
        />
        <span className="hackathonMark__x" aria-hidden="true">
          ×
        </span>
        <img
          className="hackathonMark__logo hackathonMark__logo--newpage hackathonMark__onDark"
          src={newpageOnDark}
          alt="Newpage Solutions"
        />
        <img
          className="hackathonMark__logo hackathonMark__logo--newpage hackathonMark__onLight"
          src={newpageOnLight}
          alt="Newpage Solutions"
        />
      </span>
      {suffix ? (
        <span className="hackathonMark__suffix">
          <span className="hackathonMark__dot" aria-hidden="true">
            ·
          </span>
          {suffix}
        </span>
      ) : null}
    </span>
  )
}
