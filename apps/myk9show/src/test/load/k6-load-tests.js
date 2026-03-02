/**
 * k6 Load Testing Scripts for myK9Show Application
 *
 * Professional load testing using k6 for:
 * - HTTP API load testing
 * - Real-time WebSocket testing
 * - Performance monitoring
 * - Realistic user behavior simulation
 */

import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';

// Custom metrics
const apiResponseTime = new Trend('api_response_time');
const apiErrorRate = new Rate('api_error_rate');
const wsConnectionTime = new Trend('ws_connection_time');
const wsMessageLatency = new Trend('ws_message_latency');
const databaseQueryTime = new Trend('database_query_time');
const totalRequests = new Counter('total_requests');
const successfulRequests = new Counter('successful_requests');

// Performance targets
const PERFORMANCE_TARGETS = {
  api_response_p95: 200, // ms
  api_error_rate: 0.05, // 5%
  ws_connection_time: 500, // ms
  database_query_p95: 1000, // ms
  throughput_min: 100, // requests/second
};

// Test data
const testData = new SharedArray('test_data', function () {
  return JSON.parse(open('./test-data.json'));
});

// Base configuration
export const options = {
  scenarios: {
    // Normal load scenario
    normal_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 }, // Ramp up to 50 users
        { duration: '5m', target: 50 }, // Stay at 50 users
        { duration: '2m', target: 100 }, // Ramp up to 100 users
        { duration: '10m', target: 100 }, // Stay at 100 users
        { duration: '2m', target: 0 }, // Ramp down
      ],
      gracefulRampDown: '30s',
    },

    // Peak entry load (simulates show entry opening)
    peak_entry_load: {
      executor: 'ramping-arrival-rate',
      startRate: 50,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 300,
      stages: [
        { duration: '2m', target: 50 }, // Normal rate
        { duration: '1m', target: 200 }, // Sudden spike
        { duration: '5m', target: 200 }, // Sustained peak
        { duration: '1m', target: 50 }, // Return to normal
        { duration: '1m', target: 0 }, // End
      ],
    },

    // Stress test scenario
    stress_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },
        { duration: '5m', target: 200 },
        { duration: '5m', target: 300 },
        { duration: '5m', target: 400 },
        { duration: '5m', target: 500 }, // Stress point
        { duration: '2m', target: 0 },
      ],
    },

    // Database-focused scenario
    database_load: {
      executor: 'constant-vus',
      vus: 75,
      duration: '10m',
    },

    // Real-time features scenario
    realtime_load: {
      executor: 'constant-vus',
      vus: 30,
      duration: '5m',
    },
  },

  thresholds: {
    // HTTP metrics
    http_req_duration: [`p(95)<${PERFORMANCE_TARGETS.api_response_p95}`],
    http_req_failed: [`rate<${PERFORMANCE_TARGETS.api_error_rate}`],

    // Custom metrics
    api_response_time: [`p(95)<${PERFORMANCE_TARGETS.api_response_p95}`],
    api_error_rate: [`rate<${PERFORMANCE_TARGETS.api_error_rate}`],
    ws_connection_time: [`p(95)<${PERFORMANCE_TARGETS.ws_connection_time}`],
    database_query_time: [`p(95)<${PERFORMANCE_TARGETS.database_query_p95}`],

    // Throughput
    http_reqs: [`rate>${PERFORMANCE_TARGETS.throughput_min}`],
  },
};

// Environment configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:5173';
const API_URL = __ENV.API_URL || 'http://localhost:54321';
const WS_URL = __ENV.WS_URL || 'ws://localhost:54321/realtime/v1/websocket';

// Authentication tokens (would be loaded from test setup)
const AUTH_TOKENS = {
  exhibitor: __ENV.EXHIBITOR_TOKEN || 'test-exhibitor-token',
  secretary: __ENV.SECRETARY_TOKEN || 'test-secretary-token',
  judge: __ENV.JUDGE_TOKEN || 'test-judge-token',
  admin: __ENV.ADMIN_TOKEN || 'test-admin-token',
};

// User behavior patterns
const USER_PATTERNS = {
  exhibitor: {
    weights: {
      browse_shows: 40,
      manage_entries: 30,
      manage_dogs: 15,
      view_results: 15,
    },
  },
  secretary: {
    weights: {
      manage_entries: 50,
      create_shows: 20,
      manage_classes: 20,
      reports: 10,
    },
  },
  judge: {
    weights: {
      view_assignments: 40,
      judge_classes: 35,
      enter_scores: 25,
    },
  },
};

