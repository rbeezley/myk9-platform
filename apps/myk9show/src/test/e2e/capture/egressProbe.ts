/**
 * Landing capture (MYK9-2181): proves whether this process can open an outbound connection.
 *
 *   pnpm exec tsx src/test/e2e/capture/egressProbe.ts open     # the control, before the firewall rule
 *   pnpm exec tsx src/test/e2e/capture/egressProbe.ts closed   # under the rule, before the capture
 *
 * Exits 1 when the answer is not the one named. Sends nothing: it opens one TCP connection
 * to a host the runner already talks to and closes it.
 */
import { OUTBOUND_PROBE, outboundProblem, probeOutbound } from '../helpers/landingCapture';

const expected = process.argv[2] === 'open' ? 'connected' : 'refused';
if (!['open', 'closed'].includes(process.argv[2] ?? '')) {
  console.error('Usage: egressProbe.ts <open|closed>');
  process.exit(2);
}

const result = await probeOutbound(OUTBOUND_PROBE.host, OUTBOUND_PROBE.port);
const problem = outboundProblem(expected, result);
console.log(`outbound ${OUTBOUND_PROBE.host}:${OUTBOUND_PROBE.port} :: ${result}`);
if (problem) {
  console.error(problem);
  process.exit(1);
}
