/* eslint-disable */
const RT = window.PREMIUM_RICH;

function S8Frame() {
  return (
    <>
      <div className="s8-frame"></div>
      <div className="s8-corner tl"></div>
      <div className="s8-corner tr"></div>
      <div className="s8-corner bl"></div>
      <div className="s8-corner br"></div>
    </>
  );
}

function Style8Traditional() {
  return (
    <div className="premium-doc s8">
      {/* COVER */}
      <div className="sheet">
        <S8Frame />
        <div className="s8-page">
          <div className="s8-cover">
            <div className="s8-supra">In its seventy-ninth year</div>
            <div className="s8-club">{RT.club}</div>
            <div className="s8-est">Established Anno Domini {RT.established}</div>

            <div className="s8-rule-orn">
              <span className="line"></span>
              <span className="di">❦</span>
              <span className="line"></span>
            </div>

            <div className="s8-presents">cordially presents its</div>
            <h1 className="s8-title">Spring <em>Scent Work</em><br/>Trial</h1>
            <div className="s8-subtitle">A.K.C. Licensed · Premium List</div>

            <div className="s8-rule-orn gold" style={{marginTop: 36}}>
              <span className="line"></span>
              <span className="di">✦</span>
              <span className="line"></span>
            </div>

            <div className="s8-cover-meta">
              <div>
                <div className="l">to be held</div>
                <div className="v">{RT.dateRange}</div>
              </div>
              <div>
                <div className="l">at</div>
                <div className="v">{RT.venue}</div>
              </div>
              <div>
                <div className="l">in</div>
                <div className="v">{RT.city}, {RT.state}</div>
              </div>
            </div>

            <div className="s8-seal">
              <div className="icon">B<span style={{fontStyle:'normal'}}>·</span>K<span style={{fontStyle:'normal'}}>·</span>C</div>
              <div className="lbl">Sigillum</div>
            </div>
          </div>

          <div className="s8-cover-foot">
            Entries close on the third day of June, Anno {2026}, at the hour of eight in the evening.
          </div>
        </div>
      </div>

      {/* OFFICERS + JUDGES */}
      <div className="sheet">
        <S8Frame />
        <div className="s8-page">
          <div className="s8-running">{RT.club} · Premium List · Folio II</div>
          <h2 className="s8-h2">A Word from the Chair</h2>
          <div className="s8-h2-eng">By way of Welcome</div>
          <p className="s8-prose" style={{margin:'0 32px 18px'}}>{RT.welcomeFromChair}</p>
          <p style={{textAlign:'center', fontFamily:'"Cormorant Garamond", serif', fontStyle:'italic', fontSize:14, color:'#6b4f3a', marginBottom:24}}>— {RT.trialCommittee[0].name}, {RT.trialCommittee[0].role}</p>

          <div className="s8-rule-orn gold"><span className="line"></span><span className="di">✦</span><span className="line"></span></div>

          <h2 className="s8-h2">Of the Venue</h2>
          <p className="s8-prose" style={{margin:'0 32px 18px'}}>{RT.venueDescription}</p>

          <div className="s8-rule-orn gold"><span className="line"></span><span className="di">✦</span><span className="line"></span></div>

          <h2 className="s8-h2">Officers &amp; Committee</h2>
          <div className="s8-h2-eng">In Whose Care This Trial Is Conducted</div>

          <div className="s8-officer-row">
            {[...RT.officers, ...RT.trialCommittee].map((o, i) => (
              <div className="o" key={i}>
                <span className="role">{o.role}</span>
                <span className="name">{o.name}</span>
              </div>
            ))}
          </div>

          <div className="s8-foot">— page two of five —</div>
        </div>
      </div>

      {/* TRIAL DETAILS — judges, classes, schedule */}
      <div className="sheet">
        <S8Frame />
        <div className="s8-page">
          <div className="s8-running">{RT.club} · Premium List · Folio III</div>

          <h2 className="s8-h2">The Judges</h2>
          <div className="s8-h2-eng">Approved by the American Kennel Club</div>

          {RT.judges.map((j, i) => (
            <div className="s8-judge-formal" key={i}>
              <div className="j-name">{j.name}</div>
              <div className="j-loc">of {j.city}</div>
              <div className="j-x">{j.trials} · {j.element}</div>
            </div>
          ))}

          <h2 className="s8-h2" style={{marginTop:18}}>Of the Classes Offered</h2>
          <div className="s8-h2-eng">Per A.K.C. Scent Work Regulations</div>

          <table className="s8-table">
            <thead><tr><th>Class</th><th>Elements</th><th>Time</th><th>Hides</th></tr></thead>
            <tbody>
              {RT.classes.map((c, i) => (
                <tr key={i}>
                  <td className="em" style={{fontSize:16}}>{c.level}</td>
                  <td>{c.elements.join(', ')}</td>
                  <td>{c.duration}</td>
                  <td>{c.hides}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="s8-foot">— page three of five —</div>
        </div>
      </div>

      {/* ENTRY + NOTICES */}
      <div className="sheet">
        <S8Frame />
        <div className="s8-page">
          <div className="s8-running">{RT.club} · Premium List · Folio IV</div>

          <h2 className="s8-h2">Order of the Day</h2>
          <p className="s8-prose" style={{margin:'0 32px 12px'}}>{RT.showHoursNarrative}</p>

          <table className="s8-table">
            <tbody>
              {RT.schedule.map((s, i) => (
                <tr key={i}>
                  <td className="em" style={{width:120}}>{s.time}</td>
                  <td>{s.item}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="s8-h2" style={{marginTop:20}}>Of the Entry &amp; Its Fee</h2>

          <div className="s8-fees">
            <div className="s8-fee"><div className="n">${RT.fees.firstEntry}</div><div className="l">first entry</div></div>
            <div className="s8-fee"><div className="n">${RT.fees.additional}</div><div className="l">each additional</div></div>
            <div className="s8-fee"><div className="n">${RT.fees.junior}</div><div className="l">junior handler</div></div>
          </div>

          <p className="s8-prose">Entries shall be received <em>by post, by electronic mail, or online</em>, and must be in the hands of the Trial Secretary no later than {RT.closingTime} on {RT.closingDate}.</p>

          <div className="s8-foot">— page four of five —</div>
        </div>
      </div>

      {/* AWARDS, HOSPITALITY, NOTICES */}
      <div className="sheet">
        <S8Frame />
        <div className="s8-page">
          <div className="s8-running">{RT.club} · Premium List · Folio V</div>

          <h2 className="s8-h2">Of Awards</h2>
          <p className="s8-prose">{RT.awardsDescription}</p>

          <h2 className="s8-h2" style={{marginTop:18}}>Hospitality &amp; Veterinarian</h2>
          <p className="s8-prose">{RT.hospitalityNotes}</p>
          <p className="s8-prose"><em>On call:</em> {RT.vetClinic.name}, {RT.vetClinic.address} · {RT.vetClinic.phone}</p>

          <h2 className="s8-h2" style={{marginTop:18}}>Notices to Exhibitors</h2>

          <ul className="s8-list-formal">
            {RT.notices.map((n, i) => (
              <li key={i}><span className="n">{['I','II','III','IV','V'][i]}.</span>{n}</li>
            ))}
            <li><span className="n">VI.</span>{RT.additionalNotes}</li>
          </ul>

          <div className="s8-sig-row">
            <div className="sig">{RT.officers.find(o => o.role === 'President').name}, President</div>
            <div className="sig">{RT.trialCommittee[1].name}, Trial Secretary</div>
          </div>

          <div className="s8-foot">— in witness whereof, page five of five —</div>
        </div>
      </div>
    </div>
  );
}

window.Style8Traditional = Style8Traditional;
