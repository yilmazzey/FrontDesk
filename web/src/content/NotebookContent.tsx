import { useState } from 'react'
import { Link } from 'react-router-dom'
import { site } from '../config'

/* ------------------------------------------------------------------ */
/* About                                                               */
/* ------------------------------------------------------------------ */

export function AboutSection() {
  return (
    <article className="leaf">
      <p className="leaf__kicker">01 · About</p>
      <h2 className="leaf__title">
        Built for the hours
        <br />
        <em>that actually matter.</em>
      </h2>

      <p className="leaf__standfirst">
        FrontDesk is our entry for the Pfizer &amp; Newpage Solutions Hackathon Challenge. We
        started with one rule: the tools should disappear the moment the work begins.
      </p>

      <div className="leaf__body">
        <p>
          Most software asks for your attention before it gives anything back. Notifications,
          badges, three-step onboarding, a tour you dismiss twice. We wanted the opposite — a
          workspace that behaves like a well-kept desk. Everything within reach. Nothing shouting.
        </p>
        <p>
          That idea shaped every decision here. The lamp is the light switch. The monitor is the
          product. The notebook holds the honest details: what this is, what it costs, and what we
          do with your data. No cookie wall, no newsletter popup, no dark patterns hiding in the
          footer.
        </p>
      </div>

      <dl className="ledger">
        <div>
          <dt>1</dt>
          <dd>place for the work</dd>
        </div>
        <div>
          <dt>0</dt>
          <dd>trackers on this page</dd>
        </div>
        <div>
          <dt>42</dt>
          <dd>minutes of focus, minimum</dd>
        </div>
      </dl>

      <div className="team">
        <p className="team__kicker">About us · who made the desk</p>
        <ul className="team__list">
          <li>
            <a href="https://www.linkedin.com/in/damlasanli/" target="_blank" rel="noreferrer">
              <span className="team__name">Damla Sanlı</span>
              <span className="team__link">LinkedIn ↗</span>
            </a>
          </li>
          <li>
            <a
              href="https://www.linkedin.com/in/anika-srivastava-00b032229/"
              target="_blank"
              rel="noreferrer"
            >
              <span className="team__name">Anika Srivastava</span>
              <span className="team__link">LinkedIn ↗</span>
            </a>
          </li>
          <li>
            <a href="https://www.linkedin.com/in/yilmazzey/" target="_blank" rel="noreferrer">
              <span className="team__name">Zeynep Yılmaz</span>
              <span className="team__link">LinkedIn ↗</span>
            </a>
          </li>
        </ul>
      </div>

      <p className="leaf__sign">— The FrontDesk team</p>
      <p className="leaf__small">
        Say hello at <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
      </p>
    </article>
  )
}

/* ------------------------------------------------------------------ */
/* Pricing                                                             */
/* ------------------------------------------------------------------ */

type Plan = {
  name: string
  monthly: number
  annual: number
  blurb: string
  cta: string
  featured?: boolean
}

const plans: Plan[] = [
  {
    name: 'Desk',
    monthly: 0,
    annual: 0,
    blurb: 'One person and a short list.',
    cta: 'Start free',
  },
  {
    name: 'Studio',
    monthly: 18,
    annual: 14,
    blurb: 'For people who ship.',
    cta: 'Open the app',
    featured: true,
  },
  {
    name: 'Team',
    monthly: 39,
    annual: 31,
    blurb: 'Small teams, fewer tickets.',
    cta: 'Talk to us',
  },
]

const features: [string, boolean, boolean, boolean][] = [
  ['One workspace', true, true, true],
  ['Unlimited notes', true, true, true],
  ['Focus timer', true, true, true],
  ['Local-first storage', true, true, true],
  ['Projects & timelines', false, true, true],
  ['Custom themes', false, true, true],
  ['Two devices synced', false, true, true],
  ['Shared notebook', false, false, true],
  ['Up to eight seats', false, false, true],
  ['Priority support', false, false, true],
]

