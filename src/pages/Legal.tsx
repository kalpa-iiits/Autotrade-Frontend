import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Footer, Logo } from './Landing'
import { LEGAL_DOCS } from './legalDocs'
import './landing.css'

/** A public legal page (/terms, /privacy, /risk), shown signed in or not. */
export default function Legal({ path }: { path: string }) {
  const doc = LEGAL_DOCS[path]
  useEffect(() => { window.scrollTo(0, 0) }, [path])
  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-row">
          <Link to="/welcome" className="plain-link"><Logo /></Link>
          <div className="lp-nav-actions">
            <Link to="/welcome" className="lp-link-btn">Back to home</Link>
          </div>
        </div>
      </header>
      <main className="lp-section">
        <article className="lp-wrap lp-doc">
          <div className="lp-eyebrow">Legal</div>
          <h1 className="lp-h2">{doc.title}</h1>
          <p className="lp-faint">Last updated {doc.updated}</p>
          <p className="lp-doc-intro">{doc.intro}</p>
          {doc.sections.map((s) => (
            <section key={s.heading}>
              <h2>{s.heading}</h2>
              {s.body.map((b, i) => Array.isArray(b)
                ? <ul key={i}>{b.map((item) => <li key={item}>{item}</li>)}</ul>
                : <p key={i}>{b}</p>)}
            </section>
          ))}
        </article>
      </main>
      <Footer anchorBase="/welcome" />
    </div>
  )
}
