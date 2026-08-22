# Emergency packet renderer

The model builder and PDF renderer for the emergency trial packet (MYK9-198), shared by two runtimes.

| Caller | Entry point |
| --- | --- |
| Browser | `apps/myk9show/src/features/emergency-trial-packet/renderPacketPdf.ts` |
| Edge function | `supabase/functions/generate-trial-packet/index.ts` |

## Constraints these files must keep

They are imported by Deno, so they carry **no `@/` aliases, no app imports, and no runtime dependency on jspdf**. `buildEmergencyTrialPacketPdf` takes the jsPDF constructor as an argument because the two runtimes disagree about the export: the browser has a default and a named export, `npm:jspdf` only works through the **named** one. The PDF surface is declared structurally (`PacketPdfDocument`) rather than imported from `jspdf`, because `deno check` rejects a type-only import of a package that is not a declared dependency — and `deno run` does not type check, so that failure is invisible until CI or a deploy.

`formatPacketSeconds` is a local mirror of the `@myk9/core` helper for the same reason; `emergencyTrialPacket.test.ts` pins the two together.

## Tests

The suite stays in the app, where it already runs: `apps/myk9show/src/features/emergency-trial-packet/*.test.ts`.
