import React from 'react';
import { Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface TitleProgressTeaserProps {
  dogName: string;
}

const TitleProgressTeaser: React.FC<TitleProgressTeaserProps> = ({ dogName }) => (
  <Card className="border-warning/30 bg-gradient-to-br from-orange-50/60 to-card dark:from-orange-950/20">
    <CardContent className="pt-4 pb-4 px-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-orange-500" />
        <span className="text-xs font-semibold uppercase tracking-wide text-warning ">
          Premium feature
        </span>
      </div>
      <p className="text-sm font-semibold text-foreground mb-1">
        Track {dogName}&apos;s title progress
      </p>
      <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
        See how close they are to their next title — Q&nbsp;by&nbsp;Q, updated automatically after
        each show.
      </p>
      <Button size="sm" className="w-full gap-1.5">
        <Sparkles className="h-3.5 w-3.5" />
        Upgrade to unlock
      </Button>
    </CardContent>
  </Card>
);

export default TitleProgressTeaser;