export function PricingSection() {
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('annual')

  return (
    <article className="leaf leaf--wide">
      <p className="leaf__kicker">02 · Pricing</p>
      <h2 className="leaf__title">
        Simple rates.
        <br />
        <em>No line items.</em>
      </h2>

      <p className="leaf__standfirst">
        Start free, upgrade when the desk earns it. The calm is included on every plan — we don't
        charge extra for that.
      </p>

      <div className="rates__cycle" role="group" aria-label="Billing period">
        <button
          type="button"
          className={cycle === 'monthly' ? 'is-on' : ''}
          aria-pressed={cycle === 'monthly'}
          onClick={() => setCycle('monthly')}
        >
          Monthly
        </button>
        <span aria-hidden="true">/</span>
        <button
          type="button"
          className={cycle === 'annual' ? 'is-on' : ''}
          aria-pressed={cycle === 'annual'}
          onClick={() => setCycle('annual')}
        >
          Annual <span className="rates__save">−20%</span>
        </button>
      </div>

      <table className="rates">
        <caption className="sr-only">Plan comparison</caption>
        <thead>
          <tr>
            <th scope="col" className="rates__blank" />
            {plans.map((plan) => (
              <th key={plan.name} scope="col" className={plan.featured ? 'is-featured' : ''}>
                <span className="rates__name">{plan.name}</span>
                <span className="rates__blurb">{plan.blurb}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="rates__priceRow">
            <th scope="row">
              <span className="rates__per">per month</span>
            </th>
            {plans.map((plan) => (
              <td key={plan.name} className={plan.featured ? 'is-featured' : ''}>
                <span className="rates__price">
                  <span className="rates__currency">$</span>
                  {cycle === 'monthly' ? plan.monthly : plan.annual}
                </span>
              </td>
            ))}
          </tr>
          {features.map(([label, desk, studio, team]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{desk ? <span className="rates__yes">·</span> : <span className="rates__no">—</span>}</td>
              <td className={studio ? 'is-featured' : ''}>
                {studio ? <span className="rates__yes">·</span> : <span className="rates__no">—</span>}
              </td>
              <td>{team ? <span className="rates__yes">·</span> : <span className="rates__no">—</span>}</td>
            </tr>
          ))}
          <tr className="rates__ctaRow">
            <th scope="row" />
            {plans.map((plan) => (
              <td key={plan.name} className={plan.featured ? 'is-featured' : ''}>
                <Link
                  to={site.appHref}
                  className={`rates__cta${plan.featured ? ' is-primary' : ''}`}
                >
                  {plan.cta}
                </Link>
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <p className="leaf__small">
        Prices in USD. Annual plans are billed once a year. Cancel whenever — the notebook stays
        yours.
      </p>
    </article>
  )
}

/* ------------------------------------------------------------------ */
/* Privacy                                                             */
/* ------------------------------------------------------------------ */

export function PrivacySection() {
  return (
    <article className="leaf">
      <p className="leaf__kicker">03 · Privacy</p>
      <h2 className="leaf__title">
        Privacy,
        <br />
        <em>in plain language.</em>
      </h2>

      <p className="leaf__standfirst">
        Short version: we collect what's needed to run the product, and nothing else. This page is
        the whole policy, not a summary of one.
      </p>

      <ol className="clauses">
        <li>
          <h3>What we collect</h3>
          <p>
            Your email, a display name if you give us one, and the work you create inside FrontDesk.
            Basic technical logs — page loads, errors, rough region — are kept for fourteen days so
            we can notice when something breaks.
          </p>
        </li>
        <li>
          <h3>What we don't do</h3>
          <p>
            No advertising trackers. No session recording. No selling or renting data. No
            third-party pixels on this page. If we ever add analytics it will be aggregate,
            cookie-free and listed here before it ships.
          </p>
        </li>
        <li>
          <h3>Where your work lives</h3>
          <p>
            Notes and projects are stored encrypted at rest in the EU. Your account is protected
            with email-based sign-in; a passkey can be turned on from settings. Exports are plain
            Markdown at any time, without a support ticket.
          </p>
        </li>
        <li>
          <h3>Your controls</h3>
          <p>
            Delete a single note, a project, or the whole account from settings. Deletion is
            immediate in the interface and completed across backups within thirty days. You can
            download everything first — that's one button, not a form.
          </p>
        </li>
      </ol>

      <p className="leaf__sign">Questions?</p>
      <p className="leaf__small">
        Write to <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a> and a person
        answers, usually within two working days. Last updated {site.updated}.
      </p>
    </article>
  )
}
