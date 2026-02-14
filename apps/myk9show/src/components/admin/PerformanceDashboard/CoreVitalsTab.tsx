
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  TrendingDown,
  BarChart3,
  Eye,
} from 'lucide-react';
import type { PerformanceData } from './types';
import { getStatusColor, getCoreWebVitalsCards } from './performanceUtils';

interface CoreVitalsTabProps {
  performanceData: PerformanceData | null;
}

export function CoreVitalsTab({ performanceData }: CoreVitalsTabProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {getCoreWebVitalsCards(performanceData).map((vital) => (
          <div key={vital.name} className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80
                                         border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl
                                         transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent
                             opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl
                                 shadow-sm group-hover:shadow-xl group-hover:scale-110
                                 transition-all duration-300">
                  <vital.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-base font-semibold group-hover:text-primary transition-colors duration-300">{vital.name}</h3>
              </div>

              <div className="text-center">
                <p className="text-4xl font-bold mb-2 group-hover:text-primary transition-colors duration-300">{vital.value}</p>
                <p className="text-muted-foreground">{vital.unit}</p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Performance</span>
                  <Badge className={getStatusColor(vital.status)}>
                    {vital.status === 'good' ? 'Good' :
                     vital.status === 'needs-improvement' ? 'Needs Improvement' : 'Poor'}
                  </Badge>
                </div>

                <Progress
                  value={vital.status === 'good' ? 80 : vital.status === 'needs-improvement' ? 50 : 20}
                  className="h-2"
                />
              </div>

              <div className="text-xs text-muted-foreground">
                {vital.name === 'Largest Contentful Paint' && 'Time for largest element to render'}
                {vital.name === 'First Contentful Paint' && 'Time for first content to appear'}
                {vital.name === 'Cumulative Layout Shift' && 'Visual stability metric'}
                {vital.name === 'First Input Delay' && 'Time from first user input to response'}
                {vital.name === 'Time to First Byte' && 'Time for server to respond'}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80
                     border border-border rounded-2xl shadow-sm backdrop-blur-xl
                     transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent
                         opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="relative p-6">
          <h3 className="text-xl font-semibold mb-6 group-hover:text-primary transition-colors duration-300">Performance Trends</h3>

          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl
                               shadow-sm group-hover:shadow-xl group-hover:scale-110
                               transition-all duration-300">
                <BarChart3 className="h-4 w-4 text-primary" />
              </div>
              <p className="text-sm">
                Performance trends show improvements after recent optimizations.
                LCP improved by 58% and Total Blocking Time reduced to 0ms.
              </p>
            </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-green-600" />
                Improvements
              </h4>
              <div className="text-sm space-y-1 text-muted-foreground">
                <p>• Load time reduced from 5.3s to 2.2s</p>
                <p>• Long tasks eliminated completely</p>
                <p>• Memory usage optimized by 70%</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <Eye className="h-4 w-4 text-blue-600" />
                Monitoring
              </h4>
              <div className="text-sm space-y-1 text-muted-foreground">
                <p>• Real-time performance tracking</p>
                <p>• Budget violation alerts</p>
                <p>• User experience metrics</p>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
