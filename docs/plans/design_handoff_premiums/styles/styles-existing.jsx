/* eslint-disable */
// Existing 3 styles, recreated from the PDFs the user uploaded.
// They share the same skinny dataset.

const D = window.PREMIUM_SKINNY;

function ExStatRow() {
  return (
    <div className="stat-row">
      <div>
        <div className="stat-num">{D.totalEntries}</div>
        <div className="stat-lbl">Total Entries</div>
      </div>
      <div>
        <div className="stat-num">{D.judges.length}</div>
        <div className="stat-lbl">Judges</div>
      </div>
      <div>
        <div className="stat-num">{D.events.length}</div>
        <div className="stat-lbl">Events</div>
      </div>
      <div>
        <div className="stat-num">{D.days.length}</div>
        <div className="stat-lbl">Show Days</div>
      </div>
    </div>
  );
}

function ExSection({ title, children }) {
  return (
    <div className="section">
      <h2 className="section-title">{title}</h2>
      <div className="section-rule" />
      {children}
    </div>
  );
}

function ExEventInfo() {
  return (
    <div className="info-grid">
      <div>
        <div className="field-label">Show Type</div>
        <div className="field-value">{D.showType}</div>
      </div>
      <div>
        <div className="field-label">Location</div>
        <div className="field-value">{D.city}, {D.state}</div>
      </div>
      <div>
        <div className="field-label">Venue</div>
        <div className="field-value">{D.venue}</div>
      </div>
      <div>
        <div className="field-label">Dates</div>
        <div className="field-value">{D.dateRange}</div>
      </div>
      <div>
        <div className="field-label">Closing Date</div>
        <div className="field-value">{D.closingDate}, {D.closingTime}</div>
      </div>
      <div>
        <div className="field-label">Entry Fee</div>
        <div className="field-value">{D.entryFee} (first) · {D.additionalEntryFee} (additional)</div>
      </div>
    </div>
  );
}

function ExJudgesEvents() {
  return (
    <>
      <div className="section">
        <h2 className="section-title">Judges</h2>
        <div className="section-rule" />
        {D.judges.map((j, i) => (
          <div key={i} style={{display:'flex', justifyContent:'space-between', padding:'14px 0', borderBottom:'1px solid #eee', fontSize:14}}>
            <span style={{fontWeight:600}}>{j.name}</span>
            <span style={{color:'#666'}}>{j.panel}</span>
          </div>
        ))}
      </div>
      <div className="section">
        <h2 className="section-title">Events</h2>
        <div className="section-rule" />
        {D.events.map((e, i) => (
          <div key={i} style={{display:'grid', gridTemplateColumns:'120px 100px 1fr', padding:'12px 0', borderBottom:'1px solid #eee', fontSize:14}}>
            <span style={{color:'#666', fontFamily:'IBM Plex Mono, monospace', fontSize:12}}>{e.day}</span>
            <span style={{color:'#666', fontFamily:'IBM Plex Mono, monospace', fontSize:12}}>{e.time}</span>
            <span style={{fontWeight:500}}>{e.name}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function ExContacts() {
  return (
    <div className="section">
      <h2 className="section-title">Contacts</h2>
      <div className="section-rule" />
      <div className="info-grid">
        <div>
          <div className="field-label">Show Secretary</div>
          <div className="field-value">{D.showSecretary.name}</div>
          <div style={{fontSize:12, color:'#666', marginTop:4}}>{D.showSecretary.email}</div>
          <div style={{fontSize:12, color:'#666'}}>{D.showSecretary.phone}</div>
        </div>
        <div>
          <div className="field-label">Trial Chair</div>
          <div className="field-value">{D.trialChair.name}</div>
          <div style={{fontSize:12, color:'#666', marginTop:4}}>{D.trialChair.email}</div>
          <div style={{fontSize:12, color:'#666'}}>{D.trialChair.phone}</div>
        </div>
      </div>
    </div>
  );
}

function ExFooter({ pg }) {
  return (
    <div className="footer-stripe">
      <span>Generated via myK9Show</span>
      <span>Page {pg} of 3</span>
    </div>
  );
}

/* ---------- Style 1 ---------- */
function Style1Existing() {
  return (
    <div className="premium-doc ex-doc">
      <div className="sheet">
        <div className="ex1-hero">
          <div className="ex1-monogram">TC</div>
          <div className="ex1-club">{D.club}</div>
          <h1 className="ex1-title">{D.showName}</h1>
          <div className="ex1-meta">
            {D.dateRange}
            <span className="ex1-divider-dot" />
            {D.city}, {D.state}
          </div>
        </div>
        <ExStatRow />
        <ExSection title="Event Information"><ExEventInfo /></ExSection>
        <ExFooter pg={1} />
      </div>
      <div className="sheet">
        <ExJudgesEvents />
        <ExFooter pg={2} />
      </div>
      <div className="sheet">
        <ExContacts />
        <ExFooter pg={3} />
      </div>
    </div>
  );
}

/* ---------- Style 2 ---------- */
function Style2Existing() {
  return (
    <div className="premium-doc ex-doc">
      <div className="sheet">
        <div className="ex2-bar" />
        <div className="ex2-hero">
          <div>
            <div className="ex2-club">{D.club}</div>
            <h1>{D.showName}</h1>
            <div style={{fontSize:13, color:'#444'}}>{D.city}, {D.state} · {D.venue}</div>
          </div>
          <div className="ex2-date">
            {D.dateRange.toUpperCase()}
          </div>
        </div>
        <ExStatRow />
        <ExSection title="Event Information"><ExEventInfo /></ExSection>
        <ExFooter pg={1} />
      </div>
      <div className="sheet">
        <div className="ex2-bar" />
        <div style={{padding:'48px 0 0'}}>
          <ExJudgesEvents />
        </div>
        <ExFooter pg={2} />
      </div>
      <div className="sheet">
        <div className="ex2-bar" />
        <div style={{padding:'48px 0 0'}}>
          <ExContacts />
        </div>
        <ExFooter pg={3} />
      </div>
    </div>
  );
}

/* ---------- Style 3 ---------- */
function Style3Existing() {
  return (
    <div className="premium-doc ex-doc">
      <div className="sheet">
        <div className="ex3-hero">
          <div className="ex3-club">{D.club}</div>
          <h1 className="ex3-title">{D.showName}</h1>
          <div className="ex3-meta">
            <span>{D.dateRange}</span>
            <span>·</span>
            <span>{D.city}, {D.state}</span>
            <span>·</span>
            <span>{D.showType}</span>
          </div>
        </div>
        <ExStatRow />
        <ExSection title="Event Information"><ExEventInfo /></ExSection>
        <ExFooter pg={1} />
      </div>
      <div className="sheet">
        <ExJudgesEvents />
        <ExFooter pg={2} />
      </div>
      <div className="sheet">
        <ExContacts />
        <ExFooter pg={3} />
      </div>
    </div>
  );
}

Object.assign(window, { Style1Existing, Style2Existing, Style3Existing });
