/**
 * Load Test Runner for myK9Show Application
 * 
 * Executes load tests using the React Query infrastructure and Playwright
 * for realistic browser-based testing scenarios.
 */

import { Browser, BrowserContext, Page } from '@playwright/test';
import { 
  LoadTestDataGenerator, 
  PerformanceMonitor, 
  LOAD_TEST_SCENARIOS,
  type LoadTestScenario,
  type WorkflowStep,
  type WorkflowConfig
} from './LoadTestFramework';
import { faker } from '@faker-js/faker';

export class LoadTestRunner {
  private dataGenerator = LoadTestDataGenerator.getInstance();
  private performanceMonitor = new PerformanceMonitor();
  private browser: Browser | null = null;
  private contexts: BrowserContext[] = [];
  private testData: ReturnType<typeof this.dataGenerator.generateBulkData> | null = null;

  constructor(private baseUrl: string = 'http://localhost:5173') {}

  async initialize(browser: Browser): Promise<void> {
    this.browser = browser;
    
    // Generate test data
    console.log('Generating test data...');
    this.testData = this.dataGenerator.generateBulkData({
      users: 1000,
      dogs: 500,
      shows: 200
    });
    
    console.log(`Generated ${this.testData.users.length} users, ${this.testData.dogs.length} dogs, ${this.testData.shows.length} shows`);
  }

  async runScenario(scenario: LoadTestScenario): Promise<void> {
    if (!this.browser || !this.testData) {
      throw new Error('LoadTestRunner not initialized');
    }

    console.log(`\n🚀 Starting load test scenario: ${scenario.name}`);
    console.log(`📊 Virtual Users: ${scenario.virtualUsers}`);
    console.log(`⏱️ Duration: ${scenario.duration}`);
    console.log(`📈 Ramp-up: ${scenario.rampUp || 'immediate'}`);

    const startTime = Date.now();
    const durationMs = this.parseDuration(scenario.duration);
    const rampUpMs = scenario.rampUp ? this.parseDuration(scenario.rampUp) : 0;
    
    // Create user contexts based on distribution
    const userContexts = await this.createUserContexts(scenario);
    
    console.log(`🎭 Created ${userContexts.length} user contexts`);

    try {
      // Execute load test with ramp-up
      await this.executeWithRampUp(userContexts, scenario, rampUpMs, durationMs);
      
      // Generate performance report
      console.log(this.performanceMonitor.generateReport());
      
      // Validate performance targets
      await this.validatePerformanceTargets(scenario);
      
    } finally {
      // Cleanup contexts
      await this.cleanupContexts();
    }

    const totalTime = Date.now() - startTime;
    console.log(`✅ Scenario completed in ${totalTime}ms`);
  }

  private async createUserContexts(scenario: LoadTestScenario): Promise<UserContext[]> {
    if (!this.browser || !this.testData) {
      throw new Error('LoadTestRunner not initialized');
    }

    const contexts: UserContext[] = [];
    const { userDistribution } = scenario;
    
    // Calculate user counts based on distribution
    const userCounts = {
      exhibitors: Math.floor(scenario.virtualUsers * userDistribution.exhibitors / 100),
      secretaries: Math.floor(scenario.virtualUsers * userDistribution.secretaries / 100),
      judges: Math.floor(scenario.virtualUsers * userDistribution.judges / 100),
      admins: Math.floor(scenario.virtualUsers * userDistribution.admins / 100),
      anonymous: Math.floor(scenario.virtualUsers * userDistribution.anonymous / 100),
    };

    // Create contexts for each user type
    for (const [userType, count] of Object.entries(userCounts)) {
      for (let i = 0; i < count; i++) {
        const context = await this.browser.newContext({
          userAgent: faker.internet.userAgent(),
          viewport: { width: 1280, height: 720 },
          locale: 'en-US'
        });

        const page = await context.newPage();
        
        // Set up authentication if not anonymous
        if (userType !== 'anonymous') {
          await this.authenticateUser(page, userType as keyof typeof userCounts);
        }

        contexts.push({
          context,
          page,
          userType: userType as keyof typeof userCounts,
          userId: faker.string.uuid(),
          sessionData: {
            dogs: this.getRandomSubset(this.testData.dogs, 3),
            favoriteShows: this.getRandomSubset(this.testData.shows, 5)
          }
        });
      }
    }

    this.contexts = contexts.map(uc => uc.context);
    return contexts;
  }

  private async executeWithRampUp(
    userContexts: UserContext[],
    scenario: LoadTestScenario,
    rampUpMs: number,
    durationMs: number
  ): Promise<void> {
    const totalUsers = userContexts.length;
    const testEndTime = Date.now() + durationMs;
    
    // Start users gradually during ramp-up period
    const userPromises: Promise<void>[] = [];
    
    for (let i = 0; i < totalUsers; i++) {
      const userContext = userContexts[i];
      const startDelay = rampUpMs > 0 ? (i / totalUsers) * rampUpMs : 0;
      
      const userPromise = this.executeUserWorkflows(userContext, scenario, testEndTime, startDelay);
      userPromises.push(userPromise);
    }

    // Wait for all users to complete their workflows
    console.log('⏳ Waiting for all user workflows to complete...');
    await Promise.allSettled(userPromises);
    
    console.log(`📊 Load test execution completed`);
  }

