import { Link } from 'react-router-dom'
import AboutBook from '../components/AboutBook'
import { site } from '../config'

export default function AboutPage() {
  return (
    <main className="aboutPage">
      <header className="aboutPage__bar">
        <Link to="/" className="aboutPage__brand">
          {site.wordmark}<span>.</span>
        </Link>
        <Link to="/" className="aboutPage__back">
          <span aria-hidden="true">←</span> Back to the desk
        </Link>
      </header>

      <section className="aboutPage__intro">
        <p className="aboutPage__kicker">About us</p>
        <h1>
          Two people,
          <br />
          <em>one desk.</em>
        </h1>
        <p>
          FrontDesk is built by Anika and Zeynep at the University of Bristol. Turn the book
          to meet the team, or keep both pages open side by side.
        </p>
      </section>

      <AboutBook />
    </main>
  )
}
