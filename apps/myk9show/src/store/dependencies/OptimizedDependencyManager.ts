import { StoreName } from '@/store/store-categories';

interface StoreDependency {
  storeName: StoreName;
  requiredStores: StoreName[];
  optionalStores: StoreName[];
  loadPriority: number;
  canLazyLoad: boolean;
  parallelGroup?: string; // New: Group for parallel loading
}

interface LoadGroup {
  groupName: string;
  stores: StoreName[];
  priority: number;
  canLoadInParallel: boolean;
}

export class OptimizedDependencyManager {
  private dependencies: Record<string, StoreDependency> = {};
  private loadGroups: LoadGroup[] = [];
  private loadPromises: Map<StoreName, Promise<void>> = new Map();
  private loadedStores: Set<StoreName> = new Set();
  
  constructor() {
    this.initializeDependencies();
    this.generateLoadGroups();
  }
  
  private initializeDependencies() {
    // Core entity stores (no dependencies) - can load in parallel
    this.addDependency('userStore', {
      requiredStores: [],
      optionalStores: [],
      loadPriority: 1,
      canLazyLoad: false,
      parallelGroup: 'critical-core',
    });
    
    this.addDependency('clubStore', {
      requiredStores: [],
      optionalStores: [],
      loadPriority: 1,
      canLazyLoad: false,
      parallelGroup: 'critical-core',
    });
    
    // Secondary critical stores - can load in parallel after core
    this.addDependency('dogStore', {
      requiredStores: ['userStore'],
      optionalStores: [],
      loadPriority: 2,
      canLazyLoad: false,
      parallelGroup: 'critical-secondary',
    });
    
    this.addDependency('showStore', {
      requiredStores: ['clubStore'],
      optionalStores: ['userStore'],
      loadPriority: 2,
      canLazyLoad: false,
      parallelGroup: 'critical-secondary',
    });
    
    // Important stores - can load in parallel
    this.addDependency('navigationStore', {
      requiredStores: [],
      optionalStores: [],
      loadPriority: 3,
      canLazyLoad: true,
      parallelGroup: 'important-independent',
    });
    
    this.addDependency('syncStore', {
      requiredStores: [],
      optionalStores: [],
      loadPriority: 3,
      canLazyLoad: true,
      parallelGroup: 'important-independent',
    });
    
    this.addDependency('searchHistoryStore', {
      requiredStores: [],
      optionalStores: [],
      loadPriority: 3,
      canLazyLoad: true,
      parallelGroup: 'important-independent',
    });
    
    // Entry management stores - dependent group
    this.addDependency('entryStore', {
      requiredStores: ['dogStore', 'showStore'],
      optionalStores: ['userStore'],
      loadPriority: 4,
      canLazyLoad: true,
      parallelGroup: 'entry-dependent',
    });
    
    this.addDependency('registrationsStore', {
      requiredStores: ['entryStore'],
      optionalStores: [],
      loadPriority: 5,
      canLazyLoad: true,
      parallelGroup: 'entry-secondary',
    });
    
    // Template stores - can load in parallel
    this.addDependency('templateStore', {
      requiredStores: [],
      optionalStores: [],
      loadPriority: 6,
      canLazyLoad: true,
      parallelGroup: 'template-core',
    });
    
    this.addDependency('classTemplateStore', {
      requiredStores: ['templateStore'],
      optionalStores: [],
      loadPriority: 7,
      canLazyLoad: true,
      parallelGroup: 'template-secondary',
    });
    
    this.addDependency('showTemplateStore', {
      requiredStores: ['templateStore'],
      optionalStores: [],
      loadPriority: 7,
      canLazyLoad: true,
      parallelGroup: 'template-secondary',
    });
    
    // Class and trial stores - can load in parallel
    this.addDependency('classStore', {
      requiredStores: ['showStore'],
      optionalStores: ['templateStore', 'classTemplateStore'],
      loadPriority: 8,
      canLazyLoad: true,
      parallelGroup: 'class-trial',
    });
    
    this.addDependency('trialStore', {
      requiredStores: ['showStore'],
      optionalStores: ['classStore'],
      loadPriority: 8,
      canLazyLoad: true,
      parallelGroup: 'class-trial',
    });
    
    // Workflow stores - mixed dependencies
    this.addDependency('classCreationStore', {
      requiredStores: ['classStore', 'templateStore'],
      optionalStores: ['classTemplateStore'],
      loadPriority: 9,
      canLazyLoad: true,
      parallelGroup: 'workflow',
    });
    
    this.addDependency('showRegistrationStore', {
      requiredStores: ['showStore', 'entryStore'],
      optionalStores: ['registrationsStore'],
      loadPriority: 9,
      canLazyLoad: true,
      parallelGroup: 'workflow',
    });
    
    this.addDependency('wizardStore', {
      requiredStores: [],
      optionalStores: ['showStore', 'classStore'],
      loadPriority: 9,
      canLazyLoad: true,
      parallelGroup: 'workflow',
    });
    
    // Competition stores - sequential due to dependencies
    this.addDependency('competitionStore', {
      requiredStores: ['entryStore', 'classStore'],
      optionalStores: [],
      loadPriority: 10,
      canLazyLoad: true,
      parallelGroup: 'competition',
    });
    
    this.addDependency('offlineScoringStore', {
      requiredStores: ['competitionStore'],
      optionalStores: [],
      loadPriority: 11,
      canLazyLoad: true,
      parallelGroup: 'competition-secondary',
    });
    
    this.addDependency('pastResultsStore', {
      requiredStores: ['competitionStore'],
      optionalStores: [],
      loadPriority: 11,
      canLazyLoad: true,
      parallelGroup: 'competition-secondary',
    });
    
    // Utility stores - can load in parallel
    this.addDependency('armbandStore', {
      requiredStores: ['entryStore', 'classStore'],
      optionalStores: [],
      loadPriority: 12,
      canLazyLoad: true,
      parallelGroup: 'utility',
    });
    
    this.addDependency('achievementsStore', {
      requiredStores: ['dogStore'],
      optionalStores: ['competitionStore'],
      loadPriority: 12,
      canLazyLoad: true,
      parallelGroup: 'utility',
    });
    
    this.addDependency('draftStore', {
      requiredStores: [],
      optionalStores: ['showStore', 'classStore'],
      loadPriority: 12,
      canLazyLoad: true,
      parallelGroup: 'utility',
    });
    
    this.addDependency('searchAnalyticsStore', {
      requiredStores: ['searchHistoryStore'],
      optionalStores: [],
      loadPriority: 12,
      canLazyLoad: true,
      parallelGroup: 'utility',
    });
    
    // UI stores - can load in parallel
    this.addDependency('dogSidebarStore', {
      requiredStores: ['dogStore'],
      optionalStores: [],
      loadPriority: 13,
      canLazyLoad: true,
      parallelGroup: 'ui',
    });
    
    this.addDependency('userSidebarStore', {
      requiredStores: ['userStore'],
      optionalStores: [],
      loadPriority: 13,
      canLazyLoad: true,
      parallelGroup: 'ui',
    });
  }
  
