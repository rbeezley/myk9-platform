import { Link } from 'react-router-dom';

// INTENT: the owner's own words (2026-11-23); only the two em dashes became a comma and a colon
// (em-dash ratchet). Public, so the footer link works for a visitor who has not signed up.
export function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-12 sm:px-6 lg:px-8">
        <div>
          <Link
            to="/"
            className="text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            &larr; Back to myK9Show
          </Link>
        </div>

        <header className="space-y-3">
          <h1 className="text-3xl font-semibold">About myK9Show</h1>
          <p className="text-lg text-muted-foreground">
            Weekend trials should be about the dogs, the handlers, and the community, not wrestling
            with spreadsheets, clipboards, and last-minute ringside chaos.
          </p>
        </header>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Our mission</h2>
          <p className="text-muted-foreground">
            myK9Show was built by dog sport enthusiasts who know what it feels like to be on every
            side of the ring: entering as an exhibitor, officiating as a judge, and keeping the
            gears turning as a trial secretary. Our mission is simple: give clubs and organizers
            modern, reliable tools that take the friction out of entries, run orders, and scoring,
            so everyone can spend less time managing paperwork and more time enjoying the sport.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">RyKris LLC</h2>
          <p className="text-muted-foreground">
            myK9Show is crafted by RyKris LLC, an independent software studio named after our
            founder&rsquo;s two kids, Ryan and Kristin. Putting family in the company name is our
            way of keeping our standards personal: we build software with care, stand behind our
            work, and treat every club and exhibitor we support like a neighbor at the next crate
            setup.
          </p>
        </section>

        <footer className="border-t pt-6 text-sm text-muted-foreground">
          Questions or want to bring your club aboard? Email{' '}
          <a href="mailto:hello@myk9show.com" className="underline underline-offset-2">
            hello@myk9show.com
          </a>
          .
        </footer>
      </div>
    </div>
  );
}

export default AboutPage;
