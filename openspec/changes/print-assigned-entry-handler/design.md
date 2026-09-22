## Context

Entry rows carry assigned handler text and identity separately from dog ownership. This change covers printed check-in sheets, run orders, AKC forms, gazettes, and the scheduled emergency packet. Interactive Secretary Run Sheet behavior and the Show Desk people roster are separate live surfaces and are explicitly deferred; they are not part of this print-path correction.

## Decisions

1. Keep the canonical projection at the entry read boundary. Assigned text/person takes precedence; owner is used only when both are absent. An assigned but unresolved person remains unknown.
2. Leave interactive at-show surfaces unchanged. No local read migration or people-roster work is required to correct the printed artifacts in this issue.
3. The existing hydrator refreshes people with generation guards. Reports must observe completion, including during its first query, and update the printable data.
4. Route the existing Reports check-in/run-order mapper, AKC entry form, and gazette handler section through the assigned handler rule; do not add another report route.
5. Update the scheduled packet's service-role-only SQL function at its current definition, preserving authorization and filters.

## Risks and verification

Offline cache incompleteness and refresh races can display stale names; test initial and deferred hydration through the real Reports query. Verify each in-scope printed artifact and scheduled packet output. A new SQL function definition needs migration guard and review before database deployment. Do not infer that interactive Secretary Run Sheet or Show Desk roster identity is fixed by these print-path changes.
