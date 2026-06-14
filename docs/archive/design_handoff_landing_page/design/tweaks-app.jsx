/* tweaks-app.jsx — Tweaks panel for the myK9Show landing page.
   Mounts only when host activates edit mode; mutates DOM via window.__myk9_apply. */

(function () {
  const { useEffect } = React;
  const { TweaksPanel, useTweaks, TweakSection, TweakRadio, TweakSelect, TweakColor, TweakToggle } = window;

  function MyK9Tweaks() {
    const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS);

    // Mirror tweak state into the static page on every change.
    useEffect(() => {
      if (window.__myk9_apply) window.__myk9_apply(t);
    }, [t.heroVariant, t.headlineIdx, t.accent, t.waitlistFields, t.showRingside, t.showRoadmap]);

    return (
      <TweaksPanel title="Tweaks">
        <TweakSection label="Hero treatment">
          <TweakSelect
            label="Variant"
            value={t.heroVariant}
            options={[
              { value: 'split', label: 'A · Editorial split' },
              { value: 'bleed', label: 'B · Full-bleed photo' },
              { value: 'photo', label: 'C · Photo above, copy below' },
            ]}
            onChange={(v) => setTweak('heroVariant', v)}
          />
          <TweakSelect
            label="Headline"
            value={String(t.headlineIdx)}
            options={[
              { value: '0', label: '“Built for scent work first.”' },
              { value: '1', label: '“Ready for every ring by 2027.”' },
              { value: '2', label: '“Without the paperwork.”' },
            ]}
            onChange={(v) => setTweak('headlineIdx', Number(v))}
          />
        </TweakSection>

        <TweakSection label="Accent color">
          <TweakRadio
            label="Primary"
            value={t.accent}
            options={[
              { value: 'teal', label: 'Teal' },
              { value: 'terracotta', label: 'Terracotta' },
            ]}
            onChange={(v) => setTweak('accent', v)}
          />
        </TweakSection>

        <TweakSection label="Waitlist form">
          <TweakSelect
            label="Fields"
            value={t.waitlistFields}
            options={[
              { value: 'email', label: 'Email only (lowest friction)' },
              { value: 'email-role', label: 'Email + role' },
              { value: 'full', label: 'Email + name + role + body' },
            ]}
            onChange={(v) => setTweak('waitlistFields', v)}
          />
        </TweakSection>

        <TweakSection label="Sections">
          <TweakToggle
            label="Show offline / ringside callout"
            value={t.showRingside}
            onChange={(v) => setTweak('showRingside', v)}
          />
        </TweakSection>
      </TweaksPanel>
    );
  }

  // Mount into a dedicated host node
  const mount = document.createElement('div');
  mount.id = 'tweaks-root';
  document.body.appendChild(mount);
  ReactDOM.createRoot(mount).render(<MyK9Tweaks />);
})();
