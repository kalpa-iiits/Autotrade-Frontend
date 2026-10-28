import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from '../components/icons'
import './landing.css'

/** The public front page: what CloudTrader does, for visitors who aren't signed in. */
export default function Landing() {
  return (
    <div className="lp">
      <Nav />
      <Hero />
      <Problem />
      <HowItWorks />
      <Library />
      <Safety />
      <Pricing />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  )
}

function Logo() {
  return (
    <span className="lp-logo">
      <span className="lp-mark"><Icon name="logo" size={15} /></span>
      CloudTrader
    </span>
  )
}

function Nav() {
  return (
    <header className="lp-nav">
      <div className="lp-wrap lp-nav-row">
        <a href="#top" className="plain-link"><Logo /></a>
        <nav className="lp-links">
          <a href="#how">How it works</a>
          <a href="#strategies">Strategies</a>
          <a href="#safety">Safety</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="lp-nav-actions">
          <Link to="/login" className="lp-link-btn">Log in</Link>
          <Link to="/login?signup=1" className="lp-btn primary sm">Start free</Link>
        </div>
      </div>
    </header>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="lp-eyebrow">{children}</div>
}

/** A heading whose second part is set in the italic serif. */
function Title({ plain, accent, after, center }: { plain: string; accent: string; after?: string; center?: boolean }) {
  return (
    <h2 className={`lp-h2 ${center ? 'lp-center' : ''}`}>
      {plain} <em>{accent}</em>{after ? ` ${after}` : ''}
    </h2>
  )
}

function Hero() {
  return (
    <section className="lp-hero lp-dots" id="top">
      <div className="lp-wrap lp-hero-grid">
        <div>
          <div className="lp-badge"><span>NSE</span> Automated trading on your own Fyers or Zerodha account</div>
          <h1 className="lp-h1">
            Your strategy trades.
            <em>You get your day back.</em>
          </h1>
          <p className="lp-lead">
            Pick a ready-made strategy, connect your broker once, and CloudTrader places, trails and exits every
            trade for you — strictly inside the limits you set. No staring at charts from 9:15 to 3:30.
          </p>
          <div className="lp-cta-row">
            <Link to="/login?signup=1" className="lp-btn primary">Start with ₹10 lakh paper money <Icon name="arrow" size={15} /></Link>
            <a href="#how" className="lp-btn">See how it works</a>
          </div>
          <ul className="lp-ticks">
            <li><Icon name="check" size={13} /> Money never leaves your broker</li>
            <li><Icon name="check" size={13} /> Every rule visible</li>
            <li><Icon name="check" size={13} /> One-tap kill switch</li>
          </ul>
        </div>
        <HeroMock />
      </div>
    </section>
  )
}

function HeroMock() {
  return (
    <div className="lp-mock-wrap">
      <div className="lp-mock-reminder">
        <span className="lp-mock-bell"><Icon name="bell" size={14} /></span>
        <div><b>08:45 reminder</b><span>Tap to log in to Fyers for today</span></div>
      </div>
      <div className="lp-mock">
        <div className="lp-mock-date">Today · Mon 26 Oct</div>
        <div className="lp-mock-strategy">
          <span className="lp-mock-icon"><Icon name="strategies" size={15} /></span>
          <div className="grow">
            <div className="mono">opening-range-5m</div>
            <div className="lp-faint mono">NIFTY · 5m · Fyers</div>
          </div>
          <span className="lp-running">Running</span>
          <span className="lp-toggle on" aria-hidden="true"><span /></span>
        </div>
        <svg className="lp-mock-chart" viewBox="0 0 280 80" preserveAspectRatio="none" aria-hidden="true">
          <rect x="4" y="38" width="46" height="22" fill="rgb(124 147 255 / 0.12)" stroke="rgb(124 147 255 / 0.35)" strokeDasharray="2 2" />
          <polyline fill="none" stroke="#7c93ff" strokeWidth="1.6" strokeLinejoin="round"
            points="4,55 14,46 24,52 34,44 44,50 52,42 62,36 74,40 86,30 98,34 110,24 122,30 134,22 146,26 158,18 170,24 182,16 196,20 210,14 224,18 238,12 252,16 266,10 278,14" />
          <polyline fill="none" stroke="#f87171" strokeWidth="1.2" strokeDasharray="4 3"
            points="52,58 90,58 90,50 130,50 130,42 170,42 170,36 210,36 210,30 278,30" />
          <circle cx="52" cy="42" r="2.6" fill="#34d399" />
        </svg>
        <div className="lp-mock-legend">
          <span><i className="box" /> Opening range</span>
          <span><i className="dot" /> Entry</span>
          <span><i className="dash" /> Trailing stop</span>
        </div>
        <ul className="lp-mock-log">
          <li><span className="mono">09:20</span> Opening range set — waiting for a decisive break</li>
          <li><span className="mono">09:26</span> Broke above range — <b className="pos">bought 1 lot</b></li>
          <li><span className="mono">11:38</span> Trailing stop raised for the 4th time</li>
          <li className="faded"><span className="mono">15:15</span> Square-off scheduled — you don’t need to be here</li>
        </ul>
      </div>
      <div className="lp-mock-stop"><Icon name="stop" size={14} /> <b>Stop everything</b> <span>always one tap away</span></div>
      <div className="lp-mock-caption">Illustration only — not a record of real trades.</div>
    </div>
  )
}

function Problem() {
  return (
    <section className="lp-section lp-rule">
      <div className="lp-wrap">
        <Eyebrow>The problem</Eyebrow>
        <h2 className="lp-h2">Intraday trading shouldn’t mean <em>six hours</em> glued to a screen.</h2>
        <div className="lp-two">
          <div className="lp-card">
            <div className="lp-card-label bad">Trading by hand</div>
            <ul className="lp-list cross">
              <li><Icon name="close" size={14} /> You miss the breakout because you were in a meeting</li>
              <li><Icon name="close" size={14} /> You move your stop “just this once” — and it costs you</li>
              <li><Icon name="close" size={14} /> You forget to square off before 3:20</li>
              <li><Icon name="close" size={14} /> Your plan lives in your head, so you can’t tell what’s working</li>
            </ul>
          </div>
          <div className="lp-card accent">
            <div className="lp-card-label">With CloudTrader</div>
            <ul className="lp-list check">
              <li><Icon name="check" size={14} /> Rules fire on the candle close, every time, whether you’re watching or not</li>
              <li><Icon name="check" size={14} /> Stops are placed with the entry and trail automatically</li>
              <li><Icon name="check" size={14} /> Intraday positions square off at 15:15 on their own</li>
              <li><Icon name="check" size={14} /> Every signal and order is logged, so you can see what’s working</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

const STEPS = [
  { n: '01', title: 'Connect your broker', text: 'Link Fyers or Zerodha with their official login. Your money stays in your broker account — we can place orders, never withdraw.' },
  { n: '02', title: 'Choose a strategy', text: 'Pick from the library, choose the instrument and timeframe, and set your quantity and daily order limit.' },
  { n: '03', title: 'Paper first, then live', text: 'Run it on ₹10 lakh of virtual cash against live prices. When you’re comfortable, flip it to your real account.' },
]

const DAY = [
  { time: '08:45', title: 'Reminder', text: 'A nudge if your broker isn’t logged in yet', tone: 'amber' },
  { time: '09:05', title: 'One tap to log in', text: 'Your only job for the day', tone: 'blue' },
  { time: '09:15', title: 'Strategies wake up', text: 'Watching every candle you chose', tone: 'idle' },
  { time: 'Signal', title: 'Entry and stop placed', text: 'Together, in the same instant', tone: 'green' },
  { time: 'All day', title: 'Stops trail', text: 'Locking in moves as price runs', tone: 'idle' },
  { time: '15:15', title: 'Square-off', text: 'Intraday positions closed for you', tone: 'idle' },
]

function HowItWorks() {
  return (
    <section className="lp-section lp-rule" id="how">
      <div className="lp-wrap">
        <Eyebrow>How it works</Eyebrow>
        <Title plain="Set it up once." accent="It runs every day." />
        <div className="lp-three">
          {STEPS.map((s) => (
            <div key={s.n} className="lp-card">
              <div className="lp-step-n mono">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
        <div className="lp-card lp-day">
          <div className="lp-day-head">
            <h3>A trading day on autopilot</h3>
            <span>Your part is the first tap. The rest happens on its own.</span>
          </div>
          <ol className="lp-timeline">
            {DAY.map((d) => (
              <li key={d.title} className={d.tone}>
                <span className="lp-tl-bar"><i /></span>
                <span className="lp-tl-time mono">{d.time}</span>
                <b>{d.title}</b>
                <span className="lp-faint">{d.text}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

interface LibraryItem {
  name: string
  tf: string
  blurb: string
  market: string
  chart: 'orb' | 'breakout' | 'sma'
  rules: [string, string][]
}

const LIBRARY: LibraryItem[] = [
  {
    name: 'Opening Range Breakout', tf: '5m', blurb: 'Trades the first decisive move of the day', market: 'NIFTY 50 options or futures · intraday', chart: 'orb',
    rules: [
      ['Setup', 'The first 5-minute candle must be decisive — body at least 70% of its range.'],
      ['Entry', 'Buy when a later candle breaks its high; sell when it breaks its low.'],
      ['Stop', 'The opposite side of the opening candle, placed with the entry.'],
      ['Exit', 'Your chosen target (1:1 or 1:2) or square-off at 15:15.'],
    ],
  },
  {
    name: 'Range Breakout + Trail', tf: '1m', blurb: 'Fast breakouts with a wide trailing stop', market: 'Any NSE stock or index · intraday', chart: 'breakout',
    rules: [
      ['Setup', 'From 10:30, the high and low of the last 5 candles — skipped when that range is unusually wide.'],
      ['Entry', 'Buy when price breaks the high; sell short when it breaks the low.'],
      ['Stop', 'A quarter of the average daily range, trailing behind the best price as it runs.'],
      ['Exit', 'The stop or trailing stop, or square-off at 15:15. Never held overnight.'],
    ],
  },
  {
    name: 'Moving-Average Cross', tf: '15m', blurb: 'Steady trend-following for stocks', market: 'NSE stocks · positional', chart: 'sma',
    rules: [
      ['Setup', 'Waits for 21 completed candles, then checks once per candle close.'],
      ['Entry', 'Buy when the 9-period average of closes crosses above the 21-period one.'],
      ['Stop', 'No fixed stop: the opposite cross is the exit.'],
      ['Exit', 'When the 9-period average crosses back below the 21-period one.'],
    ],
  },
]

function Library() {
  const [active, setActive] = useState(0)
  const s = LIBRARY[active]
  return (
    <section className="lp-section lp-rule" id="strategies">
      <div className="lp-wrap">
        <Eyebrow>Strategy library</Eyebrow>
        <Title plain="Ready to trade." accent="Never a black box." />
        <p className="lp-sub">
          Every strategy shows its exact rules in plain English — what makes it enter, where the stop goes and when it
          exits. You always know why a trade happened.
        </p>
        <div className="lp-library">
          <div className="lp-lib-list" role="tablist" aria-label="Strategies">
            {LIBRARY.map((item, i) => (
              <button key={item.name} role="tab" aria-selected={i === active} className={i === active ? 'on' : ''} onClick={() => setActive(i)}>
                <span className="grow">
                  <b>{item.name}</b>
                  <span>{item.blurb}</span>
                </span>
                <span className="lp-tf mono">{item.tf}</span>
              </button>
            ))}
          </div>
          <div className="lp-card lp-lib-detail" role="tabpanel">
            <div className="lp-lib-head">
              <div>
                <h3>{s.name}</h3>
                <span className="lp-faint">{s.market}</span>
              </div>
              <span className="lp-pill">White-box · rules disclosed</span>
            </div>
            <div className="lp-lib-chart"><LibraryChart kind={s.chart} /></div>
            <div className="lp-rules">
              {s.rules.map(([k, v]) => (
                <div key={k}>
                  <div className="lp-rule-k">{k}</div>
                  <p>{v}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/** A made-up candle path for the selected strategy: illustration, not market data. */
function LibraryChart({ kind }: { kind: LibraryItem['chart'] }) {
  const n = 26
  const path = Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1)
    if (kind === 'sma') return 50 + Math.sin(t * 7) * 12 - t * 18
    return (t < 0.3 ? 62 + Math.sin(i * 2.1) * 3 : 62 - (t - 0.3) * 62) + Math.sin(i * 1.3) * 1.5
  })
  const w = 400 / n
  return (
    <svg viewBox="0 0 400 100" preserveAspectRatio="none" aria-hidden="true">
      {kind !== 'sma' && <line x1="0" x2="400" y1="57" y2="57" stroke="#7c93ff" strokeDasharray="4 3" strokeWidth="1" />}
      {kind !== 'sma' && <line x1="0" x2="400" y1="68" y2="68" stroke="#f5a524" strokeDasharray="4 3" strokeWidth="1" />}
      {path.map((close, i) => {
        const open = i ? path[i - 1] : close + 2
        const up = close <= open
        const top = Math.min(open, close) - 2
        const bottom = Math.max(open, close) + 2
        return (
          <g key={i} stroke={up ? '#34d399' : '#f87171'} fill={up ? '#34d399' : '#f87171'}>
            <line x1={i * w + w / 2} x2={i * w + w / 2} y1={top - 2} y2={bottom + 2} strokeWidth="1" />
            <rect x={i * w + w * 0.25} y={Math.min(open, close)} width={w * 0.5} height={Math.max(1.5, Math.abs(open - close))} />
          </g>
        )
      })}
      {kind === 'sma' && <polyline fill="none" stroke="#f5a524" strokeWidth="1.4" points={path.map((v, i) => `${i * w + w / 2},${v + 4}`).join(' ')} />}
    </svg>
  )
}

const SAFETY: { icon: IconName; title: string; text: string }[] = [
  { icon: 'shield', title: 'Your money stays with your broker', text: 'We connect through the broker’s official API. Orders only — withdrawals are impossible from here.' },
  { icon: 'stop', title: 'Kill switch', text: 'Stop every strategy on every account with one tap, from any screen.' },
  { icon: 'settings', title: 'Hard limits you set', text: 'Quantity, maximum open positions and a daily order cap per strategy. It can never exceed them.' },
  { icon: 'plus', title: 'Live is off until you say so', text: 'New strategies start stopped, and paper mode is clearly marked on every screen.' },
  { icon: 'refresh', title: 'Automatic square-off', text: 'Intraday positions are closed at 15:15, so nothing is left open by accident.' },
  { icon: 'orders', title: 'Full audit trail', text: 'Every signal, order, fill and stop change is time-stamped and kept for you to review.' },
]

function Safety() {
  return (
    <section className="lp-section lp-rule lp-dots" id="safety">
      <div className="lp-wrap">
        <Eyebrow>Safety &amp; control</Eyebrow>
        <Title plain="Hands-off doesn’t mean" accent="out of control." />
        <div className="lp-three">
          {SAFETY.map((f) => (
            <div key={f.title} className="lp-card lp-feature">
              <span className="lp-feature-icon"><Icon name={f.icon} size={15} /></span>
              <div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="lp-card lp-brokers">
          <span className="lp-eyebrow muted">Works with</span>
          <span className="lp-broker"><i>FY</i> Fyers</span>
          <span className="lp-broker"><i className="ze">ZE</i> Zerodha</span>
          <span className="lp-faint">More brokers coming</span>
          <span className="grow" />
          <span className="lp-faint">NSE equity &amp; F&amp;O · intraday and positional</span>
        </div>
      </div>
    </section>
  )
}

function Pricing() {
  return (
    <section className="lp-section lp-rule" id="pricing">
      <div className="lp-wrap">
        <Eyebrow><span className="center-block">Pricing</span></Eyebrow>
        <Title plain="Start free." accent="Go live when you’re ready." center />
        <div className="lp-plans">
          <div className="lp-card lp-plan">
            <h3>Paper</h3>
            <div className="lp-price">₹0 <span>forever</span></div>
            <p>Learn how every strategy behaves before risking a rupee.</p>
            <ul className="lp-list check">
              <li><Icon name="check" size={14} /> ₹10 lakh virtual cash, live NSE prices</li>
              <li><Icon name="check" size={14} /> Every strategy in the library</li>
              <li><Icon name="check" size={14} /> Full signal and order log</li>
              <li><Icon name="check" size={14} /> Trade journal and analytics</li>
            </ul>
            <Link to="/login?signup=1" className="lp-btn block">Start paper trading</Link>
          </div>
          <div className="lp-card lp-plan featured">
            <div className="between"><h3>Live</h3><span className="lp-pill solid">Most popular</span></div>
            <div className="lp-price">[₹ PRICE] <span>/ month</span></div>
            <p>Run strategies on your real broker account, fully automated.</p>
            <ul className="lp-list check">
              <li><Icon name="check" size={14} /> Everything in Paper</li>
              <li><Icon name="check" size={14} /> Live trading on Fyers and Zerodha</li>
              <li><Icon name="check" size={14} /> Multiple broker accounts</li>
              <li><Icon name="check" size={14} /> Daily login reminders and error alerts</li>
            </ul>
            <Link to="/login?signup=1" className="lp-btn primary block">Go live</Link>
          </div>
        </div>
        <p className="lp-fineprint lp-center">Brokerage, taxes and exchange charges are billed by your broker, not by us.</p>
      </div>
    </section>
  )
}

const FAQ: [string, string][] = [
  ['Do I need to watch the market?', 'No. After a one-tap broker login each morning, your strategies place entries, stops and exits on their own. You can check in whenever you like — or not at all.'],
  ['Is my money safe with CloudTrader?', 'Your money never leaves your broker account. CloudTrader connects through your broker’s official API and can only place and cancel orders — it can’t withdraw or move funds.'],
  ['Can I lose money?', 'Yes. Strategies follow their rules exactly, but markets can move against any rule, and fast markets can fill orders worse than expected. Start on paper money, and keep the quantity and daily order limits at a size you’re comfortable losing.'],
  ['What if I forget to log in to my broker?', 'You get a reminder at 08:45. Broker logins expire every day, so until you log in your strategies can’t place orders — nothing is sent on your behalf that day.'],
  ['Can I see exactly what a strategy does?', 'Yes. Every strategy’s page lists its entry, stop and exit rules in plain English, with a backtest on past prices. Every signal and order it sends is logged with the time and price.'],
  ['Is CloudTrader registered with the exchanges?', '[Add your NSE / BSE algo-provider empanelment and broker partnership details here.]'],
]

function Faq() {
  const [open, setOpen] = useState(0)
  return (
    <section className="lp-section lp-rule" id="faq">
      <div className="lp-wrap lp-faq">
        <div>
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="lp-h2">Straight answers.</h2>
          <p className="lp-faint">Something else? <a href="mailto:[support email]">Write to us</a>.</p>
        </div>
        <div className="lp-faq-list">
          {FAQ.map(([q, a], i) => (
            <div key={q} className={`lp-faq-item ${open === i ? 'open' : ''}`}>
              <button aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
                <span>{q}</span>
                <span className="lp-faq-icon"><Icon name={open === i ? 'close' : 'plus'} size={13} /></span>
              </button>
              {open === i && <p>{a}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="lp-section">
      <div className="lp-wrap">
        <div className="lp-final lp-dots">
          <Title plain="Let the rules trade." accent="You live your day." center />
          <p>Start on paper today. No card, no broker needed to try it.</p>
          <div className="lp-cta-row lp-center">
            <Link to="/login?signup=1" className="lp-btn primary">Start free with paper money</Link>
            <a href="#strategies" className="lp-btn">Browse strategies</a>
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-wrap">
        <div className="lp-foot-top">
          <div>
            <Logo />
            <p className="lp-faint">Automated, rule-based trading on your own broker account. Built in Bengaluru.</p>
          </div>
          <div className="lp-foot-cols">
            <div>
              <div className="lp-eyebrow muted">Product</div>
              <a href="#strategies">Strategies</a>
              <a href="#pricing">Pricing</a>
              <a href="#safety">Safety</a>
            </div>
            <div>
              <div className="lp-eyebrow muted">Legal</div>
              <a href="#terms">Terms</a>
              <a href="#privacy">Privacy</a>
              <a href="#risk">Risk disclosure</a>
            </div>
          </div>
        </div>
        <div className="lp-legal">
          <p>Investments in the securities market are subject to market risks. Read all related documents carefully before investing. Algorithmic trading can result in losses, including losses larger than expected during fast markets. No returns are guaranteed, and strategy illustrations on this page are not a promise of future results.</p>
          <p>Algo provider empanelment: [NSE / BSE empanelment number] · Broker partners: [names] · Research Analyst registration: [number, if applicable]</p>
          <p>© 2026 CloudTrader. [Registered company name and address]</p>
        </div>
      </div>
    </footer>
  )
}