export function setup() {
  console.log('🚀 Starting myK9Show Load Tests');
  console.log(`📊 Base URL: ${BASE_URL}`);
  console.log(`🗄️ API URL: ${API_URL}`);
  console.log(`🔌 WebSocket URL: ${WS_URL}`);

  // Verify application is running
  const response = http.get(`${BASE_URL}/health`);
  check(response, {
    'application is running': r => r.status === 200,
  });

  return {
    baseUrl: BASE_URL,
    apiUrl: API_URL,
    wsUrl: WS_URL,
  };
}

export default function (data) {
  const userType = selectUserType();
  const authToken = AUTH_TOKENS[userType];

  // Set up common headers
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
    Accept: 'application/json',
  };

  group('User Session', function () {
    // Simulate user login flow
    simulateLogin(userType, headers);

    // Execute user-specific workflows
    executeUserWorkflows(userType, headers, data);

    // Random think time between actions
    sleep(Math.random() * 3 + 1);
  });
}

function selectUserType() {
  const weights = [
    { type: 'exhibitor', weight: 0.7 },
    { type: 'secretary', weight: 0.15 },
    { type: 'judge', weight: 0.1 },
    { type: 'admin', weight: 0.05 },
  ];

  const random = Math.random();
  let cumulative = 0;

  for (const { type, weight } of weights) {
    cumulative += weight;
    if (random <= cumulative) {
      return type;
    }
  }

  return 'exhibitor';
}

function simulateLogin(userType, headers) {
  group('Authentication', function () {
    const loginPayload = {
      email: `${userType}@test.com`,
      password: 'test123',
    };

    const startTime = Date.now();
    const response = http.post(
      `${API_URL}/auth/v1/token?grant_type=password`,
      JSON.stringify(loginPayload),
      { headers }
    );
    const responseTime = Date.now() - startTime;

    totalRequests.add(1);
    apiResponseTime.add(responseTime);

    const success = check(response, {
      'login successful': r => r.status === 200,
      'response time < 2s': r => responseTime < 2000,
    });

    if (success) {
      successfulRequests.add(1);
    } else {
      apiErrorRate.add(1);
    }
  });
}

function executeUserWorkflows(userType, headers, data) {
  const pattern = USER_PATTERNS[userType];
  const workflow = selectWeightedWorkflow(pattern.weights);

  switch (workflow) {
    case 'browse_shows':
      browsShows(headers);
      break;
    case 'manage_entries':
      manageEntries(headers);
      break;
    case 'manage_dogs':
      manageDogs(headers);
      break;
    case 'view_results':
      viewResults(headers);
      break;
    case 'create_shows':
      createShows(headers);
      break;
    case 'manage_classes':
      manageClasses(headers);
      break;
    case 'view_assignments':
      viewAssignments(headers);
      break;
    case 'judge_classes':
      judgeClasses(headers);
      break;
    case 'enter_scores':
      enterScores(headers);
      break;
    case 'reports':
      generateReports(headers);
      break;
  }
}

function selectWeightedWorkflow(weights) {
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  const random = Math.random() * total;

  let cumulative = 0;
  for (const [workflow, weight] of Object.entries(weights)) {
    cumulative += weight;
    if (random <= cumulative) {
      return workflow;
    }
  }

  return Object.keys(weights)[0];
}

// Workflow implementations
function browsShows(headers) {
  group('Browse Shows', function () {
    // Load shows list
    const startTime = Date.now();
    const response = http.get(`${API_URL}/rest/v1/show?select=*`, { headers });
    const responseTime = Date.now() - startTime;

    totalRequests.add(1);
    apiResponseTime.add(responseTime);
    databaseQueryTime.add(responseTime);

    const success = check(response, {
      'shows loaded': r => r.status === 200,
      'response time acceptable': () => responseTime < PERFORMANCE_TARGETS.api_response_p95,
      'shows data present': r => JSON.parse(r.body).length > 0,
    });

    if (success) {
      successfulRequests.add(1);
    } else {
      apiErrorRate.add(1);
    }

    sleep(1);

    // Search shows
    const searchTerm = ['agility', 'obedience', 'rally'][Math.floor(Math.random() * 3)];
    const searchStart = Date.now();
    const searchResponse = http.get(
      `${API_URL}/rest/v1/show?select=*&or=(name.ilike.%25${searchTerm}%25,type.ilike.%25${searchTerm}%25)`,
      { headers }
    );
    const searchTime = Date.now() - searchStart;

    totalRequests.add(1);
    apiResponseTime.add(searchTime);

    check(searchResponse, {
      'search successful': r => r.status === 200,
      'search response time': () => searchTime < 300,
    });

    sleep(2);

    // View show details
    const shows = JSON.parse(response.body);
    if (shows.length > 0) {
      const randomShow = shows[Math.floor(Math.random() * shows.length)];
      const detailStart = Date.now();
      const detailResponse = http.get(`${API_URL}/rest/v1/show?select=*&id=eq.${randomShow.id}`, {
        headers,
      });
      const detailTime = Date.now() - detailStart;

      totalRequests.add(1);
      apiResponseTime.add(detailTime);

      check(detailResponse, {
        'show details loaded': r => r.status === 200,
        'detail response time': () => detailTime < PERFORMANCE_TARGETS.api_response_p95,
      });
    }
  });
}

