import { StoreName } from '@/store/store-categories';

interface StoreDependency {
  storeName: StoreName;
  requiredStores: StoreName[];
  optionalStores: StoreName[];
  loadPriority: number;
  canLazyLoad: boolean;
}

interface DependencyGraph {
  [key: string]: StoreDependency;
}

export class StoreDependencyManager {
  private dependencies: DependencyGraph = {};
  private loadOrder: StoreName[] = [];
  private loadPromises: Map<StoreName, Promise<void>> = new Map();

  constructor() {
    this.initializeDependencies();
  }

  private initializeDependencies() {
    // Core entity stores (no dependencies)
    this.addDependency('userStore', {
      requiredStores: [],
      optionalStores: [],
      loadPriority: 1,
      canLazyLoad: false,
    });

    this.addDependency('dogStore', {
      requiredStores: ['userStore'],
      optionalStores: [],
      loadPriority: 1,
      canLazyLoad: false,
    });

    this.addDependency('clubStore', {
      requiredStores: [],
      optionalStores: ['userStore'],
      loadPriority: 1,
      canLazyLoad: false,
    });

    this.addDependency('showStore', {
      requiredStores: ['clubStore'],
      optionalStores: ['userStore'],
      loadPriority: 1,
      canLazyLoad: false,
    });

    // Navigation and search stores
    this.addDependency('navigationStore', {
      requiredStores: [],
      optionalStores: [],
      loadPriority: 2,
      canLazyLoad: true,
    });

    this.addDependency('searchHistoryStore', {
      requiredStores: [],
      optionalStores: [],
      loadPriority: 2,
      canLazyLoad: true,
    });

    this.addDependency('searchAnalyticsStore', {
      requiredStores: ['searchHistoryStore'],
      optionalStores: [],
      loadPriority: 3,
      canLazyLoad: true,
    });

    // Entry management stores
    this.addDependency('entryStore', {
      requiredStores: ['dogStore', 'showStore'],
      optionalStores: ['userStore'],
      loadPriority: 2,
      canLazyLoad: true,
    });

    this.addDependency('registrationsStore', {
      requiredStores: ['entryStore'],
      optionalStores: [],
      loadPriority: 2,
      canLazyLoad: true,
    });

    // Template stores
    this.addDependency('templateStore', {
      requiredStores: [],
      optionalStores: [],
      loadPriority: 3,
      canLazyLoad: true,
    });

    this.addDependency('classTemplateStore', {
      requiredStores: ['templateStore'],
      optionalStores: [],
      loadPriority: 3,
      canLazyLoad: true,
    });

    this.addDependency('showTemplateStore', {
      requiredStores: ['templateStore'],
      optionalStores: [],
      loadPriority: 3,
      canLazyLoad: true,
    });

    // Class and trial stores
    this.addDependency('classStore', {
      requiredStores: ['showStore'],
      optionalStores: ['templateStore', 'classTemplateStore'],
      loadPriority: 3,
      canLazyLoad: true,
    });

    this.addDependency('trialStore', {
      requiredStores: ['showStore'],
      optionalStores: ['classStore'],
      loadPriority: 3,
      canLazyLoad: true,
    });

    // Workflow stores
    this.addDependency('classCreationStore', {
      requiredStores: ['classStore', 'templateStore'],
      optionalStores: ['classTemplateStore'],
      loadPriority: 3,
      canLazyLoad: true,
    });

    this.addDependency('showRegistrationStore', {
      requiredStores: ['showStore', 'entryStore'],
      optionalStores: ['registrationsStore'],
      loadPriority: 3,
      canLazyLoad: true,
    });

    this.addDependency('wizardStore', {
      requiredStores: [],
      optionalStores: ['showStore', 'classStore'],
      loadPriority: 3,
      canLazyLoad: true,
    });

    // Scoring and results stores
    this.addDependency('competitionStore', {
      requiredStores: ['entryStore', 'classStore'],
      optionalStores: [],
      loadPriority: 3,
      canLazyLoad: true,
    });

    this.addDependency('offlineScoringStore', {
      requiredStores: ['competitionStore'],
      optionalStores: [],
      loadPriority: 3,
      canLazyLoad: true,
    });

    this.addDependency('pastResultsStore', {
      requiredStores: ['competitionStore'],
      optionalStores: [],
      loadPriority: 3,
      canLazyLoad: true,
    });

    // Utility stores
    this.addDependency('armbandStore', {
      requiredStores: ['entryStore', 'classStore'],
      optionalStores: [],
      loadPriority: 3,
      canLazyLoad: true,
    });

    this.addDependency('achievementsStore', {
      requiredStores: ['dogStore'],
      optionalStores: ['competitionStore'],
      loadPriority: 3,
      canLazyLoad: true,
    });

    this.addDependency('draftStore', {
      requiredStores: [],
      optionalStores: ['showStore', 'classStore'],
      loadPriority: 3,
      canLazyLoad: true,
    });

    this.addDependency('syncStore', {
      requiredStores: [],
      optionalStores: [],
      loadPriority: 2,
      canLazyLoad: true,
    });

    // Calculate load order after all dependencies are added
    this.calculateLoadOrder();
  }

