import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner shell">
        <Link className="brand" href="/" aria-label="Agent Caller home">
          <span className="brand__mark" aria-hidden="true"><span /><span /><span /></span>
          <span>agent caller</span>
        </Link>
        <nav className="site-nav" aria-label="Main navigation">
          <Link href="/how-it-works">How it works</Link>
          <Link href="/industries/hvac">Industries</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/security">Security</Link>
        </nav>
        <div className="site-header__actions">
          <Link className="header-login" href="/login">Log in</Link>
          <Link className="button button--small button--dark" href="/signup">Start your 14-day trial <span aria-hidden="true">↗</span></Link>
        </div>
        <details className="mobile-menu">
          <summary aria-label="Open navigation"><span /><span /></summary>
          <nav aria-label="Mobile navigation">
            <Link href="/how-it-works">How it works</Link>
            <Link href="/industries/hvac">Industries</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/security">Security</Link>
            <Link href="/login">Log in</Link>
            <Link href="/signup">Start your trial</Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