function manageEntries(headers) {
  group('Manage Entries', function () {
    // Get user's entries
    const startTime = Date.now();
    const response = http.get(`${API_URL}/rest/v1/entry?select=*`, { headers });
    const responseTime = Date.now() - startTime;

    totalRequests.add(1);
    apiResponseTime.add(responseTime);
    databaseQueryTime.add(responseTime);

    check(response, {
      'entries loaded': r => r.status === 200,
      'entries response time': () => responseTime < PERFORMANCE_TARGETS.api_response_p95,
    });

    sleep(1);

    // Create new entry (simulation)
    const entryData = {
      show_id: 'test-show-id',
      dog_id: 'test-dog-id',
      classes: ['Open A'],
      status: 'pending',
    };

    const createStart = Date.now();
    const createResponse = http.post(`${API_URL}/rest/v1/entry`, JSON.stringify(entryData), {
      headers,
    });
    const createTime = Date.now() - createStart;

    totalRequests.add(1);
    apiResponseTime.add(createTime);

    const createSuccess = check(createResponse, {
      'entry created': r => r.status === 201,
      'create response time': () => createTime < PERFORMANCE_TARGETS.api_response_p95 * 2,
    });

    if (createSuccess) {
      successfulRequests.add(1);
    } else {
      apiErrorRate.add(1);
    }
  });
}

function manageDogs(headers) {
  group('Manage Dogs', function () {
    // Load user's dogs
    const startTime = Date.now();
    const response = http.get(`${API_URL}/rest/v1/dog?select=*`, { headers });
    const responseTime = Date.now() - startTime;

    totalRequests.add(1);
    apiResponseTime.add(responseTime);
    databaseQueryTime.add(responseTime);

    check(response, {
      'dogs loaded': r => r.status === 200,
      'dogs response time': () => responseTime < PERFORMANCE_TARGETS.api_response_p95,
    });

    sleep(2);

    // Update dog information
    const dogs = JSON.parse(response.body);
    if (dogs.length > 0) {
      const randomDog = dogs[Math.floor(Math.random() * dogs.length)];
      const updateData = {
        weight: Math.floor(Math.random() * 30) + 20,
        updated_at: new Date().toISOString(),
      };

      const updateStart = Date.now();
      const updateResponse = http.patch(
        `${API_URL}/rest/v1/dog?id=eq.${randomDog.id}`,
        JSON.stringify(updateData),
        { headers }
      );
      const updateTime = Date.now() - updateStart;

      totalRequests.add(1);
      apiResponseTime.add(updateTime);

      check(updateResponse, {
        'dog updated': r => r.status === 204,
        'update response time': () => updateTime < PERFORMANCE_TARGETS.api_response_p95,
      });
    }
  });
}

function viewResults(headers) {
  group('View Results', function () {
    // Load recent results
    const startTime = Date.now();
    const response = http.get(`${API_URL}/rest/v1/result?select=*&order=created_at.desc&limit=20`, {
      headers,
    });
    const responseTime = Date.now() - startTime;

    totalRequests.add(1);
    apiResponseTime.add(responseTime);
    databaseQueryTime.add(responseTime);

    check(response, {
      'results loaded': r => r.status === 200,
      'results response time': () => responseTime < PERFORMANCE_TARGETS.api_response_p95,
    });
  });
}

function createShows(headers) {
  group('Create Shows (Secretary)', function () {
    const showData = {
      name: `Test Show ${Math.random().toString(36).substr(2, 9)}`,
      organization: 'Agility',
      start_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      end_date: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString(),
      location: 'Test Location',
      status: 'Draft',
    };

    const startTime = Date.now();
    const response = http.post(`${API_URL}/rest/v1/show`, JSON.stringify(showData), { headers });
    const responseTime = Date.now() - startTime;

    totalRequests.add(1);
    apiResponseTime.add(responseTime);

    const success = check(response, {
      'show created': r => r.status === 201,
      'create show response time': () => responseTime < PERFORMANCE_TARGETS.api_response_p95 * 2,
    });

    if (success) {
      successfulRequests.add(1);
    } else {
      apiErrorRate.add(1);
    }
  });
}

