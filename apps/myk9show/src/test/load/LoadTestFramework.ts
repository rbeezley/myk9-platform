/**
 * Load Testing Framework for myK9Show Application
 * 
 * Comprehensive load testing targeting 100+ concurrent users with:
 * - Critical user workflows
 * - Database performance scenarios
 * - Realistic traffic patterns
 * - Performance monitoring and reporting
 */

import { faker } from '@faker-js/faker';
import type { User, UserRole } from '@/types/auth-types';
import type { Show } from '@/types/show-types';
import type { Dog } from '@/types/dog-types';
import { logger } from '@/services/LoggingService';

// Performance targets and budgets
export const PERFORMANCE_TARGETS = {
  // Response time targets (95th percentile)
  responseTime: {
    api: 200, // ms - API responses
    page: 3000, // ms - Page loads on 3G
    search: 300, // ms - Search queries
    realtime: 500, // ms - Real-time updates
  },
  
  // Error rate thresholds
  errorRate: {
    normal: 0.05, // 5% under normal load
    peak: 0.10, // 10% under peak load
    stress: 0.25, // 25% under stress conditions
  },
  
  // Throughput targets (requests per second)
  throughput: {
    reads: 1000, // Read operations
    writes: 200, // Write operations
    search: 500, // Search queries
  },
  
  // Concurrent user limits
  users: {
    normal: 100, // Normal load
    peak: 250, // Peak load (show entry periods)
    stress: 500, // Stress testing
  },
  
  // Database performance
  database: {
    connectionPool: 50, // Max concurrent connections
    queryTimeout: 5000, // ms
    slowQueryThreshold: 1000, // ms
  }
};

// Load test scenarios configuration
export interface LoadTestScenario {
  name: string;
  description: string;
  virtualUsers: number;
  duration: string;
  rampUp?: string;
  userDistribution: UserDistribution;
  workflows: WorkflowConfig[];
  performanceTargets: PerformanceTargets;
}

export interface UserDistribution {
  exhibitors: number;
  secretaries: number;
  judges: number;
  admins: number;
  anonymous: number;
}

export interface WorkflowConfig {
  name: string;
  weight: number; // Percentage of users performing this workflow
  steps: WorkflowStep[];
  repeatConfig?: {
    minRepeats: number;
    maxRepeats: number;
    pauseBetween: [number, number]; // [min, max] in seconds
  };
}

export interface WorkflowStep {
  name: string;
  action: 'navigate' | 'api' | 'search' | 'form' | 'wait' | 'realtime';
  target: string;
  data?: Record<string, unknown>;
  validation?: ValidationRule[];
  timing?: {
    timeout: number;
    expectedDuration: number;
  };
}

export interface ValidationRule {
  type: 'status' | 'response_time' | 'content' | 'count';
  condition: string;
  value: string | number;
}

export interface PerformanceTargets {
  responseTime95: number;
  errorRate: number;
  throughputMin: number;
  availability: number;
}

// Data generators for realistic test data
export class LoadTestDataGenerator {
  private static instance: LoadTestDataGenerator;
  
  static getInstance(): LoadTestDataGenerator {
    if (!LoadTestDataGenerator.instance) {
      LoadTestDataGenerator.instance = new LoadTestDataGenerator();
    }
    return LoadTestDataGenerator.instance;
  }

