// /landing — public marketing page. Standalone: no sidebar, no top bar.
// Voice follows DESIGN.md (the calm sentinel): plain verbs, no hype,
// one idea per section. Sections: header, hero, how it works, features,
// waitlist.
import WaitlistForm from '../../../components/WaitlistForm.js';

export const metadata = {
  title: 'API Contract Firewall — contract testing without writing contracts',
  description:
    'Your OpenAPI spec says one thing, production does another. API Contract Firewall learns your API\u2019s real contract from observed traffic and blocks deploys that would break it.',
};

const DEMO_URL = 'https://api-contract-firewall.vercel.app';
const REPO_URL = 'https://github.com/abdullah129026/api-contract-firewall';

const STEPS = [
  {
    n: '1',
    title: 'Point traffic at the proxy',
    body: 'Send your API traffic through a Cloudflare Worker. It forwards every request untouched and watches the shapes go by. PII is masked at capture, before anything is stored.',
  },
  {
    n: '2',
    title: 'It learns the contract',
    body: 'After enough real requests, each endpoint flips from learning to enforcing. The observed shape becomes the contract. No spec files to write or maintain.',
  },
  {
    n: '3',
    title: 'The gate blocks breaking deploys',
    body: 'A field disappears or a type changes, and the detector raises a violation. Your pipeline asks the gate before shipping. A breaking change means blocked.',
  },
];

const FEATURES = [
  {
    title: 'Breaking-change detection',
    body: 'Removed fields, changed types, and nulls where they do not belong are caught against the enforced baseline.',
  },
  {
    title: 'CI deploy gate',
    body: 'One API call in your pipeline. Pass means ship; blocked means a consumer would break.',
  },
  {
    title: 'Latency regression',
    body: 'When an endpoint\u2019s p50 doubles against its baseline window, it shows up as a warning before users feel it.',
  },
  {
    title: 'PII masking',
    body: 'Emails, tokens, and secrets are masked at capture. The raw values never leave the proxy.',
  },
];

export default function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-header">
        <a className="landing-brand" href="/landing">
          <span className="brand-mark" aria-hidden="true" />
          Contract Firewall
        </a>
        <nav className="landing-nav">
          <a href={DEMO_URL}>Live demo</a>
          <a href="#waitlist" className="btn btn-primary">
            Join the waitlist
          </a>
        </nav>
      </header>

      <section className="hero">
        <h1>Your OpenAPI spec says one thing, production does another.</h1>
        <p>
          API Contract Firewall is contract testing without writing contracts. Point your
          traffic at the proxy and it learns your API&rsquo;s real contract from observed
          requests. When a deploy would break that contract, the CI gate blocks it,
          before your consumers find out.
        </p>
        <div className="hero-ctas">
          <a href={DEMO_URL} className="btn btn-primary">
            See the live demo
          </a>
          <a href="#waitlist" className="btn">
            Join the waitlist
          </a>
        </div>
      </section>

      <section className="landing-section">
        <h2>How it works</h2>
        <ol className="landing-steps">
          {STEPS.map((s) => (
            <li key={s.n}>
              <span className="landing-step-num" aria-hidden="true">{s.n}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-section">
        <h2>What you get</h2>
        <ul className="landing-features">
          {FEATURES.map((f) => (
            <li key={f.title}>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="landing-section" id="waitlist">
        <h2>Join the waitlist</h2>
        <p className="landing-lede">
          We are opening it up gradually. Leave your email and we will write
          when your turn comes.
        </p>
        <WaitlistForm />
      </section>

      <footer className="landing-footer">
        <p>
          Built in the open. <a href={REPO_URL}>Source on GitHub.</a>
        </p>
      </footer>
    </div>
  );
}
