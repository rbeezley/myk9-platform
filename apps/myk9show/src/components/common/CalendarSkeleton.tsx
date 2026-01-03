import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function CalendarSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 bg-muted rounded animate-pulse" />
          <div className="h-6 w-32 bg-muted rounded animate-pulse" />
        </div>
      </CardHeader>
      <CardContent>
        {/* Calendar toolbar skeleton */}
        <div className="flex flex-col sm:flex-row items-center justify-between mb-4 gap-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-20 bg-muted rounded animate-pulse" />
            <div className="h-6 w-24 bg-muted rounded animate-pulse" />
            <div className="h-8 w-20 bg-muted rounded animate-pulse" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-16 bg-muted rounded animate-pulse" />
            <div className="h-8 w-16 bg-muted rounded animate-pulse" />
            <div className="h-8 w-16 bg-muted rounded animate-pulse" />
          </div>
        </div>
        
        {/* Calendar grid skeleton */}
        <div className="border rounded-lg overflow-hidden">
          {/* Days of week header */}
          <div className="grid grid-cols-7 border-b">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="p-2 text-center border-r last:border-r-0">
                <div className="h-4 w-8 bg-muted rounded animate-pulse mx-auto" />
              </div>
            ))}
          </div>
          
          {/* Calendar dates */}
          {Array.from({ length: 6 }).map((_, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-7 border-b last:border-b-0">
              {Array.from({ length: 7 }).map((_, dayIndex) => (
                <div key={dayIndex} className="h-24 p-2 border-r last:border-r-0 bg-background">
                  <div className="h-4 w-6 bg-muted rounded animate-pulse mb-2" />
                  {/* Random event skeletons */}
                  {Math.random() > 0.7 && (
                    <div className="h-5 w-full bg-blue-200 rounded animate-pulse mb-1" />
                  )}
                  {Math.random() > 0.8 && (
                    <div className="h-5 w-3/4 bg-green-200 rounded animate-pulse" />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}