function manageClasses(headers) {
  group('Manage Classes (Secretary)', function () {
    // Load classes for a show
    const startTime = Date.now();
    const response = http.get(`${API_URL}/rest/v1/class?select=*`, { headers });
    const responseTime = Date.now() - startTime;

    totalRequests.add(1);
    apiResponseTime.add(responseTime);
    databaseQueryTime.add(responseTime);

    check(response, {
      'classes loaded': r => r.status === 200,
      'classes response time': () => responseTime < PERFORMANCE_TARGETS.api_response_p95,
    });
  });
}

function viewAssignments(headers) {
  group('View Assignments (Judge)', function () {
    // Load judge assignments
    const startTime = Date.now();
    const response = http.get(`${API_URL}/rest/v1/assignment?select=*`, { headers });
    const responseTime = Date.now() - startTime;

    totalRequests.add(1);
    apiResponseTime.add(responseTime);
    databaseQueryTime.add(responseTime);

    check(response, {
      'assignments loaded': r => r.status === 200,
      'assignments response time': () => responseTime < PERFORMANCE_TARGETS.api_response_p95,
    });
  });
}

function judgeClasses(headers) {
  group('Judge Classes', function () {
    // Load entries for judging
    const startTime = Date.now();
    const response = http.get(`${API_URL}/rest/v1/entry?select=*&status=eq.confirmed`, { headers });
    const responseTime = Date.now() - startTime;

    totalRequests.add(1);
    apiResponseTime.add(responseTime);
    databaseQueryTime.add(responseTime);

    check(response, {
      'judging entries loaded': r => r.status === 200,
      'judging response time': () => responseTime < PERFORMANCE_TARGETS.api_response_p95,
    });
  });
}

function enterScores(headers) {
  group('Enter Scores (Judge)', function () {
    const scoreData = {
      entry_id: 'test-entry-id',
      score: Math.floor(Math.random() * 100) + 180,
      faults: Math.floor(Math.random() * 5),
      time: Math.floor(Math.random() * 60) + 30,
    };

    const startTime = Date.now();
    const response = http.post(`${API_URL}/rest/v1/score`, JSON.stringify(scoreData), { headers });
    const responseTime = Date.now() - startTime;

    totalRequests.add(1);
    apiResponseTime.add(responseTime);

    check(response, {
      'score entered': r => r.status === 201,
      'score entry response time': () => responseTime < PERFORMANCE_TARGETS.api_response_p95,
    });
  });
}

function generateReports(headers) {
  group('Generate Reports', function () {
    // Generate show statistics
    const startTime = Date.now();
    const response = http.get(`${API_URL}/rest/v1/rpc/show_statistics`, { headers });
    const responseTime = Date.now() - startTime;

    totalRequests.add(1);
    apiResponseTime.add(responseTime);
    databaseQueryTime.add(responseTime);

    check(response, {
      'report generated': r => r.status === 200,
      'report response time': () => responseTime < PERFORMANCE_TARGETS.database_query_p95,
    });
  });
}

// Real-time WebSocket testing
export function realtimeTest() {
  const url = WS_URL;

  const connectionStart = Date.now();
  const response = ws.connect(url, {}, function (socket) {
    const connectionTime = Date.now() - connectionStart;
    wsConnectionTime.add(connectionTime);

    check(null, {
      'WebSocket connection established': () =>
        connectionTime < PERFORMANCE_TARGETS.ws_connection_time,
    });

    // Subscribe to real-time updates
    socket.send(
      JSON.stringify({
        event: 'phx_join',
        topic: 'realtime:public:show',
        payload: {},
        ref: '1',
      })
    );

    // Listen for messages
    socket.onmessage = function (message) {
      const messageTime = Date.now();
      wsMessageLatency.add(messageTime - connectionStart);

      console.log('Received message:', message.data);
    };

    // Send periodic heartbeat
    socket.setInterval(function () {
      socket.send(
        JSON.stringify({
          event: 'heartbeat',
          topic: 'phoenix',
          payload: {},
          ref: Date.now().toString(),
        })
      );
    }, 30000);

    // Keep connection alive for test duration
    sleep(30);
  });

  check(response, {
    'WebSocket status is 101': r => r && r.status === 101,
  });
}

export function teardown(data) {
  console.log('🏁 Load test completed');
  console.log('📊 Generating performance report...');
}

export function handleSummary(data) {
  return {
    'load-test-report.html': htmlReport(data),
    'load-test-summary.json': JSON.stringify(data),
  };
}