  generateUser(role: UserRole = 'exhibitor'): User {
    return {
      id: faker.string.uuid(),
      email: faker.internet.email(),
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      phone: faker.phone.number(),
      roles: [role],
      permissions: this.getPermissionsForRole(role),
      preferences: {
        notifications: {
          email: true,
          sms: false,
          push: true,
          frequency: 'immediate'
        },
        privacy: {
          profileVisibility: 'public',
          contactInfoVisibility: 'members'
        }
      },
      createdAt: faker.date.past().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  generateDog(): Dog {
    const breeds = [
      'Border Collie', 'Australian Shepherd', 'Golden Retriever',
      'Labrador Retriever', 'German Shepherd', 'Belgian Malinois',
      'Jack Russell Terrier', 'Shetland Sheepdog', 'Poodle'
    ];

    return {
      id: faker.string.uuid(),
      name: faker.person.firstName(),
      breed: faker.helpers.arrayElement(breeds),
      dateOfBirth: faker.date.past({ years: 10 }).toISOString(),
      gender: faker.helpers.arrayElement(['male', 'female']),
      color: faker.helpers.arrayElement(['Black', 'Brown', 'White', 'Tricolor', 'Merle']),
      weight: faker.number.int({ min: 15, max: 80 }),
      height: faker.number.int({ min: 12, max: 28 }),
      microchipNumber: faker.string.alphanumeric(15),
      registrations: [{
        organization: faker.helpers.arrayElement(['AKC', 'UKC', 'CKC']),
        number: faker.string.alphanumeric(12),
        name: faker.person.firstName(),
        issueDate: faker.date.past().toISOString()
      }],
      health: {
        vaccinations: [{
          type: 'Rabies',
          date: faker.date.recent().toISOString(),
          expirationDate: faker.date.future().toISOString(),
          veterinarian: 'Dr. ' + faker.person.lastName()
        }],
        medications: [],
        conditions: [],
        vetInfo: {
          clinicName: faker.company.name() + ' Veterinary Clinic',
          doctorName: 'Dr. ' + faker.person.fullName(),
          phone: faker.phone.number(),
          address: faker.location.streetAddress()
        }
      },
      training: {
        level: faker.helpers.arrayElement(['Novice', 'Open', 'Excellent', 'Master']),
        achievements: [],
        notes: faker.lorem.paragraph()
      },
      ownerId: faker.string.uuid(),
      createdAt: faker.date.past().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  generateShow(): Show {
    const types = ['Agility', 'Obedience', 'Rally', 'Conformation'];
    const statuses = ['Upcoming', 'Active', 'Completed', 'Draft'];
    const startDate = faker.date.future({ days: 30 });
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + faker.number.int({ min: 1, max: 3 }));

    return {
      id: faker.string.uuid(),
      name: `${faker.helpers.arrayElement(types)} Championship ${faker.date.recent().getFullYear()}`,
      type: faker.helpers.arrayElement(types),
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      location: `${faker.location.city()}, ${faker.location.state()}`,
      status: faker.helpers.arrayElement(statuses),
      events: [faker.helpers.arrayElement(types)],
      source: 'myK9Show',
      entryOpenDate: faker.date.recent({ days: 30 }).toISOString(),
      entryCloseDate: faker.date.future({ days: 7 }).toISOString(),
      preEntryFee: `$${faker.number.int({ min: 20, max: 40 })}`,
      dayOfShowFee: `$${faker.number.int({ min: 30, max: 50 })}`,
      clubId: faker.string.uuid(),
      clubName: faker.company.name() + ' Dog Club',
      clubAddress: faker.location.streetAddress(),
      clubEmail: faker.internet.email(),
      chairman: faker.string.uuid(),
      secretary: faker.string.uuid(),
      chiefSteward: faker.string.uuid(),
      assignedJudges: [{
        judgeId: faker.string.uuid(),
        assignedDate: new Date().toISOString(),
        breed: 'All Breeds'
      }],
      stats: [],
      trials: []
    };
  }

  generateBulkData(counts: { users: number; dogs: number; shows: number }) {
    return {
      users: Array.from({ length: counts.users }, () => 
        this.generateUser(this.getRandomRole())
      ),
      dogs: Array.from({ length: counts.dogs }, () => this.generateDog()),
      shows: Array.from({ length: counts.shows }, () => this.generateShow()),
    };
  }

  private getRandomRole(): UserRole {
    const weights = [
      { role: 'exhibitor' as UserRole, weight: 0.7 },
      { role: 'secretary' as UserRole, weight: 0.15 },
      { role: 'judge' as UserRole, weight: 0.1 },
      { role: 'admin' as UserRole, weight: 0.05 },
    ];

    const random = Math.random();
    let cumulative = 0;
    
    for (const { role, weight } of weights) {
      cumulative += weight;
      if (random <= cumulative) {
        return role;
      }
    }
    
    return 'exhibitor';
  }

  private getPermissionsForRole(role: UserRole): string[] {
    const permissions: Record<UserRole, string[]> = {
      exhibitor: ['view_shows', 'create_entries', 'manage_dogs'],
      secretary: ['view_shows', 'manage_entries', 'create_shows', 'manage_trials'],
      judge: ['view_shows', 'judge_classes', 'view_entries'],
      admin: ['*'],
    };

    return permissions[role] || [];
  }
}

// Performance monitoring utilities
export class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();
  private startTimes: Map<string, number> = new Map();
  private errorCounts: Map<string, number> = new Map();
  private totalRequests: Map<string, number> = new Map();

  startMeasurement(operation: string): void {
    this.startTimes.set(operation, performance.now());
  }

  endMeasurement(operation: string, success: boolean = true): number {
    const startTime = this.startTimes.get(operation);
    if (!startTime) {
      logger.warn(`No start time found for operation: ${operation}`, 'app', {});
      return 0;
    }

    const duration = performance.now() - startTime;
    
    // Record metrics
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    this.metrics.get(operation)!.push(duration);

    // Track success/error rates
    const totalKey = operation;
    const errorKey = operation;
    
    this.totalRequests.set(totalKey, (this.totalRequests.get(totalKey) || 0) + 1);
    
    if (!success) {
      this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || 0) + 1);
    }

    this.startTimes.delete(operation);
    return duration;
  }