  addDependency(storeName: StoreName, config: Omit<StoreDependency, 'storeName'>) {
    this.dependencies[storeName] = {
      storeName,
      ...config,
    };
  }

  private calculateLoadOrder() {
    const visited = new Set<StoreName>();
    const visiting = new Set<StoreName>();
    const result: StoreName[] = [];

    const visit = (storeName: StoreName) => {
      if (visiting.has(storeName)) {
        throw new Error(`Circular dependency detected for store: ${storeName}`);
      }

      if (visited.has(storeName)) {
        return;
      }

      visiting.add(storeName);

      const dependency = this.dependencies[storeName];
      if (dependency) {
        // Visit required dependencies first
        dependency.requiredStores.forEach(depStore => visit(depStore));
      }

      visiting.delete(storeName);
      visited.add(storeName);
      result.push(storeName);
    };

    // Sort stores by priority first, then visit in order
    const sortedStores = Object.keys(this.dependencies).sort((a, b) => {
      const priorityA = this.dependencies[a].loadPriority;
      const priorityB = this.dependencies[b].loadPriority;
      return priorityA - priorityB;
    }) as StoreName[];

    sortedStores.forEach(storeName => visit(storeName));

    this.loadOrder = result;
  }

  getLoadOrder(): StoreName[] {
    return [...this.loadOrder];
  }

  getDependencies(storeName: StoreName): StoreDependency | undefined {
    return this.dependencies[storeName];
  }

  getRequiredStores(storeName: StoreName): StoreName[] {
    const dependency = this.dependencies[storeName];
    return dependency ? dependency.requiredStores : [];
  }

  getOptionalStores(storeName: StoreName): StoreName[] {
    const dependency = this.dependencies[storeName];
    return dependency ? dependency.optionalStores : [];
  }

  canLazyLoad(storeName: StoreName): boolean {
    const dependency = this.dependencies[storeName];
    return dependency ? dependency.canLazyLoad : false;
  }

  getLoadPriority(storeName: StoreName): number {
    const dependency = this.dependencies[storeName];
    return dependency ? dependency.loadPriority : 999;
  }

  getStoresByPriority(priority: number): StoreName[] {
    return Object.values(this.dependencies)
      .filter(dep => dep.loadPriority === priority)
      .map(dep => dep.storeName);
  }

  async loadStoreDependencies(
    storeName: StoreName,
    storeLoader: (name: StoreName) => Promise<void>
  ): Promise<void> {
    const dependency = this.dependencies[storeName];
    if (!dependency) {
      return;
    }

    // Load required dependencies in parallel
    const requiredPromises = dependency.requiredStores.map(async depStore => {
      if (!this.loadPromises.has(depStore)) {
        this.loadPromises.set(depStore, storeLoader(depStore));
      }
      return this.loadPromises.get(depStore)!;
    });

    await Promise.all(requiredPromises);

    // Load optional dependencies in background (don't wait)
    dependency.optionalStores.forEach(async depStore => {
      if (!this.loadPromises.has(depStore)) {
        this.loadPromises.set(depStore, storeLoader(depStore));
      }
    });
  }

  validateDependencies(): string[] {
    const errors: string[] = [];

    for (const [storeName, dependency] of Object.entries(this.dependencies)) {
      // Check for missing required dependencies
      dependency.requiredStores.forEach(depStore => {
        if (!this.dependencies[depStore]) {
          errors.push(`Store ${storeName} requires ${depStore} but it's not defined`);
        }
      });

      // Check for missing optional dependencies
      dependency.optionalStores.forEach(depStore => {
        if (!this.dependencies[depStore]) {
          errors.push(`Store ${storeName} optionally depends on ${depStore} but it's not defined`);
        }
      });
    }

    return errors;
  }

  getDependencyGraph(): DependencyGraph {
    return { ...this.dependencies };
  }

  clearLoadPromises() {
    this.loadPromises.clear();
  }

  // Generate a visual representation of the dependency graph
  generateDependencyReport(): string {
    const lines: string[] = [];
    lines.push('Store Dependency Report');
    lines.push('======================');
    lines.push('');

    // Group by priority
    const priorityGroups: Record<number, StoreName[]> = {};
    Object.values(this.dependencies).forEach(dep => {
      if (!priorityGroups[dep.loadPriority]) {
        priorityGroups[dep.loadPriority] = [];
      }
      priorityGroups[dep.loadPriority].push(dep.storeName);
    });

    Object.entries(priorityGroups)
      .sort(([a], [b]) => Number(a) - Number(b))
      .forEach(([priority, stores]) => {
        lines.push(`Priority ${priority} (${stores.length} stores):`);
        stores.forEach(storeName => {
          const dep = this.dependencies[storeName];
          lines.push(`  ${storeName} ${dep.canLazyLoad ? '(lazy)' : '(eager)'}`);
          if (dep.requiredStores.length > 0) {
            lines.push(`    Required: ${dep.requiredStores.join(', ')}`);
          }
          if (dep.optionalStores.length > 0) {
            lines.push(`    Optional: ${dep.optionalStores.join(', ')}`);
          }
        });
        lines.push('');
      });

    lines.push('Load Order:');
    lines.push(this.loadOrder.join(' → '));

    return lines.join('\n');
  }
}

// Global instance
export const storeDependencyManager = new StoreDependencyManager();
