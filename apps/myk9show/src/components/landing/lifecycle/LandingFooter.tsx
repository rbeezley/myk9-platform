import { Link } from 'react-router-dom';

const FOOT_LINK = 'min-h-11 inline-flex items-center';

export function LandingFooter() {
  return (
    <footer className="l-footer">
      <div className="l-container">
        <div className="l-foot-grid">
          <div>
            <div className="l-foot-brand">myK9Show</div>
            <div className="l-foot-blurb">
              Dog-sport software for the working-line community. Built by RyKris, since 2013.
            </div>
          </div>
          <div>
            <h4>Product</h4>
            <ul>
              <li>
                <a href="#how-it-works" className={FOOT_LINK}>
                  For clubs
                </a>
              </li>
              <li>
                <a href="#how-it-works" className={FOOT_LINK}>
                  For exhibitors
                </a>
              </li>
              <li>
                <a href="#how-it-works" className={FOOT_LINK}>
                  Offline ringside
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4>Sanctioning</h4>
            <ul>
              <li>AKC Scent Work</li>
              <li>UKC Nosework</li>
              <li>ASCA Scent Detection</li>
              <li className="l-dim">Obedience &amp; agility · 2027</li>
            </ul>
          </div>
          <div>
            <h4>Company</h4>
            <ul>
              <li>
                <a href="#about" className={FOOT_LINK}>
                  About RyKris
                </a>
              </li>
              <li>
                <a href="mailto:hello@myk9show.com" className={FOOT_LINK}>
                  Contact
                </a>
              </li>
              <li>
                <Link to="/terms" className={FOOT_LINK}>
                  Terms
                </Link>
              </li>
              <li>
                <Link to="/privacy" className={FOOT_LINK}>
                  Privacy
                </Link>
              </li>
              <li>
                <Link to="/sms" className={FOOT_LINK}>
                  SMS Alerts
                </Link>
              </li>
              <li>
                <Link to="/fees" className={FOOT_LINK}>
                  How Our Fees Work
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="l-foot-bot">
          <div>© {new Date().getFullYear()} RyKris LLC</div>
        </div>
      </div>
    </footer>
  );
}
