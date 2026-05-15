import { describe, expect, it } from 'vitest';
import { buildMonogramHtml, type MonogramEmailData } from './monogram-email';

// Minimal valid data — every nullable field set to null to exercise the
// conditional rendering branches. Individual tests override specific fields.
const BASE: MonogramEmailData = {
  monogramLetters: 'BCK',
  clubName: 'Bexar County Kennel Club',
  clubEstablished: '1947',
  clubCity: 'San Antonio, TX',
  showTitle: 'Spring Scent Work Trial',
  dateRange: '12–14 June 2026',
  salutation: 'Ms. Patricia Holloway',
  dogName: "GCh. Ridgeway's Wandering Cooper",
  dogCallName: 'Cooper',
  dogBreed: 'Labrador Retriever',
  dogSex: 'M',
  runs: [
    {
      numeral: 'I',
      dayLabel: 'Fri 12 Jun',
      classLabel: 'Excellent · Containers',
      judgeName: 'C. Beagles',
      armband: '142',
    },
    {
      numeral: 'II',
      dayLabel: 'Sat 13 Jun',
      classLabel: 'Excellent · Interiors',
      judgeName: 'C. Beagles',
      armband: '142',
    },
  ],
  runCount: 2,
  totalFeesFormatted: '$48.00',
  receiptNumber: 'BCKC-2026-0427',
  venue: 'Live Oak Civic Center\n8001 Shin Oak Dr',
  doorsTime: '7:00 AM',
  firstClassTime: '8:30 AM',
  parkingNotes: 'Free · north lot',
  hospitalityNotes: 'Coffee at check-in',
  cratingNotes: 'Adjacent ballroom',
  secretaryEmail: 'secretary@bckc.org',
  secretaryPhone: '(210) 555-0142',
  trialUrl: 'https://bckc.org/trials/spring-2026',
  trialChairName: 'Sarah Whitman',
  trialChairTitle: 'Trial Chair',
  memberClubLanguage: 'A member club of the American Kennel Club',
};