  private addDependency(storeName: StoreName, config: Omit<StoreDependency, 'storeName'>) {
    this.dependencies[storeName] = {
      storeName,
      ...config,
    };
  }
  
  private generateLoadGroups() {
    // Group stores by their parallel group and priority
    const groupMap = new Map<string, StoreName[]>();
    const priorityMap = new Map<string, number>();
    
    Object.values(this.dependencies).forEach(dep => {
      const group = dep.parallelGroup || 'default';
      
      if (!groupMap.has(group)) {
        groupMap.set(group, []);
        priorityMap.set(group, dep.loadPriority);
      }
      
      groupMap.get(group)!.push(dep.storeName);
    });
    
    // Create load groups
    this.loadGroups = Array.from(groupMap.entries()).map(([groupName, stores]) => ({
      groupName,
      stores,
      priority: priorityMap.get(groupName)!,
      canLoadInParallel: stores.length > 1,
    }));
    
    // Sort by priority
    this.loadGroups.sort((a, b) => a.priority - b.priority);
  }
  
  async loadStoreDependencies(storeName: StoreName, storeLoader: (name: StoreName) => Promise<void>): Promise<void> {
    const dependency = this.dependencies[storeName];
    if (!dependency) {
      return;
    }
    
    // Load required dependencies first (in parallel where possible)
    if (dependency.requiredStores.length > 0) {
      await Promise.all(dependency.requiredStores.map(async (depStore) => {
        if (!this.loadPromises.has(depStore)) {
          this.loadPromises.set(depStore, storeLoader(depStore));
        }
        return this.loadPromises.get(depStore)!;
      }));
    }
    
    // Load optional dependencies in background (don't wait)
    dependency.optionalStores.forEach(async (depStore) => {
      if (!this.loadPromises.has(depStore)) {
        this.loadPromises.set(depStore, storeLoader(depStore));
      }
    });
  }
  
