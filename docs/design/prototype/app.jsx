/* app.jsx — Main app wiring all screens into the design canvas */
/* global React, ReactDOM, DesignCanvas, DCSection, DCArtboard, TweaksPanel, TweakSection, TweakSlider, TweakToggle, TweakRadio, useTweaks, PageShell, PageHeader, Button, BrowseTemplateB, ShowDetail, DogDetail, ClubDetail, PersonDetail, BrowseDogs, BrowseClubs, BrowsePeople, BrowseTrials, BrowseClasses, SecretaryMyShows, SecretaryEntriesPage, ClassRunSheet, SecretaryClassesDrilldown, ExhibitorClassDetail, ExhibitorMyEntries */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "baseFontSize": 18,
  "density": "comfortable",
  "cardStyle": "photo",
  "showSecondary": true,
  "highContrast": false,
  "buttonSize": "large",
  "role": "exhibitor"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  // Adapter so existing `setT({ key: val })` call-sites keep working with the
  // (key, val) signature of the shared useTweaks hook.
  const setT = (patch) => {
    for (const k of Object.keys(patch)) setTweak(k, patch[k]);
  };

  // Apply tweaks globally via CSS vars + body classes so every page responds.
  React.useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    // Base font size × density → one effective size, set inline so it always
    // wins (and so density actually takes effect).
    const densityScale = { spacious: 1.12, comfortable: 1, compact: 0.88 }[t.density] || 1;
    root.style.setProperty('--ui-base', t.baseFontSize + 'px');
    root.style.setProperty('--density-scale', densityScale);
    root.style.setProperty('--density-pad', (18 * densityScale) + 'px');
    root.style.setProperty('--density-gap', (14 * densityScale) + 'px');
    body.style.fontSize = (t.baseFontSize * densityScale) + 'px';

    // Button size → tap target height
    root.style.setProperty('--tap-primary', t.buttonSize === 'xl' ? '64px' : '56px');

    // High contrast
    body.classList.toggle('hc', t.highContrast);

    // Card style and secondary info — expose as body classes for CSS to target
    body.classList.remove('cs-photo', 'cs-text', 'cs-icon');
    body.classList.add('cs-' + t.cardStyle);
    body.classList.toggle('no-secondary', !t.showSecondary);

    // Role — terracotta vs teal accent; exposed as body class + data attr
    body.classList.toggle('role-secretary', t.role === 'secretary');
    body.setAttribute('data-role', t.role || 'exhibitor');
  }, [t]);

  return (
    <>
      <DesignCanvas title="myK9Show · committed design" subtitle="Browse (B) · unified detail · secretary home + in-show · Scent Work run sheet + exhibitor views">

        <DCSection id="browse" title="1 · Browse — row-cards (Direction B, committed)">
          <DCArtboard id="bShows" label="Shows — the canonical browse pattern, reused everywhere" width={1400} height={1000}>
            <div style={{ height: '100%' }}>
              <PageShell active="shows" crumbs={['Shows']}>
                <PageHeader eyebrow="Shows near you" title="Find a show to enter"
                  subtitle="19 shows within 60 miles in the next 30 days."
                  primary={<Button size="xl" icon="plus">Sign up a new dog</Button>}
                />
                <BrowseTemplateB />
              </PageShell>
            </div>
          </DCArtboard>
          <DCArtboard id="bDogs" label="Dogs" width={1400} height={900}>
            <PageShell active="dogs" crumbs={['Dogs']}>
              <PageHeader eyebrow="Your team" title="Your dogs" subtitle="All the dogs you own, handle, or co-own. Tap any to see shows, results and stats."
                primary={<Button size="xl" icon="plus">Add a dog</Button>} />
              <BrowseDogs />
            </PageShell>
          </DCArtboard>
          <DCArtboard id="bTrials" label="Trials" width={1400} height={900}>
            <PageShell active="trials" crumbs={['Trials']}>
              <PageHeader eyebrow="Upcoming trials" title="Trials" subtitle="A trial is a single day of competition. Many shows hold several trials back-to-back." />
              <BrowseTrials />
            </PageShell>
          </DCArtboard>
          <DCArtboard id="bClasses" label="Classes" width={1400} height={800}>
            <PageShell active="classes" crumbs={['Classes']}>
              <PageHeader eyebrow="All classes" title="Classes near you"
                subtitle="Classes are the specific groups your dog competes in. Filter to find yours." />
              <BrowseClasses />
            </PageShell>
          </DCArtboard>
          <DCArtboard id="bClubs" label="Clubs" width={1400} height={850}>
            <PageShell active="clubs" crumbs={['Clubs']}>
              <PageHeader eyebrow="Host clubs" title="Clubs near you"
                subtitle="The organizations that put on shows. Follow a club to see all of their upcoming events." />
              <BrowseClubs />
            </PageShell>
          </DCArtboard>
          <DCArtboard id="bPeople" label="People" width={1400} height={800}>
            <PageShell active="people" crumbs={['People']}>
              <PageHeader eyebrow="Judges & handlers" title="People" subtitle="Look up a judge's approved groups, or find a professional handler." />
              <BrowsePeople />
            </PageShell>
          </DCArtboard>
        </DCSection>

        <DCSection id="detail" title="2 · Unified tabbed detail — one template, four entity types">
          <DCArtboard id="dShow" label="Show detail (exhibitor)" width={1400} height={1100}><ShowDetail role="exhibitor" /></DCArtboard>
          <DCArtboard id="dDog" label="Dog detail" width={1400} height={1100}><DogDetail /></DCArtboard>
          <DCArtboard id="dClub" label="Club detail" width={1400} height={900}><ClubDetail /></DCArtboard>
          <DCArtboard id="dPerson" label="Person detail" width={1400} height={800}><PersonDetail /></DCArtboard>
        </DCSection>

        <DCSection id="secretary-home" title="3 · Secretary · My shows (home) — replaces the old dashboard">
          <DCArtboard id="secMyShows" label="My shows — 4 phase groups + attention strip at top" width={1400} height={1700}>
            <SecretaryMyShows />
          </DCArtboard>
        </DCSection>

        <DCSection id="secretary-inshow" title="4 · Secretary · in-show mode — context-bar keeps her anchored">
          <DCArtboard id="secEntries" label="Entries page (scoped to Lehigh Valley)" width={1400} height={1100}>
            <SecretaryEntriesPage />
          </DCArtboard>
          <DCArtboard id="secShow" label="Show detail (secretary tabs + Manage action)" width={1400} height={1100}>
            <ShowDetail role="secretary" />
          </DCArtboard>
        </DCSection>

        <DCSection id="scentwork-secretary" title="5 · Scent Work · Secretary — run the class">
          <DCArtboard id="swDrill" label="Classes — stacked Day → Trial → Element → Level drill-down" width={1400} height={1000}>
            <SecretaryClassesDrilldown />
          </DCArtboard>
          <DCArtboard id="swRunSheet" label="Class Run Sheet — check-in, run order, inline result entry" width={1400} height={1400}>
            <ClassRunSheet />
          </DCArtboard>
        </DCSection>

        <DCSection id="scentwork-exhibitor" title="6 · Scent Work · Exhibitor — &quot;where do I go? how did we score?&quot;">
          <DCArtboard id="swMyEntries" label="My entries at this show — ring timeline + grouped by dog" width={1400} height={1300}>
            <ExhibitorMyEntries />
          </DCArtboard>
          <DCArtboard id="swClassBefore" label="Class detail BEFORE — your dogs callout + run order" width={1400} height={1100}>
            <ExhibitorClassDetail state="before" />
          </DCArtboard>
          <DCArtboard id="swClassAfter" label="Class detail AFTER — results callout + full results" width={1400} height={1100}>
            <ExhibitorClassDetail state="after" />
          </DCArtboard>
        </DCSection>

      </DesignCanvas>

      <TweaksPanel title="Tweaks">
        <TweakSection title="Type & contrast">
          <TweakSlider label="Base font size" value={t.baseFontSize} min={14} max={22} step={1}
            onChange={v => setT({ baseFontSize: v })} suffix="px" />
          <TweakToggle label="High contrast mode" value={t.highContrast}
            onChange={v => setT({ highContrast: v })} />
        </TweakSection>
        <TweakSection title="Density">
          <TweakRadio label="Density" value={t.density}
            options={[{ value: 'spacious', label: 'Spacious' }, { value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]}
            onChange={v => setT({ density: v })} />
        </TweakSection>
        <TweakSection title="Cards">
          <TweakRadio label="Card style" value={t.cardStyle}
            options={[{ value: 'photo', label: 'Photo-first' }, { value: 'text', label: 'Text-first' }, { value: 'icon', label: 'Icon only' }]}
            onChange={v => setT({ cardStyle: v })} />
          <TweakToggle label="Show secondary info" value={t.showSecondary}
            onChange={v => setT({ showSecondary: v })} />
        </TweakSection>
        <TweakSection title="Buttons">
          <TweakRadio label="Button size" value={t.buttonSize}
            options={[{ value: 'default', label: 'Default' }, { value: 'xl', label: 'Extra large' }]}
            onChange={v => setT({ buttonSize: v })} />
        </TweakSection>
        <TweakSection title="Role (for preview)">
          <TweakRadio label="Viewing as" value={t.role || 'exhibitor'}
            options={[{ value: 'exhibitor', label: 'Exhibitor' }, { value: 'secretary', label: 'Secretary' }]}
            onChange={v => setT({ role: v })} />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
