/* eslint-disable */
const RP = window.PREMIUM_RICH;

function Style5Poster() {
  return (
    <div className="premium-doc s5">
      {/* PAGE 1 — POSTER */}
      <div className="sheet">
        <div className="s5-poster">
          <div className="s5-top">
            <span>{RP.club} · Est. {RP.established}</span>
            <span>AKC Licensed</span>
            <span>Premium List No. 01 / 2026</span>
          </div>

          <div className="s5-club">{RP.club}</div>

          <h1 className="s5-title">
            Spring<br/>
            <span className="scribe">Scent</span><br/>
            Work <span className="accent">'26</span>
          </h1>

          <div className="s5-meta-strip">
            <div className="cell"><div className="l">When</div><div className="v">Jun 12–14</div></div>
            <div className="cell"><div className="l">Where</div><div className="v">San Antonio</div></div>
            <div className="cell"><div className="l">Trials</div><div className="v">Six</div></div>
            <div className="cell"><div className="l">Limit</div><div className="v">{RP.entryLimits.total}</div></div>
          </div>

          <div className="s5-poster-bottom">
            <div className="judges">
              <b>Judged by</b>
              {RP.judges.map(j => j.name).join(' & ')}
            </div>
            <div className="closing">
              Closes
              <b>{RP.closingDate}</b>
              {RP.closingTime}
            </div>
          </div>
        </div>
      </div>

      {/* PAGE 2 — TRIAL OVERVIEW */}
      <div className="sheet">
        <div className="s5-inner">
          <div className="s5-inner-head">
            <h2>The Trial</h2>
            <div className="pg">02 / 04</div>
          </div>

          <div className="s5-block">
            <div className="lbl">About</div>
            <div className="body">{RP.trialInformationNarrative}</div>
          </div>

          <div className="s5-block">
            <div className="lbl">Venue</div>
            <div className="body">
              <b>{RP.venue}</b><br/>
              {RP.venueAddress}<br/>
              <span style={{opacity:0.7}}>{RP.venueDescription}</span>
            </div>
          </div>

          <div className="s5-block">
            <div className="lbl">Hours</div>
            <div className="body">{RP.showHoursNarrative}</div>
          </div>

          <div className="s5-block">
            <div className="lbl">Schedule</div>
            <div className="body">
              {RP.days.map((d, i) => <div key={i}><b>{d.date}</b> — {d.trial}</div>)}
            </div>
          </div>

          <div className="s5-foot">
            <span>{RP.club}</span>
            <span>myK9Show</span>
            <span>02 / 04</span>
          </div>
        </div>
      </div>

      {/* PAGE 3 — JUDGES, CLASSES, AWARDS */}
      <div className="sheet">
        <div className="s5-inner">
          <div className="s5-inner-head">
            <h2>Judging</h2>
            <div className="pg">03 / 04</div>
          </div>

          <div className="s5-block">
            <div className="lbl">Judges</div>
            <div className="body">
              {RP.judges.map((j, i) => (
                <div key={i} style={{marginBottom: i<RP.judges.length-1 ? 10 : 0}}>
                  <b>{j.name}</b> ({j.city}) — {j.trials}<br/>
                  <span style={{opacity:0.7}}>{j.element}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="s5-block">
            <div className="lbl">Classes</div>
            <div className="body">
              {RP.classes.map((c, i) => (
                <div key={i}><b>{c.level}.</b> {c.elements.join(', ')} · {c.duration}, {c.hides}</div>
              ))}
            </div>
          </div>

          <div className="s5-block">
            <div className="lbl">Awards</div>
            <div className="body">{RP.awardsDescription}</div>
          </div>

          <div className="s5-block">
            <div className="lbl">Hospitality</div>
            <div className="body">{RP.hospitalityNotes}</div>
          </div>

          <div className="s5-foot">
            <span>{RP.club}</span>
            <span>myK9Show</span>
            <span>03 / 04</span>
          </div>
        </div>
      </div>

      {/* PAGE 4 — ENTRY + FEES + CONTACTS */}
      <div className="sheet">
        <div className="s5-inner">
          <div className="s5-inner-head">
            <h2>Entry</h2>
            <div className="pg">04 / 04</div>
          </div>

          <div className="s5-grid-2" style={{marginBottom: 28}}>
            <div className="s5-fee-card">
              <div className="l">First Entry</div>
              <div className="n">${RP.fees.firstEntry}</div>
              <div className="x">Per dog, per trial</div>
            </div>
            <div className="s5-fee-card alt">
              <div className="l">Each Additional</div>
              <div className="n">${RP.fees.additional}</div>
              <div className="x">Same dog, additional trials</div>
            </div>
          </div>

          <table className="s5-table" style={{marginBottom: 28}}>
            <thead><tr><th>Method</th><th>Detail</th></tr></thead>
            <tbody>
              {RP.entryMethods.map((m, i) => (
                <tr key={i}><td><b>{m.method}</b></td><td>{m.detail}</td></tr>
              ))}
            </tbody>
          </table>

          <div className="s5-block">
            <div className="lbl">Limits</div>
            <div className="body">
              <b>{RP.entryLimits.total}</b> total entries · {RP.entryLimits.perTrial} per trial · {RP.entryLimits.perDay} per day<br/>
              <span style={{opacity:0.7}}>{RP.entryLimits.note}</span>
            </div>
          </div>

          <div className="s5-block">
            <div className="lbl">Hospitality</div>
            <div className="body">{RP.hospitalityNotes}</div>
          </div>

          <div className="s5-block">
            <div className="lbl">On-call Vet</div>
            <div className="body">
              <b>{RP.vetClinic.name}</b><br/>
              {RP.vetClinic.address}<br/>
              <span style={{opacity:0.7}}>{RP.vetClinic.phone}</span>
            </div>
          </div>

          <div className="s5-block">
            <div className="lbl">Notes</div>
            <div className="body">{RP.additionalNotes}</div>
          </div>

          <div className="s5-block">
            <div className="lbl">Trial Sec.</div>
            <div className="body">
              <b>{RP.trialCommittee[1].name}</b><br/>
              {RP.trialCommittee[1].contact}
            </div>
          </div>

          <div className="s5-foot">
            <span>{RP.club}</span>
            <span>Generated · myK9Show</span>
            <span>04 / 04</span>
          </div>
        </div>
      </div>
    </div>
  );
}

window.Style5Poster = Style5Poster;
