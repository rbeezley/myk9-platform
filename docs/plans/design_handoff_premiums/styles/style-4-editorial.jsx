/* eslint-disable */
const R = window.PREMIUM_RICH;

function S4Page({ children, runningHead, foot, cream }) {
  return (
    <div className="sheet" data-cream>
      {runningHead && <div className="s4-running-head">{runningHead}</div>}
      <div className="s4-page" style={{paddingTop: 64, paddingBottom: 80, height:'100%', boxSizing:'border-box'}}>
        {children}
      </div>
      {foot && <div className="s4-running-foot"><span>{foot.l}</span><span>{foot.r}</span></div>}
    </div>
  );
}

function Style4Editorial() {
  return (
    <div className="premium-doc s4">
      {/* COVER */}
      <div className="sheet" data-cream>
        <div className="s4-cover">
          <div className="s4-cover-top">
            <span>Vol. {2026 - R.established} · Issue 01</span>
            <span>Premium List · Spring '26</span>
          </div>
          <div className="s4-issue">{R.club}</div>
          <h1>Spring<br/><em>Scent</em> Work</h1>
          <div className="s4-tagline">{R.tagline}</div>
          <div className="s4-cover-art">
            <image-slot id="s4-cover-photo" shape="rect" placeholder="Drop venue photo or club crest (optional)" style={{position:'absolute', inset:0, width:'100%', height:'100%', zIndex:1}}></image-slot>
            <div className="s4-cover-art-fallback">
              <div className="hd">At a Glance</div>
              <div className="rule"></div>
              <div className="rows">
                <div className="r"><span className="k">Trials</span><span className="v">Six over three days</span></div>
                <div className="r"><span className="k">Elements</span><span className="v">Container · Buried · Interior · Exterior</span></div>
                <div className="r"><span className="k">Levels</span><span className="v">Novice through Detective</span></div>
                <div className="r"><span className="k">Sanctioning</span><span className="v">A.K.C. Licensed</span></div>
                <div className="r"><span className="k">Field Limit</span><span className="v">{R.entryLimits.total} runs</span></div>
              </div>
            </div>
          </div>
          <div className="s4-cover-bottom">
            <div className="left">
              An AKC-licensed scent work trial held in San Antonio over three days, judged by Cynthia Beagles &amp; Marcus Whitfield.
            </div>
            <div className="right">
              {R.dateRange}<br/>
              {R.city}, {R.state}
            </div>
          </div>
        </div>
      </div>

      {/* TOC + LETTER FROM THE CHAIR */}
      <S4Page runningHead={`${R.club} · Premium List`} foot={{l: "Spring Scent Work Trial", r: "p. 02"}}>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:48, height:'100%'}}>
          <div>
            <div className="s4-eyebrow">Inside this premium</div>
            <div className="s4-rule" />
            <div className="s4-toc">
              <span className="num">01</span><span className="t">The Trial</span><span className="pg">04</span>
              <span className="num">02</span><span className="t">Judges &amp; Assignments</span><span className="pg">05</span>
              <span className="num">03</span><span className="t">Classes &amp; Elements</span><span className="pg">06</span>
              <span className="num">04</span><span className="t">Schedule of Events</span><span className="pg">06</span>
              <span className="num">05</span><span className="t">Fees, Limits, Entry Methods</span><span className="pg">07</span>
              <span className="num">06</span><span className="t">Awards &amp; Notices</span><span className="pg">07</span>
              <span className="num">07</span><span className="t">Lodging &amp; Officers</span><span className="pg">08</span>
            </div>
          </div>
          <div>
            <div className="s4-eyebrow">From the trial chair</div>
            <div className="s4-rule" />
            <p className="s4-lede">{R.welcomeFromChair}</p>
            <p style={{fontFamily:'"Cormorant Garamond", serif', fontStyle:'italic', fontSize:18, marginTop:24, color:'#6b5d3f'}}>
              — {R.trialCommittee[0].name}, {R.trialCommittee[0].role}
            </p>
            <div className="s4-eyebrow" style={{marginTop:32}}>About the club</div>
            <div className="s4-rule" />
            <p style={{fontFamily:'"EB Garamond", serif', fontSize:13.5, lineHeight:1.55, color:'#3e362a'}}>{R.aboutTheClub}</p>
          </div>
        </div>
      </S4Page>

      {/* THE TRIAL + JUDGES */}
      <S4Page runningHead={`${R.club} · Premium List`} foot={{l: "Trial · Judges", r: "p. 04 — 05"}}>
        <div className="s4-eyebrow">Section One</div>
        <h2 className="s4-h1">The <em>Trial</em></h2>
        <div className="s4-rule" />
        <p className="s4-lede" style={{marginBottom:24}}>{R.trialInformationNarrative}</p>

        <div className="s4-pullquote">
          "{R.tagline}"
        </div>

        <div className="s4-eyebrow">The Venue</div>
        <div className="s4-rule" />
        <p style={{fontFamily:'"EB Garamond", serif', fontSize:14, lineHeight:1.55, marginBottom:24}}>{R.venueDescription}</p>

        <div className="s4-eyebrow">Section Two — Judges</div>
        <div className="s4-rule" />
        {R.judges.map((j, i) => (
          <div className="s4-judge-card" key={i}>
            <div className="s4-judge-portrait">{j.name.split(' ').map(n => n[0]).join('')}</div>
            <div>
              <div className="s4-judge-name">{j.name}</div>
              <div className="s4-judge-loc">{j.city}</div>
              <div className="s4-judge-meta">{j.trials}</div>
              <div className="s4-judge-element">{j.element}</div>
            </div>
          </div>
        ))}
      </S4Page>

      {/* CLASSES + SCHEDULE + FEES */}
      <S4Page runningHead={`${R.club} · Premium List`} foot={{l: "Classes · Schedule · Fees", r: "p. 06 — 07"}}>
        <div className="s4-eyebrow">Section Three</div>
        <h2 className="s4-h2">Classes &amp; Elements</h2>
        <div className="s4-rule" />
        <div className="s4-2col">
          {R.classes.map((c, i) => (
            <p key={i}>
              <strong style={{fontFamily:'"Playfair Display", serif', fontSize:16}}>{c.level}.</strong>{" "}
              {c.elements.join(', ')}. <em>{c.duration}</em>, {c.hides}.
            </p>
          ))}
        </div>

        <div style={{marginTop:36}} className="s4-eyebrow">Section Four — A Day at the Trial</div>
        <div className="s4-rule" />
        <p style={{fontFamily:'"EB Garamond", serif', fontSize:13.5, lineHeight:1.5, marginBottom:14, color:'#3e362a'}}>{R.showHoursNarrative}</p>
        <div className="s4-schedule">
          {R.schedule.map((s, i) => (
            <React.Fragment key={i}>
              <span className="t">{s.time}</span>
              <span className="x">{s.item}</span>
            </React.Fragment>
          ))}
        </div>

        <div style={{marginTop:36}} className="s4-eyebrow">Section Five — Fees</div>
        <div className="s4-rule" />
        <div className="s4-fees">
          <div className="s4-fee"><div className="n">${R.fees.firstEntry}</div><div className="l">First Entry</div></div>
          <div className="s4-fee"><div className="n">${R.fees.additional}</div><div className="l">Additional</div></div>
          <div className="s4-fee"><div className="n">${R.fees.junior}</div><div className="l">Junior Handler</div></div>
        </div>
        <p style={{fontFamily:'"Cormorant Garamond", serif', fontStyle:'italic', textAlign:'center', marginTop:18, color:'#6b5d3f'}}>
          {R.fees.refundPolicy}
        </p>
      </S4Page>

      {/* HOTELS + OFFICERS */}
      <S4Page runningHead={`${R.club} · Premium List`} foot={{l: "Lodging · Committee", r: "p. 08"}}>
        <div className="s4-eyebrow">Section Six — Awards</div>
        <div className="s4-rule" />
        <p style={{fontFamily:'"EB Garamond", serif', fontSize:14, lineHeight:1.55, marginBottom:24, color:'#3e362a'}}>{R.awardsDescription}</p>

        <div className="s4-eyebrow">Section Seven — Lodging</div>
        <div className="s4-rule" />
        {R.hotels.map((h, i) => (
          <div key={i} className="s4-hotel-row">
            <div className="h-name">{h.name}</div>
            <div className="h-meta">{h.distance}</div>
            <div className="h-meta">{h.rate}/night</div>
            <div className="h-meta">{h.code}</div>
          </div>
        ))}

        <div style={{marginTop:24, display:'grid', gridTemplateColumns:'1fr 1fr', gap:32}}>
          <div>
            <div className="s4-eyebrow">On-call Veterinarian</div>
            <div className="s4-rule" />
            <div style={{fontFamily:'"Playfair Display", serif', fontWeight:700, fontSize:16}}>{R.vetClinic.name}</div>
            <div style={{fontFamily:'"EB Garamond", serif', fontSize:13, color:'#3e362a'}}>{R.vetClinic.address}</div>
            <div style={{fontFamily:'"IBM Plex Mono", monospace', fontSize:11, color:'#6b5d3f', marginTop:4}}>{R.vetClinic.phone}</div>
          </div>
          <div>
            <div className="s4-eyebrow">Hospitality</div>
            <div className="s4-rule" />
            <p style={{fontFamily:'"Cormorant Garamond", serif', fontStyle:'italic', fontSize:15, lineHeight:1.45, color:'#3e362a', margin:0}}>{R.hospitalityNotes}</p>
          </div>
        </div>

        <div style={{marginTop:24}} className="s4-eyebrow">Officers &amp; Committee</div>
        <div className="s4-rule" />
        <div className="s4-officers">
          {[...R.officers, ...R.trialCommittee].map((o, i) => (
            <div className="o" key={i}>
              <span className="role">{o.role}</span>
              <span className="name">{o.name}</span>
            </div>
          ))}
        </div>

        <div style={{marginTop:24}} className="s4-eyebrow">Additional Notes</div>
        <div className="s4-rule" />
        <p style={{fontFamily:'"EB Garamond", serif', fontSize:13, lineHeight:1.5, color:'#3e362a', margin:0}}>{R.additionalNotes}</p>

        <div style={{marginTop:24, paddingTop:14, borderTop:'1px solid #c9b896', fontFamily:'"Cormorant Garamond", serif', fontStyle:'italic', fontSize:14, textAlign:'center', color:'#6b5d3f'}}>
          Generated for {R.club} · myK9Show
        </div>
      </S4Page>
    </div>
  );
}

window.Style4Editorial = Style4Editorial;
