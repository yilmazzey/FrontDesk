import { site } from '../config'

/* ------------------------------------------------------------------ */
/* About                                                               */
/* ------------------------------------------------------------------ */

type PersonKey = 'anika' | 'zeynep'

const team: Record<
  PersonKey,
  {
    first: string
    last: string
    initials: string
    role: string
    email: string
    linkedin: string
    intro: string
    background: string
    work: string
  }
> = {
  anika: {
    first: 'Anika',
    last: 'Srivastava',
    initials: 'AS',
    role: 'MSc Engineering · University of Bristol',
    email: 'anika.s.2026@bristol.ac.uk',
    linkedin: 'https://www.linkedin.com/in/anika-srivastava-00b032229/',
    intro:
      'Anika works where product design meets applied machine learning. She studied computer science and AI before moving to Bristol for her MSc.',
    background:
      'MSc Engineering at the University of Bristol. Previous work spans computer science, AI and machine learning, with a focus on Python and applied models.',
    work:
      'On FrontDesk she shaped the interface and visual system, from the landing page to the desktop shell.',
  },
  zeynep: {
    first: 'Zeynep',
    last: 'Yılmaz',
    initials: 'ZY',
    role: 'MSc Engineering with AI · University of Bristol',
    email: 'sn26265@bristol.ac.uk',
    linkedin: 'https://www.linkedin.com/in/yilmazzey/',
    intro:
      'Zeynep is a Think Big Scholar at the University of Bristol, working across engineering, AI and local-first software.',
    background:
      'MSc Engineering with AI at the University of Bristol. Previously Computer Engineering and Data Science & AI at MEF University.',
    work:
      'On FrontDesk she built the local Rust core, the retrieval pipeline and the Microsoft Graph integration.',
  },
}

export function AboutPerson({ person }: { person: PersonKey }) {
  const profile = team[person]
  return (
    <article className="leaf aboutPerson">
      <p className="leaf__kicker">{person === 'anika' ? '01 · About us' : '02 · About us'}</p>

      <div className="aboutPerson__head">
        <div className="aboutPerson__portrait" aria-hidden="true">
          <span>{profile.initials}</span>
        </div>
        <div className="aboutPerson__intro">
          <h2 className="leaf__title">
            {profile.first}
            <br />
            <em>{profile.last}</em>
          </h2>
          <p className="aboutPerson__role">{profile.role}</p>
          <div className="aboutPerson__links">
            <a href={`mailto:${profile.email}`}>{profile.email}</a>
            <a href={profile.linkedin} target="_blank" rel="noreferrer">
              LinkedIn ↗
            </a>
          </div>
        </div>
      </div>

      <p className="leaf__standfirst">{profile.intro}</p>

      <div className="aboutPerson__facts">
        <div>
          <span>Background</span>
          <p>{profile.background}</p>
        </div>
        <div>
          <span>On FrontDesk</span>
          <p>{profile.work}</p>
        </div>
      </div>
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
        <em>by architecture.</em>
      </h2>

      <p className="leaf__standfirst">
        FrontDesk is a local-first desktop app. There is no FrontDesk account, no FrontDesk cloud
        and no analytics service in the loop. This page describes every place data can go.
      </p>

      <ol className="clauses">
        <li>
          <h3>What the app reads</h3>
          <p>
            Only the sources you grant: local folders, Outlook mail, the Microsoft calendar and
            OneNote. Microsoft Graph access is read-only and can be revoked from Settings at any
            time.
          </p>
        </li>
        <li>
          <h3>What stays on this machine</h3>
          <p>
            Source text is read when you ask a question and is not copied into the app data folder.
            FrontDesk stores grant metadata, settings and a local semantic index of derived
            embeddings. Saved answers are written only to the folder you choose, as Markdown.
          </p>
        </li>
        <li>
          <h3>What can leave the machine</h3>
          <p>
            Microsoft Graph requests go to Microsoft with your read-only token. If you enable web
            search, the question alone is sent to Bing; notes, mail, calendar and OneNote content
            are never included. The language model runs locally. No source content is sent to a
            hosted model.
          </p>
        </li>
        <li>
          <h3>Sign-in and tokens</h3>
          <p>
            Access tokens are held in memory. The optional Stay signed in setting stores only a
            read-only refresh token in the macOS Keychain, never source content. Disconnecting or
            turning the setting off removes it.
          </p>
        </li>
        <li>
          <h3>Your controls</h3>
          <p>
            Revoke a grant, hide private OneNote sections, turn web search off, delete the app data
            folder or disconnect Microsoft at any time. The audit log records which source was
            read, never what it contained.
          </p>
        </li>
      </ol>

      <p className="leaf__small">
        Questions about data handling: <a href="mailto:sn26265@bristol.ac.uk">sn26265@bristol.ac.uk</a>.
        Last updated {site.updated}.
      </p>
    </article>
  )
}
