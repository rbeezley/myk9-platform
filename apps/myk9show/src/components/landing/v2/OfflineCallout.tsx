import { Check } from 'lucide-react';

interface PhoneEntry {
  armband: string;
  name: string;
  meta: string;
  resultClass: 'l-q' | 'l-nq' | 'l-pending';
  resultText: string;
}

const ENTRIES: PhoneEntry[] = [
  {
    armband: '112',
    name: 'Tera',
    meta: 'Dutch Shepherd · Beezley',
    resultClass: 'l-q',
    resultText: 'Q · 24.81',
  },
  {
    armband: '113',
    name: 'Ziva',
    meta: 'Belgian Tervuren · Beezley',
    resultClass: 'l-q',
    resultText: 'Q · 31.04',
  },
  {
    armband: '114',
    name: 'Juno',
    meta: 'Labrador · Patel',
    resultClass: 'l-nq',
    resultText: 'NQ',
  },
  {
    armband: '115',
    name: 'Mosby',
    meta: 'Vizsla · Chen',
    resultClass: 'l-pending',
    resultText: 'Next up',
  },
];

export function OfflineCallout() {
  return (
    <section className="l-ringside" id="offline">
      <div className="l-container l-ringside-grid">
        <div>
          <span className="l-eyebrow">Offline-first · Ringside</span>
          <h2>
            Trial venues have <em>terrible signal.</em> So we built for it.
          </h2>
          <p>
            Judges score in the ring on their own device. Exhibitors check their armband and next-up
            in the parking lot. When a tower comes back online, every record syncs in the order it
            happened — no conflicts, no lost scores, no “please refresh.”
          </p>
          <p>It&apos;s the ringside experience you may know as myK9Q, now built right in.</p>
          <ul className="l-checks">
            <li>
              <Check width={18} height={18} strokeWidth={2.5} aria-hidden="true" />
              Score from the ring without signal — sync resumes when LTE returns.
            </li>
            <li>
              <Check width={18} height={18} strokeWidth={2.5} aria-hidden="true" />
              Replication queues in order. Sync resumes the moment LTE returns.
            </li>
            <li>
              <Check width={18} height={18} strokeWidth={2.5} aria-hidden="true" />
              Same app on iPhone, iPad, Android — install once from any browser.
            </li>
          </ul>
        </div>
        <div className="l-phone-card" aria-label="Example ringside view">
          <div className="l-phone-head">
            <div className="l-ring">Ring 2 · Container · Novice A</div>
            <span className="l-offline-pill">
              <span className="l-dot" aria-hidden="true" />
              Offline
            </span>
          </div>
          {ENTRIES.map(entry => (
            <div key={entry.armband} className="l-entry">
              <div className="l-armband">{entry.armband}</div>
              <div className="l-dog">
                <div className="l-name">{entry.name}</div>
                <div className="l-meta">{entry.meta}</div>
              </div>
              <div className={`l-res ${entry.resultClass}`}>{entry.resultText}</div>
            </div>
          ))}
          <div className="l-foot-row">
            <span>3 of 12 scored · queued to sync</span>
            <span className="l-sync-time">last sync 11:48</span>
          </div>
        </div>
      </div>
    </section>
  );
}
