# Sport & Registry Rulebooks — source reference library

> **Status:** Reference

Authoritative **source** rulebooks for the sanctioning bodies and sports myK9Show
supports (or plans to). This is the primary text; the app's `RegistrySport` config
(`apps/myk9show/src/features/registries/*.ts`) is a lossy *distillation* of it. When you
need to know what a rule actually says — not just what we encoded — read the file here.

## Storing a rulebook is not a commitment to build the sport

A rulebook in this folder is a **reference archive**, nothing more. Adding
`fastcat-*.pdf` here does not mean FastCAT is on the roadmap or that any code should be
written for it. The point is the opposite: capture the exact edition we might one day
design against, cheaply, so that when a sport *does* get scheduled the source is already
in hand and version-stamped. Keep two things mentally separate:

- **Archiving a rulebook** (docs-only, do it freely as editions arrive).
- **Building a sport-family shape** (real feature work — gated on scent-work being proven
  in production, per [`docs/plan-registry-write-path.md`](../plan-registry-write-path.md)
  and the [`add-sport-registry`](../../.claude/skills/add-sport-registry/SKILL.md) skill).

## What's here

### Rulebooks

| Registry | Sport | Source file | Distilled into | Edition / provenance |
| --- | --- | --- | --- | --- |
| AKC (American Kennel Club) | Scent Work | [`akc-scent-work-regulations.txt`](akc-scent-work-regulations.txt) | `features/registries/akc.ts` | "Regulations for AKC Scent Work". No edition date is stamped in the file — **verify against the current PDF at akc.org before relying on it for a rules change.** |
| UKC (United Kennel Club) | Nose Work | [`ukc-nose-work-rules.txt`](ukc-nose-work-rules.txt) | `features/registries/ukc.ts` | Per the config header: 2020 rulebook + 2021 trial manual + Official UKC Performance Entry Form. |
| ASCA (Australian Shepherd Club of America) | Scent Detection | [`asca-scent-detection-rules.txt`](asca-scent-detection-rules.txt) | `features/registries/asca.ts` | June 2026 ASCA Scent Detection Program Rules + ASCA Scent Detection Entry Form. |

### Official forms

| Registry | Sport | Location |
| --- | --- | --- |
| ASCA | Scent Detection | [`asca-scent-detection-forms/`](asca-scent-detection-forms/) — entry, sanction, trial report, scoresheet, roster, receipts, post-evaluation, match forms (PDF) |

## Adding a rulebook for a new sport or registry

1. Drop the source file in this folder using the naming scheme
   `<registry>-<sport>-<doctype>.<ext>` (e.g. `akc-fast-cat-regulations.pdf`,
   `akc-obedience-regulations.pdf`). Lowercase, kebab-case, no spaces.
2. Add a row to the appropriate table above. Record the **edition/effective date** if the
   document stamps one; if it doesn't, say so and link the official source to re-verify —
   don't guess a date.
3. Leave `Distilled into` blank until (and unless) a `RegistrySport`-equivalent config is
   actually built for it. A blank there is the honest signal that the source is archived
   but not yet consumed by code.
4. This is docs-only — but because these are `.txt`/`.pdf` (not `.md`), reorganizing or
   adding them goes through a normal PR, not the docs-direct-to-`main` path.

## Related

- Registry config layer: `apps/myk9show/src/features/registries/`
- Multi-registry scoping decisions:
  [`docs/design_handoff_heritage/Multi-Registry Scoping.md`](../design_handoff_heritage/Multi-Registry%20Scoping.md)
- Skill for building the next sport/registry:
  [`add-sport-registry`](../../.claude/skills/add-sport-registry/SKILL.md)
