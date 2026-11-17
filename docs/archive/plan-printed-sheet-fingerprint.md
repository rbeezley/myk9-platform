# Print fingerprints hash what the sheet prints

> **Status:** Complete

Linear: MYK9-2103 (parent MYK9-1924). MYK9-2116 (#4058) already hashes the judge and the
scoresheet-only hides. This plan finishes the job: the check-in sheet and scoresheet
fingerprints become exactly the printed text, so the class card's "Changed since printing" is
true when the paper in the box is wrong, and only then.

## What is wrong today

- **Not hashed, but printed:**
  - call name, breed and handler (both sheets);
  - registration number (scoresheet);
  - suffixed armbands: "12A" hashes as `null`;
  - the check-in time limit, area 2 and 3 limits, distraction count, class number, ring label
    and registry title;
  - the "Judge unassigned" wording.
- **Hashed, but never printed:** `dogId`, `checkInStatus`, `entryStatus` and the raw
  `run_order`. Checking a dog in at the gate marks the printed check-in sheet "changed".
- **Entries the sheets leave out:** withdrawn, pulled and held entries are still hashed.
- **Two sources:** the class card builds its rows from `SecretaryEntry`, which has no
  registrations and a different armband and dog fallback, while Reports builds the PDF from
  another reader.

## Rule (from MYK9-2116)

No "not loaded yet" gates. A briefly wrong "changed" that corrects itself is acceptable. A
permanent false "changed" is not, so every path hashes the same printed form from the same
reader, offline included.

## Design

**One shared, Deno-safe function** (`_shared/paperwork/printedSheet.ts`) builds the check-in
and scoresheet descriptor from the renderer's own input (`EmergencyPacketClass[]` and
`PacketReportEntry[]`):

- **Per entry**, as printed:
  - check-in: armband label, call name, breed, handler and order position;
  - scoresheet: armband label, call name, breed, handler, registration number and sequence.
- **Per class:** one `printedClassHeader` that the renderer also uses for its own header, so
  the two cannot drift.
- **Which entries:** only the ones the renderer receives. A withdrawn or pulled dog drops out,
  which reads as changed.
- Results and label descriptors are untouched.

**Every app path uses one reader.** The class card and Results tab stop using `SecretaryEntry`
for these two sheets. They read through the same replica reader and registration join that
Reports uses (`usePrintedSheetEntries`), and the trial's registry picks the registration
number.

**Nothing changes on the server.** No migration, no replication-schema change, no RLS change.

## Phases (one PR each)

1. **PR A, plumbing, no hash change.**
   - Split `buildEmergencyPacketData` into `buildPacketClasses` and `buildPacketEntries`.
   - Extract the registration join from `hydrateEntryRegistrations`.
   - Add `usePrintedSheetEntries(showId)` with Reports' invalidation, plus a registrations
     subscription.
   - Pass trials with `registryId` into `useShowClassPaperwork`.
   - Parity tests: the card and Reports produce equal packet input.
2. **PR B, the swap.**
   - Add `printedSheet.ts` and `printedClassHeader`, with the renderer using the latter.
   - Rewire `buildReportPaperworkDescriptor` and `buildClassPaperworkMap`.
   - Re-record the pinned values.
   - Every earlier check-in and scoresheet print reads "changed" once, which is accepted
     before launch.

## Testing

- **Per-fact sensitivity:** each printed field moves the sheet that prints it. Unprinted fields
  (dog id, check-in status, fees) move nothing. Withdraw, pull and hold remove a subject.
- **Iff test against the renderer:** a jsPDF text spy shows the printed text changed if and
  only if the fingerprint changed. An exhaustive field map stops a new printed field from going
  unhashed.
- **Parity:** the Reports reader, the card hook, the print and packet-record path, and the
  shared function on direct input all give equal fingerprints. Fixtures cover suffixed, null
  and 0 armbands, a blank handler, a dog missing from the replica, UKC and AKC registries, a
  missing registration, and numerics stored as strings.
- **No permanent mismatch:** record a print, then read it back on each path while settling the
  late inputs (judges, handler people, registrations), online and offline. It must read
  "current" once they settle.
- After deploy, in a browser: print a class, change a dog's call name and see "Changed since
  printing", then check a dog in and see the sheet stay current.