  async loadStoreGroup(groupName: string, storeLoader: (name: StoreName) => Promise<void>): Promise<void> {
    const group = this.loadGroups.find(g => g.groupName === groupName);
    if (!group) {
      throw new Error(`Unknown store group: ${groupName}`);
    }
    
    
    // Load all stores in the group in parallel
    const loadPromises = group.stores.map(async (storeName) => {
      if (!this.loadPromises.has(storeName)) {
        // First load dependencies
        await this.loadStoreDependencies(storeName, storeLoader);
        
        // Then load the store itself
        this.loadPromises.set(storeName, storeLoader(storeName));
      }
      return this.loadPromises.get(storeName)!;
    });
    
    await Promise.all(loadPromises);
    
    // Mark all stores in group as loaded
    group.stores.forEach(storeName => {
      this.loadedStores.add(storeName);
    });
    
  }

  async loadStoresByPriority(priority: number, storeLoader: (name: StoreName) => Promise<void>): Promise<void> {
    const groups = this.loadGroups.filter(g => g.priority === priority);

    if (groups.length === 0) {
      return;
    }
    
    // Load all groups at this priority level in parallel
    await Promise.all(groups.map(group => this.loadStoreGroup(group.groupName, storeLoader)));
  }

  async loadCriticalStores(storeLoader: (name: StoreName) => Promise<void>): Promise<void> {
    // Load priority 1 and 2 stores (critical)
    await this.loadStoresByPriority(1, storeLoader);
    await this.loadStoresByPriority(2, storeLoader);
  }

  async loadImportantStores(storeLoader: (name: StoreName) => Promise<void>): Promise<void> {
    // Load priority 3 and 4 stores (important)
    await this.loadStoresByPriority(3, storeLoader);
    await this.loadStoresByPriority(4, storeLoader);
  }
  
  getLoadGroups(): LoadGroup[] {
    return [...this.loadGroups];
  }
  
  getDependencies(storeName: StoreName): StoreDependency | undefined {
    return this.dependencies[storeName];
  }
  
  isStoreLoaded(storeName: StoreName): boolean {
    return this.loadedStores.has(storeName);
  }
  
  clearLoadPromises() {
    this.loadPromises.clear();
    this.loadedStores.clear();
  }
  
  generateOptimizedLoadReport(): string {
    const lines: string[] = [];
    lines.push('🔍 Optimized Store Dependency Report');
    lines.push('=' .repeat(50));
    lines.push('');
    
    // Group summary
    lines.push('📊 Load Groups:');
    this.loadGroups.forEach(group => {
      lines.push(`  Priority ${group.priority} - ${group.groupName} (${group.stores.length} stores)`);
      lines.push(`    Parallel: ${group.canLoadInParallel ? 'Yes' : 'No'}`);
      lines.push(`    Stores: ${group.stores.join(', ')}`);
      lines.push('');
    });
    
    // Load order optimization
    lines.push('⚡ Optimized Load Order:');
    this.loadGroups.forEach(group => {
      lines.push(`  ${group.priority}. ${group.groupName} → [${group.stores.join(', ')}]`);
    });
    
    lines.push('');
    lines.push('🎯 Performance Benefits:');
    lines.push('  • Parallel loading within groups reduces sequential bottlenecks');
    lines.push('  • Dependency resolution prevents unnecessary blocking');
    lines.push('  • Priority-based loading ensures critical stores load first');
    lines.push('  • Optional dependencies load in background');
    
    return lines.join('\n');
  }
}

// Global instance
export const optimizedDependencyManager = new OptimizedDependencyManager();