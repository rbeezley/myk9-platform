import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const dogShowImageWebP = '/logo.webp';
const dogShowImagePNG = '/logo.png';

export default function Hero() {
  return (
    <section className="pt-24 pb-20 md:pt-32 md:pb-28 bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row items-center gap-8">
          {/* Logo - left side */}
          <div className="lg:w-1/2 flex justify-center items-center">
            <div className="h-[350px] flex items-center justify-center">
              <div className="transform transition-all duration-500 hover:scale-105">
                <picture>
                  <source srcSet={dogShowImageWebP} type="image/webp" />
                  <img
                    src={dogShowImagePNG}
                    alt="myK9Show logo"
                    className="w-auto h-auto max-h-full max-w-[300px] object-contain"
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                    width="300"
                    height="300"
                  />
                </picture>
              </div>
            </div>
          </div>

          {/* Hero content - right side */}
          <div className="lg:w-1/2 text-center lg:text-left">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-foreground leading-tight font-display">
              Dog shows shouldn't be paperwork.
            </h1>
            <p className="mt-6 text-xl text-muted-foreground max-w-2xl mx-auto lg:mx-0">
              Enter shows, track your dogs' careers, and manage events — so you can focus on what
              matters.
            </p>

            {/* CTA Button */}
            <div className="mt-8 flex justify-center lg:justify-start">
              <Button asChild size="lg" className="rounded-full">
                <Link to="/shows">Find a Show</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
