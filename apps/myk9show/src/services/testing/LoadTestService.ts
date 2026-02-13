/**
 * Load Testing Service
 *
 * Generates realistic data volumes to test application performance
 * and validate optimization effectiveness at scale.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { faker } from '@faker-js/faker';
import type { Dog } from '@/types/dog-types';
import type { User } from '@/types/user-types';
import type { Show } from '@/types/show-types';
import { useDogStore } from '@/store/dogStore';
import { useUserStore } from '@/store/userStore';
import { useShowStore } from '@/store/showStore';
import { logger } from '@/services/LoggingService';

export interface LoadTestConfig {
  dogs: number;
  people: number;
  shows: number;
  entries: number;
  measurePerformance: boolean;
  cleanupAfter: boolean;
}

export interface LoadTestResults {
  config: LoadTestConfig;
  timing: {
    dataGeneration: number;
    storePopulation: number;
    renderTime: number;
    totalTime: number;
    memoryBefore: number;
    memoryAfter: number;
    memoryDelta: number;
  };
  performance: {
    domNodes: number;
    storeSize: number;
    renderFPS: number;
    searchLatency: number;
  };
  success: boolean;
  error?: string;
}

export class LoadTestService {

  /**
   * Run comprehensive load test with specified data volumes
   */
  async runLoadTest(config: LoadTestConfig): Promise<LoadTestResults> {
    logger.debug(`🧪 Starting load test:`, 'testing', { data: config });
    
    const startTime = performance.now();
    const memoryBefore = this.getMemoryUsage();
    
    try {
      // Generate test data
      const dataGenStart = performance.now();
      const testData = this.generateTestData(config);
      const dataGenTime = performance.now() - dataGenStart;

      // Populate stores
      const storePopStart = performance.now();
      await this.populateStores(testData);
      const storePopTime = performance.now() - storePopStart;

      // Measure render performance
      const renderStart = performance.now();
      const renderMetrics = await this.measureRenderPerformance();
      const renderTime = performance.now() - renderStart;

      // Collect final metrics
      const memoryAfter = this.getMemoryUsage();
      const performanceMetrics = await this.collectPerformanceMetrics();

      const results: LoadTestResults = {
        config,
        timing: {
          dataGeneration: dataGenTime,
          storePopulation: storePopTime,
          renderTime,
          totalTime: performance.now() - startTime,
          memoryBefore,
          memoryAfter,
          memoryDelta: memoryAfter - memoryBefore
        },
        performance: {
          ...performanceMetrics,
          ...renderMetrics
        },
        success: true
      };

      logger.debug(`✅ Load test completed:`, 'testing', { data: results });

      // Cleanup if requested
      if (config.cleanupAfter) {
        await this.cleanupTestData();
      }

      return results;

    } catch (error) {
      logger.error('❌ Load test failed:', 'services', {}, error as Error);
      return {
        config,
        timing: {
          dataGeneration: 0,
          storePopulation: 0,
          renderTime: 0,
          totalTime: performance.now() - startTime,
          memoryBefore,
          memoryAfter: this.getMemoryUsage(),
          memoryDelta: 0
        },
        performance: {
          domNodes: 0,
          storeSize: 0,
          renderFPS: 0,
          searchLatency: 0
        },
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Generate realistic test data
   */
  private generateTestData(config: LoadTestConfig) {
    logger.debug(`📊 Generating ${config.people} people, ${config.dogs} dogs, ${config.shows} shows...`, 'services', {});

    // Generate people first
    const people: User[] = [];
    for (let i = 0; i < config.people; i++) {
      people.push({
        id: `load-test-person-${i}`,
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        email: faker.internet.email(),
        phone: faker.phone.number(),
        address: faker.location.streetAddress(),
        city: faker.location.city(),
        state: faker.location.state(),
        zipCode: faker.location.zipCode(),
        membershipId: faker.string.alphanumeric(8),
        roles: ['exhibitor'],
        createdAt: faker.date.past(),
        updatedAt: faker.date.recent()
      });
    }

    // Generate dogs with realistic breed distribution
    const commonBreeds = [
      'Golden Retriever', 'Labrador Retriever', 'German Shepherd', 'Bulldog',
      'Poodle', 'Beagle', 'Rottweiler', 'Yorkshire Terrier', 'Dachshund',
      'Siberian Husky', 'Boxer', 'Border Collie'
    ];

    const dogs: Dog[] = [];
    for (let i = 0; i < config.dogs; i++) {
      const owner = faker.helpers.arrayElement(people);
      dogs.push({
        id: `load-test-dog-${i}`,
        name: faker.animal.dog(),
        breed: faker.helpers.arrayElement(commonBreeds),
        sex: faker.helpers.arrayElement(['male', 'female']),
        age: faker.number.int({ min: 1, max: 12 }),
        ownerId: owner.id,
        ownerName: `${owner.firstName} ${owner.lastName}`,
        dateOfBirth: faker.date.past({ years: 5 }).toISOString(),
        color: faker.color.human(),
        weight: faker.number.int({ min: 10, max: 150 }).toString(),
        height: faker.number.int({ min: 10, max: 35 }).toString(),
        microchipNumber: faker.string.numeric(15),
        registrations: [{
          id: faker.string.uuid(),
          organization: faker.helpers.arrayElement(['AKC', 'UKC', 'CKC']),
          registeredName: faker.animal.dog(),
          breed: faker.helpers.arrayElement(commonBreeds),
          registrationNumber: faker.string.alphanumeric(10),
          status: 'Active',
          registrationDate: faker.date.past().toISOString()
        }]
      });
    }

    // Generate shows
    const shows: Show[] = [];
    for (let i = 0; i < config.shows; i++) {
      shows.push({
        id: `load-test-show-${i}`,
        name: `${faker.location.city()} Dog Show ${i + 1}`,
        type: 'Conformation',
        startDate: faker.date.future().toISOString(),
        endDate: faker.date.future().toISOString(),
        location: `${faker.company.name()}, ${faker.location.streetAddress()}, ${faker.location.city()}, ${faker.location.state()} ${faker.location.zipCode()}`,
        status: faker.helpers.arrayElement(['draft', 'published', 'active', 'completed']),
        events: ['Conformation'],
        source: 'myK9Show' as const,
        entryOpenDate: faker.date.recent().toISOString(),
        entryCloseDate: faker.date.future().toISOString(),
        preEntryFee: faker.number.int({ min: 25, max: 50 }).toString(),
        clubId: faker.string.uuid(),
        clubName: faker.company.name(),
        clubAddress: faker.location.streetAddress(),
        clubEmail: faker.internet.email(),
        chairman: faker.person.fullName(),
        secretary: faker.person.fullName(),
        chiefSteward: faker.person.fullName(),
        assignedJudges: [],
        stats: [],
        trials: []
      });
    }

    return { people, dogs, shows };
  }

  /**
   * Populate stores with test data
   */
  private async populateStores(testData: { people: User[], dogs: Dog[], shows: Show[] }) {
    const dogStore = useDogStore.getState();
    const userStore = useUserStore.getState();
    const showStore = useShowStore.getState();

    // Set people
    userStore.setPeople(testData.people);

    // Set dogs
    dogStore.setDogs(testData.dogs);

    // Set shows
    showStore.setShows(testData.shows);

    // Allow React to process updates
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Measure rendering performance
   */
  private async measureRenderPerformance() {
    // Trigger re-renders by navigating to data-heavy pages
    const pages = ['/dogs', '/people', '/browse-shows'];
    let totalFrames = 0;
    let totalTime = 0;

    for (const page of pages) {
      const start = performance.now();
      
      // Simulate navigation (in real app this would trigger route changes)
      window.history.pushState({}, '', page);
      
      // Wait for render
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const time = performance.now() - start;
      totalTime += time;
      totalFrames++;
    }

    const renderFPS = totalFrames / (totalTime / 1000);
    
    // Test search latency
    const searchStart = performance.now();
    // Simulate search operation
    await new Promise(resolve => setTimeout(resolve, 100));
    const searchLatency = performance.now() - searchStart;

    return {
      renderFPS,
      searchLatency
    };
  }

  /**
   * Collect comprehensive performance metrics
   */
  private async collectPerformanceMetrics() {
    const dogStore = useDogStore.getState();
    const userStore = useUserStore.getState();
    const showStore = useShowStore.getState();

    const storeSize = JSON.stringify({
      dogs: dogStore.dogs,
      people: userStore.people,
      shows: showStore.shows
    }).length;

    const domNodes = document.querySelectorAll('*').length;

    return {
      domNodes,
      storeSize
    };
  }

  /**
   * Get current memory usage
   */
  private getMemoryUsage(): number {
    if ('memory' in performance) {
      const memInfo = (performance as any).memory;
      return memInfo.usedJSHeapSize / 1024 / 1024; // MB
    }
    return 0;
  }

  /**
   * Cleanup test data
   */
  private async cleanupTestData() {
    logger.debug('🧹 Cleaning up test data...', 'services', {});
    
    const dogStore = useDogStore.getState();
    const userStore = useUserStore.getState();
    const showStore = useShowStore.getState();

    // Remove test data (assuming stores have batch remove methods)
    const testDogs = dogStore.dogs.filter(d => d.id.startsWith('load-test-'));
    const testPeople = userStore.people.filter(p => p.id.startsWith('load-test-'));
    const testShows = showStore.shows.filter(s => s.id.startsWith('load-test-'));

    testDogs.forEach(dog => dogStore.removeDog(dog.id));
    testPeople.forEach(person => userStore.removePerson(person.id));
    testShows.forEach(show => showStore.removeShow(show.id));

    logger.debug(`🗑️ Cleaned up ${testDogs.length} dogs, ${testPeople.length} people, ${testShows.length} shows`, 'services', {});
  }

  /**
   * Manual cleanup - can be called from UI
   */
  async manualCleanup() {
    await this.cleanupTestData();
  }

  /**
   * Run predefined load test scenarios
   */
  async runStandardTests() {
    const scenarios = [
      { name: 'Small Scale', dogs: 100, people: 50, shows: 5, entries: 200 },
      { name: 'Medium Scale', dogs: 1000, people: 500, shows: 20, entries: 2000 },
      { name: 'Large Scale', dogs: 5000, people: 2000, shows: 50, entries: 10000 },
      { name: 'Stress Test', dogs: 10000, people: 5000, shows: 100, entries: 20000 }
    ];

    const results = [];
    
    for (const scenario of scenarios) {
      logger.debug(`\n🚀 Running ${scenario.name} test...`, 'services', {});
      
      const config: LoadTestConfig = {
        ...scenario,
        measurePerformance: true,
        cleanupAfter: true
      };

      const result = await this.runLoadTest(config);
      results.push({ scenario: scenario.name, ...result });

      // Brief pause between tests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return results;
  }
}

// Service instance
let loadTestService: LoadTestService | null = null;

export function getLoadTestService(): LoadTestService {
  if (!loadTestService) {
    loadTestService = new LoadTestService();
  }
  return loadTestService;
}