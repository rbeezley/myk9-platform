/**
 * Artillery.js Load Test Processor
 * Custom functions for myK9Show load testing scenarios
 */

const { faker } = require('@faker-js/faker');

// Performance measurement tracking
const performanceMetrics = {
  databaseQueries: [],
  searchRequests: [],
  authRequests: [],
  entryCreations: [],
  websocketConnections: [],
};

// Test data generation
function generateTestUser(context, ee, next) {
  context.vars.user_email = faker.internet.email();
  context.vars.user_password = 'test123';
  context.vars.dog_name = faker.person.firstName();
  context.vars.show_id = faker.string.uuid();
  context.vars.entry_class = faker.helpers.arrayElement([
    'Novice A',
    'Novice B',
    'Open A',
    'Open B',
    'Excellent A',
    'Excellent B',
  ]);

  return next();
}

// Authentication header setup
function setAuthHeaders(requestParams, context, ee, next) {
  requestParams.headers = requestParams.headers || {};
  requestParams.headers['Content-Type'] = 'application/json';
  requestParams.headers['Accept'] = 'application/json';
  requestParams.headers['User-Agent'] = faker.internet.userAgent();

  return next();
}

// Database query performance measurement
function measureDatabaseQuery(requestParams, context, ee, next) {
  context.vars.dbQueryStart = Date.now();
  return next();
}

function recordDatabaseQuery(requestParams, response, context, ee, next) {
  if (context.vars.dbQueryStart) {
    const duration = Date.now() - context.vars.dbQueryStart;
    performanceMetrics.databaseQueries.push(duration);

    // Emit custom metric
    ee.emit('customStat', 'database_query_time', duration);

    // Log slow queries
    if (duration > 1000) {
      console.log(`⚠️ Slow database query detected: ${duration}ms`);
    }
  }
  return next();
}

// Search performance measurement
function measureSearchTime(requestParams, context, ee, next) {
  context.vars.searchStart = Date.now();
  return next();
}

function recordSearchTime(requestParams, response, context, ee, next) {
  if (context.vars.searchStart) {
    const duration = Date.now() - context.vars.searchStart;
    performanceMetrics.searchRequests.push(duration);

    ee.emit('customStat', 'search_response_time', duration);

    // Validate search response
    if (response.statusCode === 200) {
      try {
        const data = JSON.parse(response.body);
        if (!Array.isArray(data)) {
          console.log('⚠️ Invalid search response format');
        }
      } catch (error) {
        console.log('⚠️ Search response parsing error:', error.message);
      }
    }
  }
  return next();
}

// Authentication performance measurement
function measureAuthTime(requestParams, context, ee, next) {
  context.vars.authStart = Date.now();
  return next();
}

function recordAuthTime(requestParams, response, context, ee, next) {
  if (context.vars.authStart) {
    const duration = Date.now() - context.vars.authStart;
    performanceMetrics.authRequests.push(duration);

    ee.emit('customStat', 'auth_response_time', duration);

    // Check for successful authentication
    if (response.statusCode === 200) {
      try {
        const data = JSON.parse(response.body);
        if (data.access_token) {
          context.vars.authToken = data.access_token;
        }
      } catch (error) {
        console.log('⚠️ Auth response parsing error:', error.message);
      }
    }
  }
  return next();
}

// Entry creation performance measurement
function measureEntryCreation(requestParams, context, ee, next) {
  context.vars.entryStart = Date.now();

  // Enhance entry data with realistic information
  if (requestParams.json) {
    requestParams.json.confirmationNumber = `CONF${faker.number.int({ min: 1000, max: 9999 })}`;
    requestParams.json.createdAt = new Date().toISOString();
    requestParams.json.paymentAmount = faker.number.int({ min: 25, max: 50 });
  }

  return next();
}

function recordEntryCreation(requestParams, response, context, ee, next) {
  if (context.vars.entryStart) {
    const duration = Date.now() - context.vars.entryStart;
    performanceMetrics.entryCreations.push(duration);

    ee.emit('customStat', 'entry_creation_time', duration);

    // Track entry creation success rate
    if (response.statusCode === 201) {
      ee.emit('customStat', 'entry_creation_success', 1);
    } else {
      ee.emit('customStat', 'entry_creation_failure', 1);
      console.log(`⚠️ Entry creation failed: ${response.statusCode} ${response.statusMessage}`);
    }
  }
  return next();
}

// WebSocket connection performance measurement
function measureWebSocketConnection(context, ee, next) {
  context.vars.wsStart = Date.now();
  return next();
}

function recordWebSocketConnection(context, ee, next) {
  if (context.vars.wsStart) {
    const duration = Date.now() - context.vars.wsStart;
    performanceMetrics.websocketConnections.push(duration);

    ee.emit('customStat', 'websocket_connection_time', duration);

    if (duration > 1000) {
      console.log(`⚠️ Slow WebSocket connection: ${duration}ms`);
    }
  }
  return next();
}

// Error handling and logging
function handleError(requestParams, response, context, ee, next) {
  if (response.statusCode >= 400) {
    console.log(
      `❌ Request failed: ${requestParams.url} - ${response.statusCode} ${response.statusMessage}`
    );

    // Log specific error details
    if (response.body) {
      try {
        const errorData = JSON.parse(response.body);
        console.log('Error details:', errorData);
      } catch (error) {
        console.log('Error body:', response.body.substring(0, 200));
      }
    }
  }
  return next();
}

