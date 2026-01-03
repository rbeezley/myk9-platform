/**
 * API Batching Service for reducing HTTP requests
 * Combines multiple individual requests into batch operations
 */

interface BatchRequest {
  id: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: unknown;
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
}

interface BatchConfig {
  maxBatchSize: number;
  batchDelay: number;
  enableBatching: boolean;
}

export class ApiBatchingService {
  private pendingRequests = new Map<string, BatchRequest[]>();
  private batchTimeouts = new Map<string, NodeJS.Timeout>();
  private config: BatchConfig = {
    maxBatchSize: 10,
    batchDelay: 50, // 50ms delay to collect requests
    enableBatching: true,
  };

  constructor(config?: Partial<BatchConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  /**
   * Add a request to the batch queue
   */
  async batchRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    data?: unknown
  ): Promise<T> {
    if (!this.config.enableBatching) {
      return this.executeRequest(endpoint, method, data) as Promise<T>;
    }

    return new Promise<T>((resolve, reject) => {
      const requestId = `${method}:${endpoint}`;
      const batchKey = this.getBatchKey(endpoint, method);
      
      const request: BatchRequest = {
        id: requestId,
        endpoint,
        method,
        data,
        resolve: resolve as (data: unknown) => void,
        reject,
      };

      // Add to pending requests
      if (!this.pendingRequests.has(batchKey)) {
        this.pendingRequests.set(batchKey, []);
      }
      
      const batch = this.pendingRequests.get(batchKey)!;
      batch.push(request);

      // If batch is full, execute immediately
      if (batch.length >= this.config.maxBatchSize) {
        this.executeBatch(batchKey);
      } else {
        // Otherwise, schedule batch execution
        this.scheduleBatchExecution(batchKey);
      }
    });
  }

  /**
   * Get batch key for grouping similar requests
   */
  private getBatchKey(endpoint: string, method: string): string {
    // Group by base endpoint (remove IDs) and method
    const baseEndpoint = endpoint.replace(/\/\d+/g, '/{id}');
    return `${method}:${baseEndpoint}`;
  }

  /**
   * Schedule batch execution with delay
   */
  private scheduleBatchExecution(batchKey: string) {
    // Clear existing timeout
    if (this.batchTimeouts.has(batchKey)) {
      clearTimeout(this.batchTimeouts.get(batchKey)!);
    }

    // Schedule new execution
    const timeout = setTimeout(() => {
      this.executeBatch(batchKey);
    }, this.config.batchDelay);

    this.batchTimeouts.set(batchKey, timeout);
  }

  /**
   * Execute a batch of requests
   */
  private async executeBatch(batchKey: string) {
    const batch = this.pendingRequests.get(batchKey);
    if (!batch || batch.length === 0) return;

    // Clear timeout and pending requests
    if (this.batchTimeouts.has(batchKey)) {
      clearTimeout(this.batchTimeouts.get(batchKey)!);
      this.batchTimeouts.delete(batchKey);
    }
    this.pendingRequests.delete(batchKey);

    try {
      // Group requests by type for different batching strategies
      if (batch.every(req => req.method === 'GET')) {
        await this.executeBatchGet(batch);
      } else {
        // For mixed methods or non-GET requests, execute individually
        await this.executeIndividualRequests(batch);
      }
    } catch (error) {
      // Reject all requests in the batch
      batch.forEach(req => req.reject(error as Error));
    }
  }

  /**
   * Execute batch GET requests
   */
  private async executeBatchGet(batch: BatchRequest[]) {
    // Group by base endpoint
    const endpointGroups = new Map<string, BatchRequest[]>();
    
    batch.forEach(req => {
      const baseEndpoint = req.endpoint.split('/')[1]; // Get base resource
      if (!endpointGroups.has(baseEndpoint)) {
        endpointGroups.set(baseEndpoint, []);
      }
      endpointGroups.get(baseEndpoint)!.push(req);
    });

    // Execute each group
    for (const [baseEndpoint, requests] of endpointGroups) {
      await this.executeBatchGetGroup(baseEndpoint, requests);
    }
  }

  /**
   * Execute a group of GET requests for the same resource type
   */
  private async executeBatchGetGroup(baseEndpoint: string, requests: BatchRequest[]) {
    // Extract IDs from endpoints
    const ids = requests.map(req => {
      const match = req.endpoint.match(/\/(\d+)$/);
      return match ? match[1] : null;
    }).filter(Boolean);

    if (ids.length === 0) {
      // No IDs found, execute individually
      await this.executeIndividualRequests(requests);
      return;
    }

    try {
      // Make batch request
      const batchEndpoint = `/api/${baseEndpoint}/batch?ids=${ids.join(',')}`;
      const batchResponse = await this.executeRequest(batchEndpoint, 'GET');

      // Distribute results to individual requests
      requests.forEach(req => {
        const id = req.endpoint.match(/\/(\d+)$/)?.[1];
        const response = batchResponse as Record<string, unknown>;
        if (id && response[id]) {
          req.resolve(response[id]);
        } else {
          req.reject(new Error(`No data found for ${req.endpoint}`));
        }
      });
    } catch {
      // If batch request fails, fallback to individual requests
      await this.executeIndividualRequests(requests);
    }
  }

  /**
   * Execute requests individually as fallback
   */
  private async executeIndividualRequests(requests: BatchRequest[]) {
    await Promise.allSettled(
      requests.map(async req => {
        try {
          const result = await this.executeRequest(req.endpoint, req.method, req.data);
          req.resolve(result);
        } catch (error) {
          req.reject(error as Error);
        }
      })
    );
  }

  /**
   * Execute a single HTTP request
   */
  private async executeRequest(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    data?: unknown
  ): Promise<unknown> {
    const url = endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`;
    
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (data && method !== 'GET') {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Update batching configuration
   */
  updateConfig(config: Partial<BatchConfig>) {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current batching statistics
   */
  getStats() {
    return {
      pendingBatches: this.pendingRequests.size,
      pendingRequests: Array.from(this.pendingRequests.values())
        .reduce((total, batch) => total + batch.length, 0),
      config: this.config,
    };
  }

  /**
   * Clear all pending requests (for testing or cleanup)
   */
  clearPending() {
    // Reject all pending requests
    for (const batch of this.pendingRequests.values()) {
      batch.forEach(req => 
        req.reject(new Error('Batch service cleared'))
      );
    }

    // Clear timeouts
    for (const timeout of this.batchTimeouts.values()) {
      clearTimeout(timeout);
    }

    this.pendingRequests.clear();
    this.batchTimeouts.clear();
  }
}

// Export singleton instance
export const apiBatchingService = new ApiBatchingService();

// Export convenience functions
export const batchGet = <T>(endpoint: string): Promise<T> => 
  apiBatchingService.batchRequest<T>(endpoint, 'GET');

export const batchPost = <T>(endpoint: string, data: unknown): Promise<T> => 
  apiBatchingService.batchRequest<T>(endpoint, 'POST', data);

export const batchPut = <T>(endpoint: string, data: unknown): Promise<T> => 
  apiBatchingService.batchRequest<T>(endpoint, 'PUT', data);

export const batchDelete = <T>(endpoint: string): Promise<T> => 
  apiBatchingService.batchRequest<T>(endpoint, 'DELETE');

export default ApiBatchingService;