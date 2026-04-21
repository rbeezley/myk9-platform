import { Button } from '@/components/ui/button';

export default function MyK9QCallout() {
  return (
    <section className="py-16 bg-muted/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl p-8 md:p-12 shadow-sm flex flex-col md:flex-row items-center gap-8">
          {/* Logo */}
          <div className="shrink-0">
            <img
              src="https://myk9q.com/myK9Q-teal-192.png"
              alt="myK9Q"
              className="w-24 h-24 rounded-2xl"
              width={96}
              height={96}
            />
          </div>

          {/* Text */}
          <div className="flex-1 text-center md:text-left">
            <p className="text-sm font-semibold text-primary mb-1">The ringside companion</p>
            <h2 className="text-2xl md:text-3xl font-bold text-card-foreground mb-3">
              myK9Q — Queue &amp; Qualify
            </h2>
            <p className="text-muted-foreground max-w-xl">
              Use myK9Show to find shows, enter, and track your dogs' careers. On show day, switch
              to myK9Q for real-time run order, check-in, and results — right from the ringside.
            </p>
          </div>

          {/* CTA */}
          <div className="shrink-0">
            <Button asChild size="lg" className="rounded-full">
              <a href="https://myk9q.com" target="_blank" rel="noopener noreferrer">
                Get myK9Q
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