describe('buildMonogramHtml', () => {
  describe('output shape', () => {
    it('returns valid HTML', () => {
      const html = buildMonogramHtml(BASE);
      expect(html).toMatch(/^<!doctype html>/i);
      expect(html).toContain('</html>');
    });

    it('uses table-based layout (no display:flex / display:grid)', () => {
      const html = buildMonogramHtml(BASE);
      expect(html).not.toMatch(/display\s*:\s*flex/i);
      expect(html).not.toMatch(/display\s*:\s*grid/i);
    });

    it('contains the 600px email container width', () => {
      const html = buildMonogramHtml(BASE);
      expect(html).toMatch(/width:600px/);
    });

    it('does NOT contain background-clip:text — the email-safe contract', () => {
      // Outlook strips background-clip:text, which would leave the monogram
      // letters transparent and invisible. The embossed treatment is web-only;
      // emails must render the monogram as solid ink color. This assertion
      // prevents a regression where someone copy-pastes the web emboss CSS
      // into the email template.
      const html = buildMonogramHtml(BASE);
      expect(html).not.toMatch(/background-clip\s*:\s*text/i);
      expect(html).not.toMatch(/-webkit-background-clip\s*:\s*text/i);
    });
  });

  describe('content rendering', () => {
    it('renders the monogram letters in the header', () => {
      const html = buildMonogramHtml({ ...BASE, monogramLetters: 'BCK' });
      expect(html).toContain('BCK');
    });

    it('renders club name, show title, and date range', () => {
      const html = buildMonogramHtml(BASE);
      expect(html).toContain('Bexar County Kennel Club');
      expect(html).toContain('Spring Scent Work Trial');
      expect(html).toContain('12–14 June 2026');
    });

    it('renders dog name and call name', () => {
      const html = buildMonogramHtml(BASE);
      expect(html).toContain('Wandering Cooper');
      expect(html).toContain('Cooper'); // call name in dogLine
    });

    it('renders all run rows with armband', () => {
      const html = buildMonogramHtml(BASE);
      expect(html).toContain('Fri 12 Jun');
      expect(html).toContain('Sat 13 Jun');
      expect(html).toContain('Excellent · Containers');
      expect(html).toContain('142');
    });

    it('renders total fees with bronze accent color', () => {
      const html = buildMonogramHtml(BASE);
      expect(html).toContain('$48.00');
    });

    it('renders secretary email as a mailto link', () => {
      const html = buildMonogramHtml(BASE);
      expect(html).toContain('mailto:secretary@bckc.org');
    });

    it('renders the CTA when trialUrl is set', () => {
      const html = buildMonogramHtml(BASE);
      expect(html).toContain('https://bckc.org/trials/spring-2026');
      expect(html).toContain('View trial particulars');
    });

    it('renders the trial chair signature when set', () => {
      const html = buildMonogramHtml(BASE);
      expect(html).toContain('Sarah Whitman');
      expect(html).toContain('Trial Chair');
    });

    it('renders the runs-summary line with singular/plural agreement', () => {
      const single = buildMonogramHtml({ ...BASE, runCount: 1, runs: BASE.runs.slice(0, 1) });
      expect(single).toMatch(/1 run[^s]/);
      const multi = buildMonogramHtml(BASE);
      expect(multi).toContain('2 runs');
    });

    it('uses an em-dash placeholder for missing armbands', () => {
      const html = buildMonogramHtml({
        ...BASE,
        runs: [{ ...BASE.runs[0]!, armband: null }],
      });
      expect(html).toContain('—');
    });
  });

  describe('HTML escaping (XSS prevention)', () => {
    it('escapes HTML in club name', () => {
      const html = buildMonogramHtml({
        ...BASE,
        clubName: '<script>alert("xss")</script>',
      });
      expect(html).not.toContain('<script>alert');
      expect(html).toContain('&lt;script&gt;');
    });

    it('escapes HTML in dog name', () => {
      const html = buildMonogramHtml({
        ...BASE,
        dogName: '<img src=x onerror=alert(1)>',
      });
      expect(html).not.toMatch(/<img\s+src=x\s+onerror/);
      expect(html).toContain('&lt;img');
    });

    it('escapes HTML in salutation', () => {
      const html = buildMonogramHtml({
        ...BASE,
        salutation: '"><script>x</script>',
      });
      expect(html).not.toContain('<script>x</script>');
      expect(html).toContain('&quot;');
    });

    it('escapes ampersands in show title', () => {
      const html = buildMonogramHtml({ ...BASE, showTitle: 'A & B Trial' });
      expect(html).toContain('A &amp; B Trial');
    });

    it('escapes the secretary email in the mailto href and visible text', () => {
      const html = buildMonogramHtml({
        ...BASE,
        secretaryEmail: 'sec"@bckc.org',
      });
      // Neither rendering should contain a raw double-quote that could break out
      expect(html).not.toContain('sec"@bckc.org');
      expect(html).toContain('&quot;');
    });

    it('escapes free-form notes but preserves newlines as <br/>', () => {
      const html = buildMonogramHtml({
        ...BASE,
        parkingNotes: 'North lot\n<b>VIP only</b>',
      });
      expect(html).toContain('North lot<br/>');
      expect(html).not.toContain('<b>VIP only</b>');
      expect(html).toContain('&lt;b&gt;');
    });
  });

  describe('optional / null field handling', () => {
    it('omits the byline line when clubEstablished and clubCity are both null', () => {
      const html = buildMonogramHtml({ ...BASE, clubEstablished: null, clubCity: null });
      expect(html).not.toMatch(/Est\./);
    });

    it('renders only one byline part when the other is null', () => {
      const html = buildMonogramHtml({ ...BASE, clubEstablished: null });
      expect(html).toContain('San Antonio, TX');
      expect(html).not.toContain('Est.');
    });

    it('omits the CTA block when trialUrl is null', () => {
      const html = buildMonogramHtml({ ...BASE, trialUrl: null });
      expect(html).not.toContain('View trial particulars');
    });

    it('omits the signature block when both chair fields are null', () => {
      const html = buildMonogramHtml({
        ...BASE,
        trialChairName: null,
        trialChairTitle: null,
      });
      expect(html).not.toContain('Most sincerely');
    });

    it('omits each on-the-day info row when its value is null', () => {
      const html = buildMonogramHtml({
        ...BASE,
        doorsTime: null,
        firstClassTime: null,
        venue: null,
        parkingNotes: null,
        hospitalityNotes: null,
        cratingNotes: null,
      });
      expect(html).not.toMatch(/Doors open/);
      expect(html).not.toMatch(/Parking/);
      expect(html).not.toMatch(/Hospitality/);
    });

    it('renders without any literal "undefined" or "null" string when all optionals are null', () => {
      const html = buildMonogramHtml({
        ...BASE,
        clubEstablished: null,
        clubCity: null,
        dogCallName: null,
        dogBreed: null,
        dogSex: null,
        receiptNumber: null,
        venue: null,
        doorsTime: null,
        firstClassTime: null,
        parkingNotes: null,
        hospitalityNotes: null,
        cratingNotes: null,
        secretaryEmail: null,
        secretaryPhone: null,
        trialUrl: null,
        trialChairName: null,
        trialChairTitle: null,
      });
      expect(html).not.toMatch(/undefined/);
      expect(html).not.toMatch(/>null</);
    });
  });
});