  private async executeUserWorkflows(
    userContext: UserContext,
    scenario: LoadTestScenario,
    testEndTime: number,
    startDelay: number
  ): Promise<void> {
    // Wait for start delay
    if (startDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, startDelay));
    }

    while (Date.now() < testEndTime) {
      // Select a workflow based on weights
      const workflow = this.selectWeightedWorkflow(scenario.workflows);
      
      try {
        await this.executeWorkflow(userContext, workflow);
        
        // Random think time between workflows
        const thinkTime = faker.number.int({ min: 1000, max: 5000 });
        await new Promise(resolve => setTimeout(resolve, thinkTime));
        
      } catch (error) {
        console.error(`❌ Workflow error for user ${userContext.userId}:`, error);
        
        // Record error and continue
        this.performanceMonitor.endMeasurement('workflow_error', false);
        
        // Back off for a bit on error
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  private async executeWorkflow(userContext: UserContext, workflow: WorkflowConfig): Promise<void> {
    // Using workflow parameter for measurement
    
    this.performanceMonitor.startMeasurement(`workflow_${workflow.name}`);
    
    try {
      for (const step of workflow.steps) {
        await this.executeWorkflowStep(userContext, step);
      }
      
      this.performanceMonitor.endMeasurement(`workflow_${workflow.name}`, true);
      
    } catch (error) {
      this.performanceMonitor.endMeasurement(`workflow_${workflow.name}`, false);
      throw error;
    }
  }

  private async executeWorkflowStep(userContext: UserContext, step: WorkflowStep): Promise<void> {
    const { page } = userContext;
    const stepKey = `step_${step.name}`;
    
    this.performanceMonitor.startMeasurement(stepKey);
    
    try {
      switch (step.action) {
        case 'navigate':
          await this.executeNavigationStep(page, step);
          break;
          
        case 'api':
          await this.executeApiStep(page, step);
          break;
          
        case 'search':
          await this.executeSearchStep(page, step);
          break;
          
        case 'form':
          await this.executeFormStep(page, step, userContext);
          break;
          
        case 'wait':
          await this.executeWaitStep(step);
          break;
          
        case 'realtime':
          await this.executeRealtimeStep(page, step);
          break;
          
        default:
          throw new Error(`Unknown step action: ${step.action}`);
      }
      
      this.performanceMonitor.endMeasurement(stepKey, true);
      
    } catch (error) {
      this.performanceMonitor.endMeasurement(stepKey, false);
      throw error;
    }
  }

  private async executeNavigationStep(page: Page, step: WorkflowStep): Promise<void> {
    const url = this.resolveUrl(step.target);
    const timeout = step.timing?.timeout || 5000;
    
    const response = await page.goto(url, { 
      waitUntil: 'networkidle',
      timeout 
    });
    
    if (!response?.ok()) {
      throw new Error(`Navigation failed: ${response?.status()} ${response?.statusText()}`);
    }
    
    // Wait for page to be interactive
    await page.waitForLoadState('domcontentloaded');
  }

  private async executeApiStep(page: Page, step: WorkflowStep): Promise<void> {
    const url = this.resolveUrl(step.target);
    const timeout = step.timing?.timeout || 5000;
    
    const response = await page.request.get(url, { timeout });
    
    if (!response.ok()) {
      throw new Error(`API request failed: ${response.status()} ${response.statusText()}`);
    }
  }

  private async executeSearchStep(page: Page, step: WorkflowStep): Promise<void> {
    const searchInput = page.locator('[data-testid="search-input"]');
    await searchInput.waitFor({ timeout: 5000 });
    
    await searchInput.fill(step.target);
    
    // Wait for search results
    await page.waitForSelector('[data-testid="search-results"]', { timeout: 3000 });
  }

  private async executeFormStep(page: Page, step: WorkflowStep, userContext: UserContext): Promise<void> {
    // Navigate to form if needed
    if (step.target.startsWith('/')) {
      await page.goto(this.resolveUrl(step.target));
    }
    
    // Fill form with test data
    if (step.data) {
      const resolvedData = this.resolveStepData(step.data, userContext);
      
      for (const [field, value] of Object.entries(resolvedData)) {
        const input = page.locator(`[name="${field}"], [data-testid="${field}"]`);
        if (await input.isVisible()) {
          await input.fill(String(value));
        }
      }
    }
    
    // Submit form
    const submitButton = page.locator('[type="submit"], [data-testid="submit"]');
    await submitButton.click();
    
    // Wait for success response
    await page.waitForSelector('[data-testid="success-message"], .success', { timeout: 10000 });
  }

  private async executeWaitStep(step: WorkflowStep): Promise<void> {
    const duration = parseInt(step.target.replace(/\D/g, '')) * 1000;
    await new Promise(resolve => setTimeout(resolve, duration));
  }

  private async executeRealtimeStep(page: Page): Promise<void> {
    // Set up real-time connection simulation
    await page.evaluate(() => {
      // Simulate WebSocket connection for real-time updates
      if (window.EventSource) {
        const eventSource = new EventSource('/api/realtime/updates');
        eventSource.onmessage = (event) => {
          console.log('Real-time update received:', event.data);
        };
      }
    });
    
    // Wait for connection to establish
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  private selectWeightedWorkflow(workflows: WorkflowConfig[]): WorkflowConfig {
    const totalWeight = workflows.reduce((sum, w) => sum + w.weight, 0);
    const random = Math.random() * totalWeight;
    
    let cumulative = 0;
    for (const workflow of workflows) {
      cumulative += workflow.weight;
      if (random <= cumulative) {
        return workflow;
      }
    }
    
    return workflows[0];
  }

  private resolveUrl(target: string): string {
    if (target.startsWith('http')) {
      return target;
    }
    
    if (target.includes('{random_show_id}') && this.testData) {
      const randomShow = faker.helpers.arrayElement(this.testData.shows);
      target = target.replace('{random_show_id}', randomShow.id);
    }
    
    return `${this.baseUrl}${target.startsWith('/') ? '' : '/'}${target}`;
  }

  private resolveStepData(data: Record<string, unknown>, userContext: UserContext): Record<string, unknown> {
    const resolved = { ...data };
    
    // Replace placeholders with actual data
    for (const [key, value] of Object.entries(resolved)) {
      if (typeof value === 'string') {
        if (value === '{random_show_id}' && this.testData) {
          resolved[key] = faker.helpers.arrayElement(this.testData.shows).id;
        } else if (value === '{random_dog_id}' && userContext.sessionData.dogs) {
          resolved[key] = faker.helpers.arrayElement(userContext.sessionData.dogs).id;
        } else if (value === '{user_dog_id}' && userContext.sessionData.dogs) {
          resolved[key] = userContext.sessionData.dogs[0]?.id;
        }
      }
    }
    
    return resolved;
  }

  private async authenticateUser(page: Page, userType: string): Promise<void> {
    // Simulate authentication for different user types
    await page.goto(`${this.baseUrl}/sign-in`);
    
    const email = `${userType}@test.com`;
    const password = 'test123';
    
    await page.fill('[data-testid="email-input"]', email);
    await page.fill('[data-testid="password-input"]', password);
    await page.click('[data-testid="sign-in-button"]');
    
    // Wait for successful login
    await page.waitForSelector('[data-testid="user-menu"]', { timeout: 10000 });
  }

  private async validatePerformanceTargets(scenario: LoadTestScenario): Promise<void> {
    console.log('\n🎯 Validating Performance Targets...');
    
    const metrics = this.performanceMonitor.getAllMetrics();
    let allTargetsMet = true;
    
    for (const [operation, operationMetrics] of Object.entries(metrics)) {
      const responseTimeOk = operationMetrics.p95 <= scenario.performanceTargets.responseTime95;
      const errorRateOk = operationMetrics.errorRate <= scenario.performanceTargets.errorRate * 100;
      
      if (!responseTimeOk || !errorRateOk) {
        allTargetsMet = false;
      }
      
      console.log(`${operation}:`);
      console.log(`  Response Time (P95): ${operationMetrics.p95}ms ${responseTimeOk ? '✅' : '❌'}`);
      console.log(`  Error Rate: ${operationMetrics.errorRate.toFixed(1)}% ${errorRateOk ? '✅' : '❌'}`);
    }
    
    if (allTargetsMet) {
      console.log('🎉 All performance targets met!');
    } else {
      console.log('⚠️ Some performance targets not met');
    }
  }

  private async cleanupContexts(): Promise<void> {
    console.log('🧹 Cleaning up browser contexts...');
    
    for (const context of this.contexts) {
      await context.close();
    }
    
    this.contexts = [];
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([smh])$/);
    if (!match) {
      throw new Error(`Invalid duration format: ${duration}`);
    }
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      default: throw new Error(`Unknown duration unit: ${unit}`);
    }
  }

  private getRandomSubset<T>(array: T[], maxCount: number): T[] {
    const count = Math.min(faker.number.int({ min: 1, max: maxCount }), array.length);
    return faker.helpers.arrayElements(array, count);
  }

  async runAllScenarios(): Promise<void> {
    console.log('🚀 Starting comprehensive load testing...');
    
    for (const scenario of LOAD_TEST_SCENARIOS) {
      try {
        await this.runScenario(scenario);
        
        // Cool down between scenarios
        await new Promise(resolve => setTimeout(resolve, 30000));
        
      } catch (error) {
        console.error(`❌ Scenario ${scenario.name} failed:`, error);
      }
      
      // Reset performance monitor for next scenario
      this.performanceMonitor.reset();
    }
    
    console.log('✅ All load test scenarios completed');
  }
}

interface UserContext {
  context: BrowserContext;
  page: Page;
  userType: 'exhibitors' | 'secretaries' | 'judges' | 'admins' | 'anonymous';
  userId: string;
  sessionData: {
    dogs: { id: string; name: string; breed: string }[];
    favoriteShows: { id: string; name: string; type: string }[];
  };
}

// Export main test runner
export { LoadTestRunner };