# Landing page concepts — throwaway prototype

Question: which production landing-page structure best communicates value and gives clubs and exhibitors a clear next step?

- A: warm photography and compact hero. Recommended starting point.
- B: secretary workflow and product evidence first.
- C: equal club and exhibitor paths.

The hero photo is not committed here — it is the same file the app already
ships. Fetch it once, then run the server, both from this directory:

```
cp ../public/hero-ziva-tera.jpg .
python3 -m http.server 4179 --bind 127.0.0.1
```

Open http://127.0.0.1:4179/?variant=A. Use the bottom arrows or keyboard left/right to compare. The URL preserves the selected concept. Built JavaScript is included; authored interaction code is TypeScript in main.ts. No package installation is needed. Fonts use Google Fonts with local fallbacks.

This isolated preview follows the user's request to leave the app unchanged. No live submissions, authentication, or data connections. Product screenshot-like illustrations are fabricated sample data and labeled as such. Existing external policy/fees links are real.

Decision: pending user review. Do not promote this throwaway code directly to production. Apply the selected structure using existing app components, established routes, tested onboarding behavior, verified claims, and real product evidence; then remove the prototype.

See `docs/qa/landing-page-ux-audit-2026-09-05.md` for findings and validation limits.
