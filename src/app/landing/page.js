import './landing.css';
import ThemeSwitcher from '../../components/ThemeSwitcher';
import ScrollReveal from '../../components/ScrollReveal';
import CountUp from '../../components/CountUp';
import Faq from '../../components/Faq';

export const metadata = {
  title: 'Academy Manager — The Operating System for Sports Academies',
  description: 'Players, fees, attendance, and ground bookings — one platform for football, cricket, and multi-sport academies.',
};

const ip = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.4', strokeLinecap: 'round', strokeLinejoin: 'round' };

function IconTarget(props) { return <svg {...ip} {...props}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>; }
function IconTrophy(props) { return <svg {...ip} {...props}><circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" /></svg>; }
function IconActivity(props) { return <svg {...ip} {...props}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>; }
function IconWatch(props) { return <svg {...ip} {...props}><circle cx="12" cy="13" r="7" /><polyline points="12 10 12 13 13.8 14.8" /><path d="M16.24 18.24l-.32 3.32a2 2 0 0 1-2 1.82H10.1a2 2 0 0 1-2-1.82l-.32-3.32M9.9 7.76l.32-3.32A2 2 0 0 1 12.2 2.62h.02" /></svg>; }
function IconFlag(props) { return <svg {...ip} {...props}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>; }
function IconFootball(props) { return <svg {...ip} {...props}><circle cx="12" cy="12" r="9" /><polygon points="12,7.5 15.5,10 14.2,14 9.8,14 8.5,10" /><line x1="12" y1="3" x2="12" y2="7.5" /><line x1="20.5" y1="9.5" x2="15.5" y2="10" /><line x1="17.5" y1="19.5" x2="14.2" y2="14" /><line x1="6.5" y1="19.5" x2="9.8" y2="14" /><line x1="3.5" y1="9.5" x2="8.5" y2="10" /></svg>; }
function IconBatBall(props) { return <svg {...ip} {...props}><path d="M14 3l7 7-8.5 8.5a2.5 2.5 0 0 1-3.5-3.5L17.5 6" /><circle cx="5" cy="19" r="2.5" /></svg>; }
function IconWhistle(props) { return <svg {...ip} {...props}><path d="M3 12a5 5 0 0 1 5-5h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4h-2" /><circle cx="8" cy="12" r="3.2" /><path d="M15 12h2" /></svg>; }
function IconRunner(props) { return <svg {...ip} {...props}><circle cx="15" cy="5" r="2" /><path d="M4 20l3-5 3 2 2-3-2-4 4-2 2 4" /></svg>; }
function IconMedal(props) { return <svg {...ip} {...props}><path d="M8 3h8l3 6-7 12L5 9z" /><circle cx="12" cy="14" r="4" /></svg>; }
function IconStumps(props) { return <svg {...ip} {...props}><line x1="6" y1="3" x2="6" y2="21" /><line x1="12" y1="3" x2="12" y2="21" /><line x1="18" y1="3" x2="18" y2="21" /><line x1="4" y1="3" x2="8" y2="3" /><line x1="10" y1="3" x2="14" y2="3" /><line x1="16" y1="3" x2="20" y2="3" /></svg>; }
function IconCalendar(props) { return <svg {...ip} {...props}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>; }

export default function LandingPage() {
  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />
      <div className="landing-body">
<ScrollReveal />
<div className="mesh"></div>

<nav className="top">
  <div className="wrap">
    <div className="brand">Academy<span> Manager</span></div>
    <div className="navlinks">
      <a href="#features">Platform</a>
      <a href="#audience">Who It's For</a>
      <a href="#pricing">Pricing</a>
      <a href="#faq">FAQ</a>
    </div>
    <div className="nav-btn-group">
      <ThemeSwitcher />
      <a className="btn btn-ghost" href="/login">Log in</a>
      <a className="btn btn-lime" href="/login">Get Started</a>
    </div>
  </div>
</nav>

<header className="hero">
  <div className="hero-deco" aria-hidden="true">
    <IconTarget className="hd-icon hd-1" />
    <IconTrophy className="hd-icon hd-2" />
    <IconActivity className="hd-icon hd-3" />
    <IconWatch className="hd-icon hd-4" />
    <IconFlag className="hd-icon hd-5" />
    <IconFootball className="hd-icon hd-6" />
    <IconWhistle className="hd-icon hd-7" />
    <IconBatBall className="hd-icon hd-8" />
    <IconMedal className="hd-icon hd-9" />
    <IconStumps className="hd-icon hd-10" />
    <IconCalendar className="hd-icon hd-11" />
    <IconRunner className="hd-icon hd-12" />
  </div>
  <div className="wrap">
    <div className="badge-row hero-in" style={{ '--d': '0' }}>
      <span className="badge">⚽ Football</span>
      <span className="badge">🏏 Cricket</span>
      <span className="badge">🏆 Multi-Sport</span>
    </div>
    <h1 className="hero-line hero-in" style={{ '--d': '1' }}>The operating system for sports academies.</h1>
    <p className="hero-sub hero-in" style={{ '--d': '2' }}>Players, fees, attendance, and ground bookings — one platform replacing the spreadsheets, notebooks, and group chats your academy runs on today.</p>
    <div className="hero-ctas hero-in" style={{ '--d': '3' }}>
      <a className="btn btn-lime" href="/login">Get Started</a>
      <a className="btn btn-ghost" href="/login">Book a Demo</a>
    </div>

    <div className="browser-frame hero-in" style={{ '--d': '4' }}>
      <div className="browser-bar">
        <span className="dot"></span><span className="dot"></span><span className="dot"></span>
        <span className="url">app.academymanager.com/dashboard</span>
      </div>
      <div className="browser-body">
        <div className="bb-head">
          <span className="title">Your Academy — Overview</span>
          <span className="plan-tag"><span className="live-dot"></span>ENTERPRISE PLAN</span>
        </div>
        <div className="bb-stats">
          <div className="bb-stat"><div className="num"><CountUp value={312} /></div><div className="lab">Players</div></div>
          <div className="bb-stat"><div className="num"><CountUp value={91} suffix="%" /></div><div className="lab">Fees Collected</div></div>
          <div className="bb-stat"><div className="num"><CountUp value={27} /></div><div className="lab">Sessions / wk</div></div>
          <div className="bb-stat"><div className="num"><CountUp value={2} /></div><div className="lab">Grounds Live</div></div>
        </div>
        <div className="bb-table">
          <div className="bb-row"><span>Player</span><span>Squad</span><span>Session</span><span>Status</span></div>
          <div className="bb-row"><span>Ahmed Raza</span><span>U-14</span><span>Weekdays</span><span className="paid">Paid</span></div>
          <div className="bb-row"><span>Sara Khan</span><span>U-12</span><span>Weekend</span><span className="paid">Paid</span></div>
          <div className="bb-row"><span>Bilal Hassan</span><span>U-16</span><span>Weekdays</span><span className="due">Due</span></div>
        </div>
      </div>
    </div>
  </div>
</header>

<section id="problem">
  <div className="sec-deco" aria-hidden="true">
    <IconFootball className="sd-icon sz-lg pos-tl" />
    <IconBatBall className="sd-icon accent sz-md pos-br" />
    <IconMedal className="sd-icon sz-sm pos-tr" />
    <IconStumps className="sd-icon accent sz-sm pos-ml" />
    <IconWhistle className="sd-icon sz-md pos-mr" />
  </div>
  <div className="wrap">
    <div className="section-head reveal">
      <div className="eyebrow">Why Academy Manager</div>
      <h2>Running an academy shouldn't feel like a second job.</h2>
      <p>Most academies juggle five different tools to do one job. Here's what changes when you switch.</p>
    </div>
    <div className="compare-grid">
      <div className="compare-card old reveal" style={{ '--d': '0' }}>
        <div className="compare-tag">Before</div>
        <ul className="compare-list">
          <li><span className="x-ic">✕</span>Player lists split across WhatsApp, Excel, and paper registers</li>
          <li><span className="x-ic">✕</span>Fee follow-ups done from memory — overdue accounts slip through</li>
          <li><span className="x-ic">✕</span>Attendance marked on paper, entered into a sheet later (or never)</li>
          <li><span className="x-ic">✕</span>Ground double-bookings discovered on match day</li>
          <li><span className="x-ic">✕</span>No real picture of enrollment or cash flow until month-end</li>
        </ul>
      </div>
      <div className="compare-arrow reveal" style={{ '--d': '1' }}>→</div>
      <div className="compare-card new reveal" style={{ '--d': '2' }}>
        <div className="compare-tag">With Academy Manager</div>
        <ul className="compare-list">
          <li><span className="check-ic">✓</span>Every player, coach, and squad in one searchable list</li>
          <li><span className="check-ic">✓</span>Overdue fees surface automatically — no manual chasing</li>
          <li><span className="check-ic">✓</span>Attendance marked pitch-side, saved instantly</li>
          <li><span className="check-ic">✓</span>Ground clashes caught before they're confirmed</li>
          <li><span className="check-ic">✓</span>Live dashboards for enrollment, fees, and attendance — always current</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<section id="how">
  <div className="sec-deco" aria-hidden="true">
    <IconWhistle className="sd-icon sz-md pos-tr" />
    <IconRunner className="sd-icon accent sz-md pos-bl" />
    <IconCalendar className="sd-icon sz-sm pos-tl" />
    <IconTarget className="sd-icon accent sz-sm pos-br" />
    <IconMedal className="sd-icon sz-md pos-ml" />
  </div>
  <div className="wrap">
    <div className="section-head reveal">
      <div className="eyebrow">How It Works</div>
      <h2>Up and running in three steps.</h2>
    </div>
    <div className="steps-row">
      <div className="step-card reveal" style={{ '--d': '0' }}>
        <div className="step-num">01</div>
        <h3>Set up your academy</h3>
        <p>Create your account and add your squads, coaches, and ground schedule — takes minutes, no training needed.</p>
      </div>
      <div className="step-card reveal" style={{ '--d': '1' }}>
        <div className="step-num">02</div>
        <h3>Run your week</h3>
        <p>Mark attendance pitch-side, record fee payments, and book grounds — all from your phone, in real time.</p>
      </div>
      <div className="step-card reveal" style={{ '--d': '2' }}>
        <div className="step-num">03</div>
        <h3>See it all, live</h3>
        <p>Enrollment, collections, and attendance roll up into one dashboard — no spreadsheet, no month-end scramble.</p>
      </div>
    </div>
  </div>
</section>

<section id="features">
  <div className="sec-deco" aria-hidden="true">
    <IconTrophy className="sd-icon accent sz-lg pos-tr" />
    <IconTarget className="sd-icon sz-md pos-ml" />
    <IconFlag className="sd-icon sz-sm pos-bl" />
    <IconStumps className="sd-icon sz-sm pos-tl" />
    <IconBatBall className="sd-icon accent sz-md pos-mr" />
    <IconWhistle className="sd-icon sz-sm pos-br" />
  </div>
  <div className="wrap">
    <div className="section-head reveal">
      <div className="eyebrow">The Platform</div>
      <h2>Everything your academy runs on.</h2>
      <p>Five systems working together, not five tools that don't talk to each other.</p>
    </div>
    <div className="bento">
      <div className="bento-card big reveal" style={{ '--d': '0' }}>
        <div className="bento-glow"></div>
        <div><div className="tag">Every Plan</div><h3>Player & coach management</h3></div>
        <div><div className="big-num"><CountUp value={312} suffix="+" /></div><p>players and coaches tracked in one searchable squad list, not five outdated files</p></div>
      </div>
      <div className="bento-card wide reveal" style={{ '--d': '1' }}>
        <div><div className="tag">Every Plan</div><h3>Fee tracking & receipts</h3></div>
        <p>Auto-generated receipts. Overdue accounts surface on their own — no manual reconciliation.</p>
      </div>
      <div className="bento-card reveal" style={{ '--d': '2' }}>
        <div><div className="tag">Every Plan</div><h3>Attendance</h3></div>
        <p>Marked pitch-side, saved instantly.</p>
      </div>
      <div className="bento-card reveal" style={{ '--d': '3' }}>
        <div><div className="tag">Enterprise</div><h3>Ground bookings</h3></div>
        <p>Clashes caught before they're confirmed.</p>
      </div>
      <div className="bento-card wide reveal" style={{ '--d': '4' }}>
        <div><div className="tag">Enterprise</div><h3>Expenses & stock</h3></div>
        <p>Kit, ground rent, salaries, and equipment — tracked with live stock value.</p>
      </div>
      <div className="bento-card big reveal" style={{ '--d': '5' }}>
        <div className="bento-glow"></div>
        <div><div className="tag">Every Plan</div><h3>Live performance reports</h3></div>
        <div><div className="big-num"><span className="live-dot"></span>Live</div><p>dashboards for enrollment, collections, and attendance — updated as it happens, not at month-end</p></div>
      </div>
    </div>
  </div>
</section>

<section id="audience">
  <div className="sec-deco" aria-hidden="true">
    <IconFootball className="sd-icon sz-md pos-tl" />
    <IconBatBall className="sd-icon accent sz-sm pos-mr" />
    <IconMedal className="sd-icon sz-sm pos-tr" />
    <IconCalendar className="sd-icon accent sz-md pos-bl" />
    <IconRunner className="sd-icon sz-sm pos-br" />
  </div>
  <div className="wrap">
    <div className="section-head reveal">
      <div className="eyebrow">Built For</div>
      <h2>Every kind of sports setup.</h2>
    </div>
    <div className="audience-row">
      <div className="audience-card reveal" style={{ '--d': '0' }}><div className="emoji">⚽</div><h3>Football Academies</h3><p>Multiple age groups, one ground schedule to keep straight.</p></div>
      <div className="audience-card reveal" style={{ '--d': '1' }}><div className="emoji">🏏</div><h3>Cricket Academies</h3><p>Nets, matches, and fees across a packed weekly schedule.</p></div>
      <div className="audience-card reveal" style={{ '--d': '2' }}><div className="emoji">🎽</div><h3>Private Coaches</h3><p>Every player's schedule and payment, no back-office team needed.</p></div>
      <div className="audience-card reveal" style={{ '--d': '3' }}><div className="emoji">🏆</div><h3>Multi-Sport Clubs</h3><p>Several grounds and squads from one dashboard.</p></div>
    </div>
  </div>
</section>

<section id="pricing">
  <div className="sec-deco" aria-hidden="true">
    <IconWatch className="sd-icon sz-lg pos-tr" />
    <IconWhistle className="sd-icon accent sz-sm pos-bl" />
    <IconTrophy className="sd-icon sz-md pos-tl" />
    <IconFootball className="sd-icon accent sz-sm pos-br" />
    <IconStumps className="sd-icon sz-sm pos-ml" />
  </div>
  <div className="wrap">
    <div className="section-head reveal">
      <div className="eyebrow">Pricing</div>
      <h2>Simple plans for every academy.</h2>
      <p>Every plan includes players, fee tracking, and attendance. Enterprise unlocks expenses, stock, and ground bookings.</p>
    </div>
    <div className="pricing-grid pricing-grid-2">
      <div className="plan reveal" style={{ '--d': '0' }}>
        <div className="name">Pro</div>
        <div className="price">Contact us for pricing</div>
        <ul><li><span>✓</span>Unlimited players & coaches</li><li><span>✓</span>Fee & payment tracking</li><li><span>✓</span>Attendance tracking</li><li><span>✓</span>Live performance reports</li><li><span>✓</span>Priority support</li></ul>
        <a className="btn btn-ghost" href="/login">Book a Demo</a>
      </div>
      <div className="plan feat reveal" style={{ '--d': '1' }}>
        <div className="name">Enterprise</div>
        <div className="price">Contact us for pricing</div>
        <ul><li><span>✓</span>Everything in Pro</li><li><span>✓</span>Expenses & stock / inventory</li><li><span>✓</span>Ground bookings — cricket & football</li></ul>
        <a className="btn btn-lime" href="/login">Book a Demo</a>
      </div>
    </div>
  </div>
</section>

<section id="faq">
  <div className="sec-deco" aria-hidden="true">
    <IconRunner className="sd-icon sz-md pos-tl" />
    <IconTrophy className="sd-icon accent sz-md pos-br" />
    <IconFlag className="sd-icon sz-sm pos-tr" />
    <IconBatBall className="sd-icon accent sz-sm pos-bl" />
    <IconMedal className="sd-icon sz-sm pos-mr" />
  </div>
  <div className="wrap">
    <div className="section-head reveal">
      <div className="eyebrow">Questions</div>
      <h2>Before you get started.</h2>
    </div>
    <div className="faq-wrap reveal">
      <Faq />
    </div>
  </div>
</section>

<div className="final-cta">
  <div className="sec-deco" aria-hidden="true">
    <IconFootball className="sd-icon accent sz-lg pos-tl" />
    <IconBatBall className="sd-icon sz-md pos-mr" />
    <IconFlag className="sd-icon accent sz-sm pos-br" />
    <IconTrophy className="sd-icon sz-md pos-tr" />
    <IconStumps className="sd-icon accent sz-sm pos-bl" />
  </div>
  <div className="wrap reveal">
    <h2>Your next season is enrolling.</h2>
    <p>Book a demo and get your academy set up on Pro or Enterprise in minutes.</p>
    <a className="btn btn-lime" href="/login">Get Started</a>
  </div>
</div>

<footer><div className="wrap"><span>Academy Manager</span><span>Built for football, cricket, and multi-sport academies</span></div></footer>
</div>
    </>
  );
}