  getMetrics(operation: string) {
    const durations = this.metrics.get(operation) || [];
    const total = this.totalRequests.get(operation) || 0;
    const errors = this.errorCounts.get(operation) || 0;

    if (durations.length === 0) {
      return {
        count: 0,
        min: 0,
        max: 0,
        avg: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        errorRate: 0,
        throughput: 0
      };
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const sum = durations.reduce((a, b) => a + b, 0);

    return {
      count: durations.length,
      min: Math.round(sorted[0]),
      max: Math.round(sorted[sorted.length - 1]),
      avg: Math.round(sum / durations.length),
      p50: Math.round(sorted[Math.floor(sorted.length * 0.5)]),
      p95: Math.round(sorted[Math.floor(sorted.length * 0.95)]),
      p99: Math.round(sorted[Math.floor(sorted.length * 0.99)]),
      errorRate: total > 0 ? (errors / total) * 100 : 0,
      throughput: durations.length / (Math.max(...durations) - Math.min(...durations)) * 1000
    };
  }

  getAllMetrics() {
    const results: Record<string, ReturnType<typeof this.getMetrics>> = {};
    
    for (const operation of this.metrics.keys()) {
      results[operation] = this.getMetrics(operation);
    }
    
    return results;
  }

  reset(): void {
    this.metrics.clear();
    this.startTimes.clear();
    this.errorCounts.clear();
    this.totalRequests.clear();
  }

  generateReport(): string {
    const allMetrics = this.getAllMetrics();
    const operations = Object.keys(allMetrics);

    if (operations.length === 0) {
      return 'No performance data collected.';
    }

    let report = '\n=== Performance Load Test Report ===\n\n';
    
    report += 'Operation                    | Count | Min  | Avg  | P95  | P99  | Max   | Error% | RPS\n';
    report += '----------------------------|-------|------|------|------|------|-------|--------|-----\n';
    
    operations.forEach(operation => {
      const metrics = allMetrics[operation];
      const name = operation.padEnd(27);
      const count = metrics.count.toString().padStart(5);
      const min = `${metrics.min}ms`.padStart(4);
      const avg = `${metrics.avg}ms`.padStart(4);
      const p95 = `${metrics.p95}ms`.padStart(4);
      const p99 = `${metrics.p99}ms`.padStart(4);
      const max = `${metrics.max}ms`.padStart(5);
      const error = `${metrics.errorRate.toFixed(1)}%`.padStart(6);
      const rps = metrics.throughput.toFixed(1).padStart(4);
      
      report += `${name} | ${count} | ${min} | ${avg} | ${p95} | ${p99} | ${max} | ${error} | ${rps}\n`;
    });

    // Summary statistics
    const totalRequests = operations.reduce((sum, op) => sum + allMetrics[op].count, 0);
    const avgErrorRate = operations.reduce((sum, op) => sum + allMetrics[op].errorRate, 0) / operations.length;
    const totalThroughput = operations.reduce((sum, op) => sum + allMetrics[op].throughput, 0);

    report += '\n=== Summary ===\n';
    report += `Total Requests: ${totalRequests}\n`;
    report += `Average Error Rate: ${avgErrorRate.toFixed(2)}%\n`;
    report += `Total Throughput: ${totalThroughput.toFixed(1)} RPS\n`;

    // Performance targets validation
    report += '\n=== Performance Targets Validation ===\n';
    
    operations.forEach(operation => {
      const metrics = allMetrics[operation];
      const targetResponseTime = this.getTargetForOperation(operation);
      const targetErrorRate = PERFORMANCE_TARGETS.errorRate.normal * 100;
      
      const responseTimeOk = metrics.p95 <= targetResponseTime;
      const errorRateOk = metrics.errorRate <= targetErrorRate;
      
      report += `${operation}:\n`;
      report += `  Response Time (P95): ${metrics.p95}ms ${responseTimeOk ? '✅' : '❌'} (target: ${targetResponseTime}ms)\n`;
      report += `  Error Rate: ${metrics.errorRate.toFixed(1)}% ${errorRateOk ? '✅' : '❌'} (target: <${targetErrorRate}%)\n`;
    });

    return report;
  }

  private getTargetForOperation(operation: string): number {
    if (operation.includes('api')) return PERFORMANCE_TARGETS.responseTime.api;
    if (operation.includes('search')) return PERFORMANCE_TARGETS.responseTime.search;
    if (operation.includes('realtime')) return PERFORMANCE_TARGETS.responseTime.realtime;
    return PERFORMANCE_TARGETS.responseTime.page;
  }
}

// Load test scenarios
export const LOAD_TEST_SCENARIOS: LoadTestScenario[] = [
  {
    name: 'normal_load',
    description: 'Normal traffic patterns with typical user distribution',
    virtualUsers: 100,
    duration: '10m',
    rampUp: '2m',
    userDistribution: {
      exhibitors: 70,
      secretaries: 15,
      judges: 10,
      admins: 3,
      anonymous: 2
    },
    workflows: [
      {
        name: 'browse_shows',
        weight: 40,
        steps: [
          {
            name: 'load_browse_page',
            action: 'navigate',
            target: '/shows/browse',
            timing: { timeout: 5000, expectedDuration: 2000 }
          },
          {
            name: 'search_shows',
            action: 'search',
            target: 'agility',
            timing: { timeout: 2000, expectedDuration: 300 }
          },
          {
            name: 'view_show_details',
            action: 'navigate',
            target: '/shows/{random_show_id}',
            timing: { timeout: 3000, expectedDuration: 1500 }
          }
        ],
        repeatConfig: {
          minRepeats: 2,
          maxRepeats: 5,
          pauseBetween: [1, 3]
        }
      },
      {
        name: 'manage_entries',
        weight: 25,
        steps: [
          {
            name: 'load_my_entries',
            action: 'navigate',
            target: '/my-entries',
            timing: { timeout: 4000, expectedDuration: 2000 }
          },
          {
            name: 'create_entry',
            action: 'form',
            target: '/api/entries',
            data: { showId: '{random_show_id}', dogId: '{random_dog_id}' },
            timing: { timeout: 3000, expectedDuration: 500 }
          }
        ]
      },
      {
        name: 'real_time_updates',
        weight: 20,
        steps: [
          {
            name: 'subscribe_to_updates',
            action: 'realtime',
            target: 'show_updates',
            timing: { timeout: 1000, expectedDuration: 100 }
          },
          {
            name: 'process_notifications',
            action: 'wait',
            target: '5s',
            timing: { timeout: 6000, expectedDuration: 5000 }
          }
        ]
      }
    ],
    performanceTargets: {
      responseTime95: PERFORMANCE_TARGETS.responseTime.page,
      errorRate: PERFORMANCE_TARGETS.errorRate.normal,
      throughputMin: 50,
      availability: 99.5
    }
  },
  
  {
    name: 'peak_entry_load',
    description: 'Peak traffic during show entry opening periods',
    virtualUsers: 250,
    duration: '15m',
    rampUp: '3m',
    userDistribution: {
      exhibitors: 85,
      secretaries: 10,
      judges: 3,
      admins: 2,
      anonymous: 0
    },
    workflows: [
      {
        name: 'rush_entry_submission',
        weight: 60,
        steps: [
          {
            name: 'quick_browse',
            action: 'navigate',
            target: '/shows/browse',
            timing: { timeout: 3000, expectedDuration: 1500 }
          },
          {
            name: 'rapid_entry_creation',
            action: 'form',
            target: '/api/entries',
            data: { showId: '{popular_show_id}', dogId: '{user_dog_id}' },
            timing: { timeout: 5000, expectedDuration: 800 }
          },
          {
            name: 'payment_processing',
            action: 'api',
            target: '/api/payments',
            data: { entryId: '{new_entry_id}', amount: 25 },
            timing: { timeout: 10000, expectedDuration: 2000 }
          }
        ],
        repeatConfig: {
          minRepeats: 1,
          maxRepeats: 3,
          pauseBetween: [0.5, 2]
        }
      },
      {
        name: 'show_monitoring',
        weight: 30,
        steps: [
          {
            name: 'check_availability',
            action: 'api',
            target: '/api/shows/{show_id}/availability',
            timing: { timeout: 2000, expectedDuration: 200 }
          },
          {
            name: 'refresh_status',
            action: 'api',
            target: '/api/entries/status',
            timing: { timeout: 2000, expectedDuration: 300 }
          }
        ]
      }
    ],
    performanceTargets: {
      responseTime95: PERFORMANCE_TARGETS.responseTime.page * 1.5,
      errorRate: PERFORMANCE_TARGETS.errorRate.peak,
      throughputMin: 100,
      availability: 99.0
    }
  },
  
  {
    name: 'stress_test',
    description: 'Stress testing to find breaking points',
    virtualUsers: 500,
    duration: '20m',
    rampUp: '5m',
    userDistribution: {
      exhibitors: 75,
      secretaries: 15,
      judges: 7,
      admins: 3,
      anonymous: 0
    },
    workflows: [
      {
        name: 'heavy_database_load',
        weight: 50,
        steps: [
          {
            name: 'complex_search',
            action: 'search',
            target: 'multi_criteria_search',
            data: { 
              discipline: 'agility',
              location: 'california',
              dateRange: '2024-01-01,2024-12-31'
            },
            timing: { timeout: 5000, expectedDuration: 1000 }
          },
          {
            name: 'bulk_data_load',
            action: 'api',
            target: '/api/shows/bulk',
            timing: { timeout: 10000, expectedDuration: 3000 }
          }
        ]
      }
    ],
    performanceTargets: {
      responseTime95: PERFORMANCE_TARGETS.responseTime.page * 2,
      errorRate: PERFORMANCE_TARGETS.errorRate.stress,
      throughputMin: 25,
      availability: 95.0
    }
  }
];