/* eslint-disable */
const RF = window.PREMIUM_RICH;

function S7Tabs({ active }) {
  const tabs = ["Cover","Trial","Schedule","Entry"];
  return (
    <div className="s7-tabs">
      {tabs.map(t => (
        <div key={t} className={"s7-tab" + (t === active ? " active" : "")}>{t}</div>
      ))}
    </div>
  );
}

function Style7Field() {
  return (
    <div className="premium-doc s7">
      {/* COVER */}
      <div className="sheet">
        <div className="s7-page">
          <S7Tabs active="Cover" />
          <div className="s7-page-frame">
            <div className="s7-cover-mark">
              <div className="s7-compass"><div className="s7-compass-n">N</div></div>
              <div>
                <div className="s7-h1-sub">Field Guide · Premium List 01/2026</div>
                <div style={{fontFamily:'"IBM Plex Mono", monospace', fontSize:11, letterSpacing:'0.04em'}}>{RF.club} · Est. {RF.established} · {RF.city}, {RF.state}</div>
              </div>
            </div>

            <h1 className="s7-h1" style={{fontSize:64, marginTop: 24}}>Spring<br/>Scent Work<br/>Trial '26</h1>

            <div className="s7-strip" style={{marginTop: 28}}>
              <div className="cell"><div className="l">Dates</div><div className="v">{RF.dateRange}</div></div>
              <div className="cell"><div className="l">Trials</div><div className="v">Six over three days</div></div>
              <div className="cell"><div className="l">Limit</div><div className="v">{RF.entryLimits.total} entries total</div></div>
            </div>

            <div className="s7-section">
              <div className="s7-section-h"><span>§ 01 · The Venue</span><span className="ic">29.5°N 98.3°W</span></div>
              <div className="s7-section-b">
                <div className="s7-grid-2">
                  <div>
                    <div className="s7-kv"><span className="k">Site</span><span className="v">{RF.venue}</span></div>
                    <div className="s7-kv"><span className="k">Address</span><span className="v">{RF.venueAddress}</span></div>
                    <div className="s7-kv"><span className="k">Surface</span><span className="v">Indoor sealed concrete</span></div>
                    <div className="s7-kv"><span className="k">Climate</span><span className="v">68–72°F controlled</span></div>
                  </div>
                  <div>
                    <div className="s7-kv"><span className="k">Crating</span><span className="v">Adjacent hall, free</span></div>
                    <div className="s7-kv"><span className="k">Parking</span><span className="v">On-site, ample</span></div>
                    <div className="s7-kv"><span className="k">Food</span><span className="v">On site · open 7a–4p</span></div>
                    <div className="s7-kv"><span className="k">Pet vet</span><span className="v">Alamo Vet · 1.4 mi</span></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="s7-section">
              <div className="s7-section-h"><span>§ 02 · Trial Overview</span><span className="ic">REF</span></div>
              <div className="s7-section-b">
                <div className="s7-grid-3">
                  <div>
                    <div style={{fontFamily:'"IBM Plex Mono", monospace', fontSize:10, color:'#6b7066', marginBottom:4}}>OPENS</div>
                    <div style={{fontFamily:'"Inter Tight", sans-serif', fontSize:18, fontWeight:700}}>{RF.openingDate}</div>
                  </div>
                  <div>
                    <div style={{fontFamily:'"IBM Plex Mono", monospace', fontSize:10, color:'#6b7066', marginBottom:4}}>CLOSES</div>
                    <div style={{fontFamily:'"Inter Tight", sans-serif', fontSize:18, fontWeight:700, color:'#a83a1d'}}>{RF.closingDate}</div>
                  </div>
                  <div>
                    <div style={{fontFamily:'"IBM Plex Mono", monospace', fontSize:10, color:'#6b7066', marginBottom:4}}>DRAW</div>
                    <div style={{fontFamily:'"Inter Tight", sans-serif', fontSize:18, fontWeight:700}}>{RF.drawDate}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="s7-section">
              <div className="s7-section-h"><span>§ 03 · About the Trial</span><span className="ic">·</span></div>
              <div className="s7-section-b">
                <div style={{fontSize:12, lineHeight:1.5, marginBottom:10}}>{RF.trialInformationNarrative}</div>
                <div style={{fontSize:12, lineHeight:1.5, fontStyle:'italic', color:'#6b7066'}}>{RF.aboutTheClub}</div>
              </div>
            </div>

            <div className="s7-stamp">
              <div className="y">AKC</div>
              <div className="l">Licensed</div>
            </div>

            <div className="s7-foot">
              <span>FG-PRM-01</span>
              <span>{RF.club}</span>
              <span>p. 01 / 04</span>
            </div>
          </div>
        </div>
      </div>

      {/* TRIAL */}
      <div className="sheet">
        <div className="s7-page">
          <S7Tabs active="Trial" />
          <div className="s7-page-frame">
            <div className="s7-h1-sub">§ 03 — § 04</div>
            <h2 className="s7-h1">Judges &amp; Classes</h2>

            <div className="s7-section">
              <div className="s7-section-h"><span>§ 03 · Judging Panel</span><span className="ic">02</span></div>
              <div className="s7-section-b">
                {RF.judges.map((j, i) => (
                  <div key={i} style={{display:'grid', gridTemplateColumns:'48px 1fr', gap:12, padding:'10px 0', borderBottom: i < RF.judges.length-1 ? '1px dashed #b5b09a' : 'none'}}>
                    <div style={{width:48, height:48, background:'#2d5d4a', color:'#f3f0e7', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'"Inter Tight", sans-serif', fontWeight:800, fontSize:18, letterSpacing:'-0.02em'}}>
                      {j.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <div style={{fontFamily:'"Inter Tight", sans-serif', fontWeight:700, fontSize:16}}>{j.name}</div>
                      <div style={{fontFamily:'"IBM Plex Mono", monospace', fontSize:10, color:'#6b7066', marginTop:2}}>{j.city} · {j.trials}</div>
                      <div style={{fontSize:12, marginTop:4}}>{j.element}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="s7-section">
              <div className="s7-section-h"><span>§ 04 · Class Specifications</span><span className="ic">04</span></div>
              <div className="s7-section-b">
                <div style={{display:'grid', gridTemplateColumns:'60px 1fr 80px 80px', gap:8, paddingBottom:6, borderBottom:'2px solid #1f2a24', fontFamily:'"IBM Plex Mono", monospace', fontSize:9, letterSpacing:'0.18em', textTransform:'uppercase', color:'#6b7066'}}>
                  <span>Lv</span><span>Elements</span><span style={{textAlign:'right'}}>Time</span><span style={{textAlign:'right'}}>Hides</span>
                </div>
                {RF.classes.map((c, i) => {
                  const code = c.level[0];
                  return (
                    <div className="s7-spec-row" key={i}>
                      <div className="lvl" data-l={code}>{code}</div>
                      <div>
                        <div style={{fontWeight:600, fontSize:13}}>{c.level}</div>
                        <div style={{fontSize:11, color:'#6b7066'}}>{c.elements.join(', ')}</div>
                      </div>
                      <div className="meta">{c.duration}</div>
                      <div className="meta">{c.hides}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="s7-foot">
              <span>FG-PRM-02</span><span>{RF.club}</span><span>p. 02 / 04</span>
            </div>
          </div>
        </div>
      </div>

      {/* SCHEDULE */}
      <div className="sheet">
        <div className="s7-page">
          <S7Tabs active="Schedule" />
          <div className="s7-page-frame">
            <div className="s7-h1-sub">§ 05 — § 06</div>
            <h2 className="s7-h1">Schedule &amp; Awards</h2>

            <div className="s7-section">
              <div className="s7-section-h"><span>§ 05 · Order of the Day</span><span className="ic">07</span></div>
              <div className="s7-section-b">
                <div style={{fontSize:12, lineHeight:1.5, marginBottom:12, color:'#1f2a24'}}>{RF.showHoursNarrative}</div>
                <table className="s7-table">
                  <thead><tr><th style={{width:90}}>Time</th><th>Event</th></tr></thead>
                  <tbody>
                    {RF.schedule.map((s, i) => (
                      <tr key={i}><td style={{fontFamily:'"IBM Plex Mono", monospace'}}>{s.time}</td><td>{s.item}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="s7-section">
              <div className="s7-section-h"><span>§ 06 · Awards Offered</span><span className="ic">·</span></div>
              <div className="s7-section-b">
                <div style={{fontSize:12, lineHeight:1.5}}>{RF.awardsDescription}</div>
              </div>
            </div>

            <div className="s7-section">
              <div className="s7-section-h"><span>§ 07 · Trial Days</span><span className="ic">03</span></div>
              <div className="s7-section-b">
                <table className="s7-table">
                  <tbody>
                    {RF.days.map((d, i) => (
                      <tr key={i}><td style={{fontWeight:700}}>{d.date}</td><td>{d.trial}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="s7-foot">
              <span>FG-PRM-03</span><span>{RF.club}</span><span>p. 03 / 04</span>
            </div>
          </div>
        </div>
      </div>

      {/* ENTRY */}
      <div className="sheet">
        <div className="s7-page">
          <S7Tabs active="Entry" />
          <div className="s7-page-frame">
            <div className="s7-h1-sub">§ 08 — § 11</div>
            <h2 className="s7-h1">Entry &amp; Lodging</h2>

            <div className="s7-section">
              <div className="s7-section-h"><span>§ 08 · Fees</span><span className="ic">USD</span></div>
              <div className="s7-section-b">
                <div className="s7-fee-bar">
                  <div className="b"><div className="l">First Entry</div><div className="n">${RF.fees.firstEntry}</div><div className="x">per dog · per trial</div></div>
                  <div className="b"><div className="l">Each Add'l</div><div className="n">${RF.fees.additional}</div><div className="x">same dog · add'l trials</div></div>
                  <div className="b"><div className="l">Junior</div><div className="n">${RF.fees.junior}</div><div className="x">handlers under 18</div></div>
                </div>
              </div>
            </div>

            <div className="s7-section">
              <div className="s7-section-h"><span>§ 09 · How to Enter</span><span className="ic">03</span></div>
              <div className="s7-section-b">
                <table className="s7-table">
                  <tbody>
                    {RF.entryMethods.map((m, i) => (
                      <tr key={i}><td style={{width:80, fontWeight:700}}>{m.method}</td><td>{m.detail}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="s7-section">
              <div className="s7-section-h"><span>§ 10 · Lodging</span><span className="ic">{RF.hotels.length}</span></div>
              <div className="s7-section-b">
                <table className="s7-table">
                  <thead><tr><th>Property</th><th>Distance</th><th>Rate</th><th>Code</th></tr></thead>
                  <tbody>
                    {RF.hotels.map((h, i) => (
                      <tr key={i}><td style={{fontWeight:600}}>{h.name}</td><td>{h.distance}</td><td>{h.rate}</td><td style={{fontFamily:'"IBM Plex Mono", monospace'}}>{h.code}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="s7-section">
              <div className="s7-section-h"><span>§ 11 · On-call Veterinarian</span><span className="ic">VET</span></div>
              <div className="s7-section-b">
                <div style={{fontFamily:'"Inter Tight", sans-serif', fontSize:16, fontWeight:700}}>{RF.vetClinic.name}</div>
                <div style={{fontSize:12, color:'#1f2a24', marginTop:2}}>{RF.vetClinic.address}</div>
                <div style={{fontFamily:'"IBM Plex Mono", monospace', fontSize:11, color:'#6b7066', marginTop:4}}>{RF.vetClinic.phone}</div>
              </div>
            </div>

            <div className="s7-section">
              <div className="s7-section-h"><span>§ 12 · Hospitality</span><span className="ic">·</span></div>
              <div className="s7-section-b">
                <div style={{fontSize:12, lineHeight:1.5}}>{RF.hospitalityNotes}</div>
              </div>
            </div>

            <div className="s7-section">
              <div className="s7-section-h"><span>§ 13 · Additional Notes</span><span className="ic">·</span></div>
              <div className="s7-section-b">
                <div style={{fontSize:12, lineHeight:1.5}}>{RF.additionalNotes}</div>
              </div>
            </div>

            <div className="s7-section">
              <div className="s7-section-h"><span>§ 14 · Trial Secretary</span><span className="ic">CONTACT</span></div>
              <div className="s7-section-b">
                <div style={{fontFamily:'"Inter Tight", sans-serif', fontSize:18, fontWeight:700}}>{RF.trialCommittee[1].name}</div>
                <div style={{fontFamily:'"IBM Plex Mono", monospace', fontSize:11, color:'#6b7066', marginTop:4}}>{RF.trialCommittee[1].contact}</div>
              </div>
            </div>

            <div className="s7-foot">
              <span>FG-PRM-04</span><span>{RF.club}</span><span>p. 04 / 04</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.Style7Field = Style7Field;
