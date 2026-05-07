/* eslint-disable */
const RN = window.PREMIUM_RICH;

function Style6Newspaper() {
  return (
    <div className="premium-doc s6">
      {/* PAGE 1 — FRONT PAGE */}
      <div className="sheet">
        <div className="s6-page">
          <div className="s6-mast-top">
            <span>Vol. LXXIX · No. 1</span>
            <span>The Premium of Record</span>
            <span>Twenty-Five Cents</span>
          </div>
          <div className="s6-masthead">
            <h1>The Bexar Gazette</h1>
            <div className="sub">A Premium List in the Manner of an Honest Newspaper</div>
            <div className="latin">Canis · Officium · Veritas</div>
          </div>
          <div className="s6-meta-row">
            <span>{RN.city}, {RN.state}</span>
            <span>Wednesday, May 6, 2026</span>
            <span>Closing: {RN.closingDate}</span>
            <span>{RN.club}</span>
          </div>

          <div className="s6-cols s6-cols-2u">
            <div>
              <div className="s6-kicker">Spring Trial · Page One</div>
              <h2 className="s6-deck">Bexar County Kennel Club to Hold Spring Scent Work Trial</h2>
              <div className="s6-subdeck">Six trials over three days at Live Oak Civic Center; entries open April fifteenth, close June third at eight o'clock in the evening.</div>
              <div className="s6-byline">By the Trial Committee · {RN.dateRange}</div>
              <div className="s6-cols s6-cols-2">
                <p>{RN.trialInformationNarrative}</p>
                <p>{RN.venueDescription}</p>
              </div>
            </div>
            <div>
              <div className="s6-cap">Photograph · Live Oak Civic Center</div>
              <div className="s6-img"></div>
              <div className="s6-img-cap">"The grounds at Live Oak — climate-controlled and well lit, with crating in the adjacent hall."</div>

              <div className="s6-h-section">The Judges</div>
              <div className="s6-judge-strip">
                {RN.judges.map((j, i) => (
                  <div className="j" key={i}>
                    <div className="n">{j.name}</div>
                    <div className="c">{j.city}</div>
                    <div className="x">{j.trials}<br/>{j.element}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="s6-foot">
            <span>{RN.club}</span>
            <span>Page One</span>
            <span>Generated · myK9Show</span>
          </div>
        </div>
      </div>

      {/* PAGE 2 — SCHEDULE & CLASSES */}
      <div className="sheet">
        <div className="s6-page">
          <div className="s6-meta-row">
            <span>Page Two</span>
            <span>Schedule · Classes · Elements</span>
            <span>{RN.club}</span>
          </div>

          <div className="s6-kicker">Order of the Day</div>
          <h2 className="s6-deck">A Day at the Trial</h2>
          <div style={{display:'flex', gap:18, alignItems:'flex-start', margin:'0 0 14px', borderTop:'1px solid #2a2520', borderBottom:'1px solid #2a2520', padding:'10px 0'}}>
            <div style={{flex:'0 0 40%'}}>
              <div className="s6-h-section" style={{marginTop:0}}>From the Chair</div>
              <p style={{fontFamily:'"Cormorant Garamond", serif', fontStyle:'italic', fontSize:13, lineHeight:1.5, color:'#4a3f2c', margin:'0 0 6px'}}>{RN.welcomeFromChair}</p>
              <p style={{fontFamily:'"IBM Plex Mono", monospace', fontSize:9, letterSpacing:'0.16em', textTransform:'uppercase', color:'#6b5d3f', margin:0}}>— {RN.trialCommittee[0].name}, {RN.trialCommittee[0].role}</p>
            </div>
            <div style={{flex:1}}>
              <div className="s6-pull" style={{margin:0}}>"{RN.tagline}"</div>
            </div>
          </div>
          <p style={{fontFamily:'"Source Serif 4", Georgia, serif', fontSize:11, lineHeight:1.55, columnCount:2, columnGap:24, margin:'0 0 14px'}}>{RN.showHoursNarrative} {RN.aboutTheClub}</p>

          <div className="s6-cols s6-cols-2">
            <div>
              <table className="s6-table">
                <thead><tr><th>Time</th><th>Item</th></tr></thead>
                <tbody>
                  {RN.schedule.map((s, i) => (
                    <tr key={i}><td><b>{s.time}</b></td><td>{s.item}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <div className="s6-h-section" style={{marginTop:0}}>Classes &amp; Elements</div>
              {RN.classes.map((c, i) => (
                <p key={i} style={{margin:'0 0 10px'}}>
                  <span style={{fontFamily:'"Playfair Display", serif', fontWeight:700, fontSize:15}}>{c.level}</span> — {c.elements.join(', ')}. <em>{c.duration}</em>, {c.hides}.
                </p>
              ))}

              <div className="s6-h-section">Trial Days</div>
              {RN.days.map((d, i) => (
                <p key={i} style={{margin:'0 0 6px'}}>
                  <b style={{fontFamily:'"Playfair Display", serif'}}>{d.date}</b> — {d.trial}
                </p>
              ))}
            </div>
          </div>

          <div className="s6-foot">
            <span>{RN.club}</span>
            <span>Page Two</span>
            <span>Generated · myK9Show</span>
          </div>
        </div>
      </div>

      {/* PAGE 3 — CLASSIFIEDS (entry methods, hotels, awards) */}
      <div className="sheet">
        <div className="s6-page">
          <div className="s6-meta-row">
            <span>Page Three</span>
            <span>Notices &amp; Entries</span>
            <span>{RN.club}</span>
          </div>

          <div className="s6-classified-h">
            <div className="t">The Classifieds</div>
            <div className="s">Lodging · Entries · Awards · Notices</div>
          </div>

          <div className="s6-ad-grid">
            <div className="s6-ad">
              <div className="hd">Entry — Online</div>
              <div className="bd"><b>The fastest path.</b> Visit myk9show.com/bckc-spring-2026. Pay by card; receive instant confirmation. Closes {RN.closingTime} on {RN.closingDate}.</div>
            </div>
            <div className="s6-ad">
              <div className="hd">Entry — By Mail</div>
              <div className="bd"><b>Old-fashioned, reliable.</b> {RN.entryMethods[1].detail}. Postmark must precede closing.</div>
            </div>
            <div className="s6-ad">
              <div className="hd">Entry — By E-Mail</div>
              <div className="bd"><b>PDF and a payment ref.</b> {RN.entryMethods[2].detail}.</div>
            </div>
            {RN.hotels.map((h, i) => (
              <div className="s6-ad" key={i}>
                <div className="hd">Lodging — {h.name}</div>
                <div className="bd"><b>{h.distance}</b> from venue. <b>{h.rate}</b>/night with code <b>{h.code}</b>. Pet-friendly upon request.</div>
              </div>
            ))}
            <div className="s6-ad">
              <div className="hd">First Entry</div>
              <div className="bd"><b>${RN.fees.firstEntry}.00</b> per dog, per trial. Additional entries <b>${RN.fees.additional}.00</b>. Junior handlers <b>${RN.fees.junior}.00</b>.</div>
            </div>
            <div className="s6-ad">
              <div className="hd">Awards Offered</div>
              <div className="bd">{RN.awardsDescription}</div>
            </div>
            <div className="s6-ad">
              <div className="hd">On-call Veterinarian</div>
              <div className="bd"><b>{RN.vetClinic.name}</b><br/>{RN.vetClinic.address}<br/>{RN.vetClinic.phone}</div>
            </div>
            <div className="s6-ad">
              <div className="hd">Hospitality</div>
              <div className="bd">{RN.hospitalityNotes}</div>
            </div>
            <div className="s6-ad">
              <div className="hd">Trial Secretary</div>
              <div className="bd"><b>{RN.trialCommittee[1].name}</b><br/>{RN.trialCommittee[1].contact}</div>
            </div>
          </div>

          <div className="s6-foot">
            <span>{RN.club}</span>
            <span>Page Three</span>
            <span>Generated · myK9Show</span>
          </div>
        </div>
      </div>

      {/* PAGE 4 — NOTICES + OFFICERS */}
      <div className="sheet">
        <div className="s6-page">
          <div className="s6-meta-row">
            <span>Page Four</span>
            <span>Notices · The Committee</span>
            <span>{RN.club}</span>
          </div>

          <div className="s6-kicker">Of Record</div>
          <h2 className="s6-deck">Notices to Exhibitors</h2>

          <div className="s6-cols s6-cols-2">
            <div>
              {RN.notices.map((n, i) => (
                <p key={i} style={{borderLeft:'3px solid #a83a1d', paddingLeft:12, margin:'0 0 12px'}}>
                  <span style={{fontFamily:'"IBM Plex Mono", monospace', fontSize:10, letterSpacing:'0.16em', textTransform:'uppercase', color:'#a83a1d'}}>Notice {String(i+1).padStart(2,'0')}.</span><br/>
                  {n}
                </p>
              ))}
              <p style={{borderLeft:'3px solid #a83a1d', paddingLeft:12, margin:'0 0 12px', fontStyle:'italic'}}>
                <span style={{fontFamily:'"IBM Plex Mono", monospace', fontSize:10, letterSpacing:'0.16em', textTransform:'uppercase', color:'#a83a1d', fontStyle:'normal'}}>Additional</span><br/>
                {RN.additionalNotes}
              </p>
            </div>
            <div>
              <div className="s6-h-section" style={{marginTop:0}}>The Committee</div>
              <table className="s6-table">
                <tbody>
                  {[...RN.officers, ...RN.trialCommittee].map((o, i) => (
                    <tr key={i}><td><b>{o.role}</b></td><td>{o.name}</td></tr>
                  ))}
                </tbody>
              </table>

              <div className="s6-h-section">Sponsors</div>
              <p style={{fontFamily:'"Cormorant Garamond", serif', fontStyle:'italic', fontSize:15}}>
                With grateful thanks to {RN.sponsors.join(', ')}.
              </p>
            </div>
          </div>

          <div className="s6-foot">
            <span>{RN.club}</span>
            <span>Page Four · End</span>
            <span>Generated · myK9Show</span>
          </div>
        </div>
      </div>
    </div>
  );
}

window.Style6Newspaper = Style6Newspaper;