// Data validation functions
function validateShowData(requestParams, response, context, ee, next) {
  if (response.statusCode === 200) {
    try {
      const shows = JSON.parse(response.body);

      if (Array.isArray(shows)) {
        shows.forEach(show => {
          if (!show.id || !show.name || !show.organization) {
            console.log('⚠️ Invalid show data structure:', show);
          }
        });
      }
    } catch (error) {
      console.log('⚠️ Show data validation error:', error.message);
    }
  }
  return next();
}

function validateEntryData(requestParams, response, context, ee, next) {
  if (response.statusCode === 201) {
    try {
      const entry = JSON.parse(response.body);

      if (!entry.id || !entry.showId || !entry.dogId) {
        console.log('⚠️ Invalid entry data structure:', entry);
      }
    } catch (error) {
      console.log('⚠️ Entry data validation error:', error.message);
    }
  }
  return next();
}

// Performance reporting
function generatePerformanceReport() {
  const report = {
    timestamp: new Date().toISOString(),
    metrics: {},
  };

  // Calculate statistics for each metric type
  Object.entries(performanceMetrics).forEach(([key, values]) => {
    if (values.length > 0) {
      const sorted = [...values].sort((a, b) => a - b);

      report.metrics[key] = {
        count: values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
        p50: sorted[Math.floor(sorted.length * 0.5)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        p99: sorted[Math.floor(sorted.length * 0.99)],
      };
    }
  });

  return report;
}

// Realistic user behavior simulation
function simulateThinkTime(context, ee, next) {
  // Simulate realistic user think time based on action type
  const action = context.vars.currentAction || 'default';

  let thinkTime = 1000; // Default 1 second

  switch (action) {
    case 'browse':
      thinkTime = faker.number.int({ min: 2000, max: 5000 }); // 2-5 seconds browsing
      break;
    case 'search':
      thinkTime = faker.number.int({ min: 500, max: 2000 }); // 0.5-2 seconds for search
      break;
    case 'form_fill':
      thinkTime = faker.number.int({ min: 10000, max: 30000 }); // 10-30 seconds form filling
      break;
    case 'payment':
      thinkTime = faker.number.int({ min: 15000, max: 45000 }); // 15-45 seconds payment process
      break;
  }

  setTimeout(() => next(), thinkTime);
}

// Load balancer simulation
function setLoadBalancerHeaders(requestParams, context, ee, next) {
  requestParams.headers = requestParams.headers || {};

  // Simulate load balancer headers
  requestParams.headers['X-Forwarded-For'] = faker.internet.ip();
  requestParams.headers['X-Real-IP'] = faker.internet.ip();
  requestParams.headers['X-Request-ID'] = faker.string.uuid();

  return next();
}

// Cache control simulation
function setCacheHeaders(requestParams, context, ee, next) {
  requestParams.headers = requestParams.headers || {};

  // Simulate different cache behaviors
  const cacheType = faker.helpers.arrayElement(['no-cache', 'max-age=300', 'must-revalidate']);
  requestParams.headers['Cache-Control'] = cacheType;

  return next();
}

// Database connection pool simulation
let connectionCount = 0;
const maxConnections = 50;

function checkConnectionPool(context, ee, next) {
  connectionCount++;

  if (connectionCount > maxConnections) {
    console.log(`⚠️ Connection pool limit exceeded: ${connectionCount}/${maxConnections}`);
    ee.emit('customStat', 'connection_pool_exceeded', 1);
  }

  // Simulate connection cleanup
  setTimeout(
    () => {
      connectionCount--;
    },
    faker.number.int({ min: 1000, max: 10000 })
  );

  return next();
}

// Memory usage simulation
function trackMemoryUsage(context, ee, next) {
  const memoryUsage = process.memoryUsage();

  ee.emit('customStat', 'memory_heap_used', memoryUsage.heapUsed);
  ee.emit('customStat', 'memory_heap_total', memoryUsage.heapTotal);

  // Warn if memory usage is high
  const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
  if (heapUsedMB > 500) {
    console.log(`⚠️ High memory usage: ${heapUsedMB.toFixed(2)} MB`);
  }

  return next();
}

// Clean up function for test completion
function cleanup(context, ee, next) {
  // Generate final performance report
  const report = generatePerformanceReport();
  console.log('\n📊 Final Performance Report:');
  console.log(JSON.stringify(report, null, 2));

  // Save report to file
  const fs = require('fs');
  fs.writeFileSync('./artillery-performance-report.json', JSON.stringify(report, null, 2));

  return next();
}

module.exports = {
  generateTestUser,
  setAuthHeaders,
  measureDatabaseQuery,
  recordDatabaseQuery,
  measureSearchTime,
  recordSearchTime,
  measureAuthTime,
  recordAuthTime,
  measureEntryCreation,
  recordEntryCreation,
  measureWebSocketConnection,
  recordWebSocketConnection,
  handleError,
  validateShowData,
  validateEntryData,
  simulateThinkTime,
  setLoadBalancerHeaders,
  setCacheHeaders,
  checkConnectionPool,
  trackMemoryUsage,
  cleanup,
};
