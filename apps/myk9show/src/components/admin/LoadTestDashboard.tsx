/**
 * Load Test Dashboard
 *
 * Interface for running performance load tests and managing memory optimization.
 * Critical Phase 4 functionality for production readiness validation.
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { logger } from '@/services/LoggingService';
import {
  Activity,
  Play,
  Square,
  Trash2,
  BarChart3,
  Timer,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

import {
  getLoadTestService,
  type LoadTestConfig,
  type LoadTestResults,
} from '@/services/testing/LoadTestService';
import { getRumService } from '@/services/performance/RealUserMonitoring';

export function LoadTestDashboard() {
  const [isRunning, setIsRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState<string | null>(null);
  const [results, setResults] = useState<(LoadTestResults & { scenario: string })[]>([]);
  const [keepTestData, setKeepTestData] = useState(false);
  const [memoryStats, setMemoryStats] = useState<{
    session?: {
      totalTime: number;
    };
  } | null>(null);

  const loadTestService = getLoadTestService();
  const rumService = getRumService();

  const updateMemoryStats = useCallback(() => {
    const session = rumService.getSessionData();
    setMemoryStats({ session });
  }, [rumService]);

  useEffect(() => {
    updateMemoryStats();
    const interval = setInterval(updateMemoryStats, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, [updateMemoryStats]);

  const runSingleTest = async (config: LoadTestConfig & { name: string }) => {
    setIsRunning(true);
    setCurrentTest(config.name);

    try {
      const testConfig = { ...config, cleanupAfter: !keepTestData };
      const result = await loadTestService.runLoadTest(testConfig);
      setResults(prev => [...prev, { scenario: config.name, ...result }]);
    } catch (error) {
      logger.error('Test failed:', 'admin', {}, error as Error);
    } finally {
      setIsRunning(false);
      setCurrentTest(null);
      updateMemoryStats();
    }
  };

  const runAllTests = async () => {
    setIsRunning(true);
    setResults([]);

    try {
      // Override cleanup behavior for all tests
      const testScenarios = [
        { name: 'Small Scale', dogs: 100, people: 50, shows: 5, entries: 200 },
        { name: 'Medium Scale', dogs: 1000, people: 500, shows: 20, entries: 2000 },
        { name: 'Large Scale', dogs: 5000, people: 2000, shows: 50, entries: 10000 },
        { name: 'Stress Test', dogs: 10000, people: 5000, shows: 100, entries: 20000 },
      ];

      const allResults: (LoadTestResults & { scenario: string })[] = [];

      for (const scenario of testScenarios) {
        logger.debug(`\n🚀 Running ${scenario.name} test...`, 'admin', {});

        const config: LoadTestConfig = {
          ...scenario,
          measurePerformance: true,
          cleanupAfter: !keepTestData, // Use the keepTestData flag
        };

        const result = await loadTestService.runLoadTest(config);
        allResults.push({ scenario: scenario.name, ...result });

        // Brief pause between tests only if keeping data
        if (keepTestData) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      setResults(allResults);
    } catch (error) {
      logger.error('Tests failed:', 'admin', {}, error as Error);
    } finally {
      setIsRunning(false);
      setCurrentTest(null);
      updateMemoryStats();
    }
  };

  const clearResults = () => {
    setResults([]);
  };

  const manualCleanup = async () => {
    try {
      await loadTestService.manualCleanup();
      updateMemoryStats();
      logger.debug('✅ Manual cleanup completed', 'admin', {});
    } catch (error) {
      logger.error('❌ Manual cleanup failed:', 'admin', {}, error as Error);
    }
  };

  const testScenarios = [
    {
      name: 'Quick Test',
      dogs: 100,
      people: 50,
      shows: 5,
      entries: 200,
      measurePerformance: true,
      cleanupAfter: true,
    },
    {
      name: 'Medium Scale',
      dogs: 1000,
      people: 500,
      shows: 20,
      entries: 2000,
      measurePerformance: true,
      cleanupAfter: true,
    },
    {
      name: 'Large Scale',
      dogs: 5000,
      people: 2000,
      shows: 50,
      entries: 10000,
      measurePerformance: true,
      cleanupAfter: true,
    },
    {
      name: 'Stress Test',
      dogs: 10000,
      people: 5000,
      shows: 100,
      entries: 20000,
      measurePerformance: true,
      cleanupAfter: true,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 pt-8 pb-8 max-w-7xl">
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Load Testing & Memory Management
              </h1>
              <p className="text-muted-foreground">
                Phase 4 critical features: Performance validation and memory optimization
              </p>
            </div>
            <Button onClick={updateMemoryStats} disabled={isRunning}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRunning ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Session Overview */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardContent className="flex items-center p-6">
                <Timer className="h-8 w-8 text-purple-600 mr-3" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Session Time</p>
                  <p className="text-2xl font-bold">
                    {memoryStats?.session
                      ? Math.round(memoryStats.session.totalTime / 1000 / 60)
                      : 0}
                    min
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="load-tests" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1">
              <TabsTrigger
                value="load-tests"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
              >
                Load Testing
              </TabsTrigger>
              <TabsTrigger
                value="results"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
              >
                Results Analysis
              </TabsTrigger>
            </TabsList>

            <TabsContent value="load-tests" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Play className="h-5 w-5" />
                    Performance Load Tests
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4 mb-4">
                    <div className="flex gap-2">
                      <Button onClick={runAllTests} disabled={isRunning} className="flex-1">
                        {isRunning ? (
                          <>
                            <Square className="h-4 w-4 mr-2 animate-pulse" />
                            Running Tests...
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4 mr-2" />
                            Run All Tests
                          </>
                        )}
                      </Button>
                      <Button onClick={clearResults} variant="outline">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Clear Results
                      </Button>
                      {keepTestData && (
                        <Button onClick={manualCleanup} variant="outline">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Cleanup Test Data
                        </Button>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 p-3 bg-muted/30 rounded-lg">
                      <Checkbox
                        id="keep-test-data"
                        checked={keepTestData}
                        onCheckedChange={checked => setKeepTestData(checked === true)}
                      />
                      <label htmlFor="keep-test-data" className="text-sm font-medium">
                        Keep test data after completion (allows exploration)
                      </label>
                    </div>

                    {keepTestData && (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          Test data will remain in your stores until manually cleaned up. Navigate
                          to /dogs, /people, or /shows to explore the generated data.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>

                  {currentTest && (
                    <Alert>
                      <Activity className="h-4 w-4 animate-spin" />
                      <AlertDescription>
                        Currently running: <strong>{currentTest}</strong>
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="grid gap-3 md:grid-cols-2">
                    {testScenarios.map(scenario => (
                      <Card
                        key={scenario.name}
                        className="group relative overflow-hidden p-4 bg-gradient-to-br from-card to-card/80 
                               border border-border rounded-2xl shadow-sm backdrop-blur-xl 
                               transition-all duration-500 hover:shadow-xl hover:-translate-y-2"
                      >
                        <div
                          className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                                     opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                        />
                        <div className="relative">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium group-hover:text-primary transition-colors duration-300">
                              {scenario.name}
                            </h4>
                            <Button
                              size="sm"
                              onClick={() => runSingleTest(scenario)}
                              disabled={isRunning}
                              className="bg-gradient-to-r from-primary to-secondary text-primary-foreground 
                                     hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02] 
                                     transition-all duration-300 shadow-sm"
                            >
                              <Play className="h-3 w-3 mr-1" />
                              Run
                            </Button>
                          </div>
                          <div className="text-xs text-muted-foreground space-y-1">
                            <p>Dogs: {scenario.dogs.toLocaleString()}</p>
                            <p>Users: {scenario.people.toLocaleString()}</p>
                            <p>Shows: {scenario.shows.toLocaleString()}</p>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="results" className="space-y-4">
              {results.length === 0 ? (
                <Card>
                  <CardContent className="flex items-center justify-center h-32">
                    <div className="text-center">
                      <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-muted-foreground">
                        No test results yet. Run a load test to see results.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {results.map((result, index) => (
                    <Card key={index}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="flex items-center gap-2">
                            <TrendingUp className="h-5 w-5" />
                            {result.scenario}
                          </CardTitle>
                          <Badge variant={result.success ? 'secondary' : 'destructive'}>
                            {result.success ? 'Success' : 'Failed'}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid gap-4 md:grid-cols-4">
                          <div>
                            <p className="text-sm text-muted-foreground">Data Generation</p>
                            <p className="text-lg font-bold">
                              {result.timing.dataGeneration.toFixed(0)}ms
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Store Population</p>
                            <p className="text-lg font-bold">
                              {result.timing.storePopulation.toFixed(0)}ms
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Memory Delta</p>
                            <p className="text-lg font-bold">
                              {result.timing.memoryDelta.toFixed(1)} MB
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Total Time</p>
                            <p className="text-lg font-bold">
                              {result.timing.totalTime.toFixed(0)}ms
                            </p>
                          </div>
                        </div>

                        {result.config && (
                          <div className="mt-4 pt-4 border-t">
                            <p className="text-sm text-muted-foreground mb-2">
                              Test Configuration:
                            </p>
                            <div className="grid gap-2 md:grid-cols-4 text-sm">
                              <span>Dogs: {result.config.dogs.toLocaleString()}</span>
                              <span>Users: {result.config.people.toLocaleString()}</span>
                              <span>Shows: {result.config.shows.toLocaleString()}</span>
                              <span>
                                Store Size: {(result.performance.storeSize / 1024).toFixed(0)} KB
                              </span>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
