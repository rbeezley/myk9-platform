/* page.js — vanilla wiring: clone waitlist form into slots, handle submit,
   switch hero variants, cycle headlines, change accent, etc. */
(function () {
  const tmpl = document.getElementById('waitlist-template');
  document.querySelectorAll('[data-waitlist-slot]').forEach((slot) => {
    slot.appendChild(tmpl.content.cloneNode(true));
  });

  // Pre-launch: submit just shows success (no backend wired)
  window.__myk9_submit = function (e) {
    e.preventDefault();
    const form = e.target;
    const email = form.querySelector('input[name="email"]').value;
    form.innerHTML =
      '<div class="success">' +
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
      '<div><strong style="display:block;color:var(--ink-900);font-size:14px;margin-bottom:2px">You\'re in line.</strong>' +
      '<span style="color:var(--stone-700)">We\'ll email <strong style="font-family:var(--font-mono);font-weight:600">' + (email || 'you') + '</strong> when myK9Show is ready.</span></div></div>';
    return false;
  };

  // Header "Join the waitlist" — scroll to the closing form
  const joinBtn = document.getElementById('join-cta');
  if (joinBtn) {
    joinBtn.addEventListener('click', () => {
      const closing = document.querySelector('.closing');
      if (closing) closing.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Demo-mode link interceptor: production routes like /pricing, /signin,
  // /legal exist in the React app but not in this static mockup. Intercept
  // absolute-path clicks and scroll to the closing waitlist so nothing 404s.
  // The hrefs themselves stay intact for production.
  document.querySelectorAll('a[href^="/"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.querySelector('.closing');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // ─── Tweak appliers (idempotent) ─────────────────────────
  function applyHero(variant) {
    document.querySelectorAll('.hero[data-variant]').forEach((h) => {
      h.hidden = h.dataset.variant !== variant;
    });
  }
  function applyHeadline(idx) {
    document.querySelectorAll('.hero-headline').forEach((h) => {
      h.hidden = String(h.dataset.headline) !== String(idx);
    });
  }
  function applyAccent(name) {
    const r = document.documentElement;
    if (name === 'terracotta') {
      r.style.setProperty('--primary', 'var(--terracotta-500)');
      r.style.setProperty('--primary-hover', 'var(--terracotta-600)');
      r.style.setProperty('--ring', 'rgba(201,100,66,0.45)');
    } else {
      r.style.removeProperty('--primary');
      r.style.removeProperty('--primary-hover');
      r.style.removeProperty('--ring');
    }
  }
  function applyFields(mode) {
    document.body.setAttribute('data-fields', mode);
  }
  function applyToggle(section, on) {
    document.querySelectorAll('[data-section="' + section + '"]').forEach((el) => {
      el.hidden = !on;
    });
  }

  window.__myk9_apply = function (tweaks) {
    if (tweaks.heroVariant) applyHero(tweaks.heroVariant);
    if (tweaks.headlineIdx !== undefined) applyHeadline(tweaks.headlineIdx);
    if (tweaks.accent) applyAccent(tweaks.accent);
    if (tweaks.waitlistFields) applyFields(tweaks.waitlistFields);
    if (tweaks.showRingside !== undefined) applyToggle('ringside', tweaks.showRingside);
    // showRoadmap reserved for future use
  };

  // Apply defaults immediately on load
  const defaults = window.TWEAK_DEFAULTS || {};
  window.__myk9_apply(defaults);

  if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
})();
