import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Footer, Logo } from './Landing'
import './landing.css'

/** A legal document: its title, when it last changed, and its sections (paragraphs or lists). */
interface LegalDoc {
  title: string
  updated: string
  intro: string
  sections: { heading: string; body: (string | string[])[] }[]
}

const COMPANY = '[Registered company name]'
const EMAIL = '[support email]'

export const LEGAL_DOCS: Record<string, LegalDoc> = {
  '/terms': {
    title: 'Terms of use',
    updated: '28 October 2026',
    intro: `These terms apply to your use of CloudTrader (the website at cloudtrader.in and the app behind it), operated by ${COMPANY}. By creating an account or using the service you agree to them.`,
    sections: [
      { heading: 'What CloudTrader is', body: [
        'CloudTrader is software that runs rule-based trading strategies on a broker account you own and connect yourself (currently Fyers or Zerodha). It sends orders to your broker through the broker’s official API, following the rules of the strategy you choose and the limits you set.',
        'CloudTrader is not a broker, does not hold your money or securities, and does not give investment advice. Strategy descriptions, illustrations and backtests explain how a strategy behaves; they are not a recommendation to trade it.',
      ] },
      { heading: 'Your account', body: [
        'You must be at least 18, legally able to trade on Indian exchanges, and the holder of the broker accounts you connect. Keep your login private: anything done through your account is treated as done by you.',
        'Your broker requires a fresh login each trading day. Until you complete it, strategies on that account cannot place orders.',
      ] },
      { heading: 'Paper and live trading', body: [
        'Paper trading uses virtual money against live prices; no real orders are sent. Live trading places real orders on your broker account, at your risk, within the quantity, position and daily order limits configured for each strategy.',
        'You decide which strategies run, on which instruments, and when they start and stop. You can stop every strategy at once with the kill switch.',
      ] },
      { heading: 'Plans and payment', body: [
        'Paper trading is free. The Live plan costs ₹999 per month after a free trial of 2 months. Prices include or exclude GST as shown at checkout. Brokerage, taxes and exchange charges are billed by your broker, not by us.',
        'You can cancel at any time; access to live trading continues until the end of the period you have paid for. Fees already paid are not refunded except where the law requires it.',
      ] },
      { heading: 'Acceptable use', body: [
        [
          'Do not use CloudTrader for market manipulation, circular trading or anything else prohibited by SEBI or the exchanges.',
          'Do not try to access other users’ accounts or data, or to disrupt the service.',
          'Do not resell or share access to the service without our written permission.',
        ],
      ] },
      { heading: 'Availability and changes', body: [
        'We work to keep the service running during market hours, but it depends on your broker, the exchanges, your internet connection and our hosting providers. Outages, delays, rejected orders and missed signals can happen, and we do not guarantee uninterrupted service.',
        'We may change or retire strategies and features, and update these terms. Material changes will be announced in the app or by email before they take effect.',
      ] },
      { heading: 'Liability', body: [
        'Trading involves risk of loss, described in our Risk disclosure. To the extent the law allows, we are not liable for trading losses, missed profits, or losses caused by your broker, the exchanges, market conditions or third-party services. Our total liability for any claim is limited to the fees you paid us in the 3 months before it arose.',
      ] },
      { heading: 'Ending your account', body: [
        `You can stop using CloudTrader at any time and ask us to delete your account by writing to ${EMAIL}. We may suspend or close accounts that break these terms. Positions on your broker account remain yours and are not closed by account deletion.`,
      ] },
      { heading: 'Governing law', body: [
        'These terms are governed by the laws of India. Disputes are subject to the courts of Bengaluru, Karnataka.',
        `Questions about these terms: ${EMAIL}.`,
      ] },
    ],
  },
  '/privacy': {
    title: 'Privacy policy',
    updated: '28 October 2026',
    intro: `This policy explains what personal data CloudTrader, operated by ${COMPANY}, collects, why, and the choices you have. We process personal data in line with India’s Digital Personal Data Protection Act, 2023.`,
    sections: [
      { heading: 'What we collect', body: [
        [
          'Account details: your username and password (stored only as a secure hash).',
          'Broker credentials you add, such as your broker app ID and secret, and the access token from each day’s broker login. These are encrypted at rest and never shown back in the app.',
          'Trading activity on CloudTrader: strategies you run, their settings, the signals they generate, and the orders, fills and positions synced from your broker.',
          'Technical data: IP address, browser type and request logs, used to run and secure the service.',
        ],
      ] },
      { heading: 'Why we use it', body: [
        [
          'To run your strategies and place orders on your broker account when you ask us to.',
          'To show your orders, trades, positions and strategy history in the app.',
          'To send reminders and alerts you turn on, such as the morning broker-login reminder.',
          'To keep the service secure, prevent abuse, and meet legal and regulatory obligations.',
        ],
        'We do not sell your personal data and do not use it for third-party advertising.',
      ] },
      { heading: 'Who we share it with', body: [
        'Your broker (Fyers or Zerodha) receives the orders and requests needed to trade on your account. Our hosting providers (such as Amazon Web Services and Cloudflare) store and serve data on our behalf under contract. We share data with authorities only when the law requires it.',
      ] },
      { heading: 'Cookies and browser storage', body: [
        'We use one essential cookie to keep you signed in. The app also saves a few preferences in your browser, such as your selected account, watchlist and reminder settings. We do not use advertising or tracking cookies.',
      ] },
      { heading: 'How long we keep it', body: [
        'Account and trading records are kept while your account is open and for as long afterwards as tax, accounting and regulatory rules require. Daily broker access tokens expire each day. When you delete a broker account from CloudTrader, its stored credentials are deleted.',
      ] },
      { heading: 'Your rights', body: [
        `You can ask to access, correct or delete your personal data, withdraw consent, or raise a grievance by writing to ${EMAIL}. Grievance officer: [name], [address]. We respond within the time limits set by law.`,
      ] },
      { heading: 'Security', body: [
        'Broker credentials and tokens are encrypted, connections use HTTPS, and each user can see only their own accounts. No system is perfectly secure; if a breach affects your data we will tell you and the authorities as the law requires.',
      ] },
      { heading: 'Changes to this policy', body: [
        'We will post updates on this page and, for material changes, notify you in the app or by email.',
      ] },
    ],
  },
  '/risk': {
    title: 'Risk disclosure',
    updated: '28 October 2026',
    intro: 'Investments in the securities market are subject to market risks. Read this before running any strategy with real money.',
    sections: [
      { heading: 'You can lose money', body: [
        'Every strategy can lose money, including several losing trades in a row. Intraday and derivatives trading (futures and options) carry high risk, and losses on leveraged positions can exceed the money you set aside for a trade. According to SEBI studies, a large majority of individual traders in equity derivatives make net losses.',
      ] },
      { heading: 'Past results are not future results', body: [
        'Backtests and illustrations show how a strategy’s rules would have behaved on past prices. They leave out real-world costs and conditions such as slippage, brokerage, taxes and partial fills, and markets change. No returns are guaranteed.',
      ] },
      { heading: 'Automation has its own risks', body: [
        [
          'Orders are placed automatically; a strategy follows its rules even when you would have chosen differently.',
          'In fast or illiquid markets, orders can fill at prices far from the trigger level, or not fill at all.',
          'Your broker, the exchange, your internet connection or our servers can fail or be delayed, which can cause missed entries, missed exits or a late square-off.',
          'If you skip the daily broker login, strategies cannot trade or manage positions that day.',
          'Your broker may square off intraday positions itself near market close and charge a fee for it.',
        ],
      ] },
      { heading: 'Limits and your responsibility', body: [
        'Use the quantity, position and daily order limits, start with paper trading, and trade live only with money you can afford to lose. You stay responsible for the positions on your broker account and for monitoring them. Use the kill switch to stop all strategies at any time.',
      ] },
      { heading: 'No advice', body: [
        'CloudTrader does not provide investment advice or research recommendations. Decide whether a strategy suits your finances and goals yourself, or with a SEBI-registered adviser.',
      ] },
      { heading: 'Regulatory note', body: [
        'Algorithmic trading by retail investors is governed by SEBI’s framework and your broker’s rules, which may require strategies to be registered or approved before use. Algo provider empanelment: [NSE / BSE empanelment number].',
      ] },
    ],
  },
}

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
