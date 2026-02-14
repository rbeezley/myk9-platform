import { Button } from '@/components/ui/button';
import {
  BarChart3,
  Cpu,
  Wifi,
} from 'lucide-react';
import type { PerformanceData } from './types';
import { getRumService } from '@/services/performance/RealUserMonitoring';
import { getBudgetService } from '@/services/performance/PerformanceBudgets';

interface DiagnosticsTabProps {
  performanceData: PerformanceData | null;
}

export function DiagnosticsTab({ performanceData }: DiagnosticsTabProps) {
  const rumService = getRumService();
  const budgetService = getBudgetService();

  return (
    <div className="space-y-4">
      {/* System Information Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80
                       border border-border rounded-2xl shadow-sm backdrop-blur-xl
                       transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent
                           opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative p-6">
            <div className="flex items-center gap-3 mb-6 group-hover:text-primary transition-colors duration-300">
              <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl
                               shadow-sm group-hover:shadow-xl group-hover:scale-110
                               transition-all duration-300">
                <Cpu className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">System Information</h3>
            </div>

            {performanceData?.session && (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Device Type:</span>
                  <span className="font-medium">{performanceData.session.device.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Browser:</span>
                  <span className="font-medium">
                    {performanceData.session.device.browser} {performanceData.session.device.version}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">OS:</span>
                  <span className="font-medium">{performanceData.session.device.os}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Screen:</span>
                  <span className="font-medium">{performanceData.session.device.screenResolution}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pixel Ratio:</span>
                  <span className="font-medium">{performanceData.session.device.pixelRatio}x</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80
                       border border-border rounded-2xl shadow-sm backdrop-blur-xl
                       transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent
                           opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative p-6">
            <div className="flex items-center gap-3 mb-6 group-hover:text-primary transition-colors duration-300">
              <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl
                               shadow-sm group-hover:shadow-xl group-hover:scale-110
                               transition-all duration-300">
                <Wifi className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Connection Info</h3>
            </div>

            {performanceData?.session?.connection && (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Effective Type:</span>
                  <span className="font-medium">{performanceData.session.connection.effectiveType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Downlink:</span>
                  <span className="font-medium">{performanceData.session.connection.downlink} Mbps</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">RTT:</span>
                  <span className="font-medium">{performanceData.session.connection.rtt}ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data Saver:</span>
                  <span className="font-medium">{performanceData.session.connection.saveData ? 'On' : 'Off'}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Export Performance Data */}
      <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80
                     border border-border rounded-2xl shadow-sm backdrop-blur-xl
                     transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent
                         opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="relative p-6">
          <div className="flex items-center gap-3 mb-6 group-hover:text-primary transition-colors duration-300">
            <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl
                             shadow-sm group-hover:shadow-xl group-hover:scale-110
                             transition-all duration-300">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <h3 className="text-xl font-semibold">Export Performance Data</h3>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Export detailed performance data for analysis and debugging.
            </p>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40
                           hover:-translate-y-0.5 transition-all duration-300 shadow-sm"
                onClick={() => {
                  const data = rumService.exportSessionData();
                  const blob = new Blob([data], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `performance-data-${Date.now()}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Export Session Data
              </Button>
              <Button
                variant="outline"
                className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40
                           hover:-translate-y-0.5 transition-all duration-300 shadow-sm"
                onClick={() => {
                  const report = budgetService.generateReport('runtime');
                  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `budget-report-${Date.now()}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Export Budget Report
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
