import { Link } from 'react-router-dom';
import { LAUNCH_YEAR } from './constants';

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
                <a href="#features">For clubs</a>
              </li>
              <li>
                <a href="#features">For exhibitors</a>
              </li>
              <li>
                <a href="#offline">Offline ringside</a>
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
                <a href="#trust">About RyKris</a>
              </li>
              <li>
                <a href="mailto:hello@myk9show.com">Contact</a>
              </li>
              <li>
                <Link to="/legal">Legal</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="l-foot-bot">
          <div>© {LAUNCH_YEAR} RyKris LLC · myK9 Platform</div>
          <div className="l-ver">v0.9.4 · pre-launch</div>
        </div>
      </div>
    </footer>
  );
}
