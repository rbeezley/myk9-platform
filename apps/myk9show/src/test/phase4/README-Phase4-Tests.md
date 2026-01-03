# Phase 4 Comprehensive Testing Suite

This directory contains comprehensive tests for all Phase 4 features including conflict resolution, real-time collaboration, optimistic UI, and advanced offline features.

## Test Structure

```
src/test/phase4/
├── conflict/
│   └── ConflictResolver.comprehensive.test.ts     # Multi-user conflicts, business rules, batch resolution
├── realtime/
│   └── RealtimeScoringService.test.ts             # Real-time scoring, presence, connection management
├── optimistic/
│   └── OptimisticUIService.test.ts                # Optimistic updates, rollbacks, conflict handling
├── collaboration/
│   └── PresenceService.test.ts                    # Multi-user presence, entity tracking, collaboration
├── integration/
│   └── RealtimeCollaboration.test.ts              # Cross-service integration scenarios
├── performance/
│   └── Phase4Performance.test.ts                  # High-load performance and stress testing
├── e2e/
│   └── RealtimeCollaborationWorkflows.test.ts     # Complete end-to-end workflows
└── README-Phase4-Tests.md                         # This file
```

## Test Coverage

### 1. Conflict Resolution (`conflict/`)
- **Multi-user simultaneous scoring conflicts**
  - Judge authority hierarchy (head judge > associate judge)
  - Concurrent modification detection and resolution
  - Tie-breaking rules for identical scores
- **Business rule enforcement**
  - Show status progression (prevent regression)
  - Dog title accumulation (merge instead of overwrite)
  - Title chronology validation
- **Batch conflict resolution**
  - High-volume conflict processing
  - Mixed priority conflict handling
  - Performance optimization
- **Resolution strategies**
  - Last-write-wins
  - Field-level merging
  - User hierarchy priority
  - Manual resolution requirements

### 2. Real-time Scoring (`realtime/`)
- **Score update handling**
  - Multiple judges scoring simultaneously
  - Conflict detection for concurrent updates
  - Throttling for rapid updates
- **Judge presence management**
  - Active judge tracking
  - Connection/disconnection handling
  - Class-specific presence filtering
- **Connection management**
  - Network failure recovery
  - Exponential backoff reconnection
  - Heartbeat maintenance
- **Class subscription management**
  - Dynamic subscription to specific classes
  - Filtering by show and class ID
- **Performance under load**
  - High-frequency score updates
  - Memory management with many users
  - Error handling for malformed data

### 3. Optimistic UI (`optimistic/`)
- **Optimistic update workflows**
  - Immediate UI updates with background execution
  - Success confirmation and rollback scenarios
  - Retry logic with exponential backoff
- **Conflict detection and resolution**
  - Version mismatch detection
  - Field-level conflict identification
  - Custom conflict handler registration
- **Batch operations**
  - Concurrent optimistic updates
  - Operation ordering and consistency
- **Custom rollback strategies**
  - Automatic rollback
  - Soft delete handling
  - Queue-based rollback
- **Operation management**
  - Pending operation tracking
  - Undo functionality for confirmed operations
  - Automatic cleanup of completed operations

### 4. Collaboration (`collaboration/`)
- **Multi-user presence tracking**
  - User join/leave events
  - Real-time presence synchronization
  - Connection state management
- **Entity-specific filtering**
  - Users working on specific entities
  - Page-based user filtering
  - Role-based user queries
- **Activity tracking**
  - Editing conflict detection
  - Judge scoring activities
  - Real-time activity updates
- **Connection resilience**
  - Heartbeat management
  - Page visibility handling
  - Reconnection with backoff
- **Performance optimization**
  - Efficient handling of many concurrent users
  - Memory management for frequent updates
  - Rapid join/leave event processing

### 5. Integration Testing (`integration/`)
- **Cross-service coordination**
  - Presence updates with scoring activities
  - Optimistic updates with presence awareness
  - Service failure isolation
- **Multi-judge workflows**
  - Judge handoff during scoring
  - State maintenance across disconnections
  - Authority-based conflict resolution
- **Real-time conflict workflows**
  - Automatic resolution in real-time
  - Critical conflict escalation
  - Batch resolution efficiency
- **Performance under load**
  - High-frequency updates across services
  - Complex conflict resolution scenarios
  - Memory and resource management

### 6. Performance Testing (`performance/`)
- **Concurrent user simulation**
  - 100+ judges scoring simultaneously
  - 200+ users with presence updates
  - High-volume conflict resolution
- **Latency measurements**
  - Average, maximum, and P95 latencies
  - Performance under various network conditions
  - Optimization verification
- **Memory usage monitoring**
  - Resource consumption under load
  - Connection cleanup efficiency
  - Memory leak detection
- **Network simulation**
  - Various network delay conditions
  - Connection failure and retry performance
  - Graceful degradation testing

### 7. End-to-End Workflows (`e2e/`)
- **Complete show day workflow**
  - Setup → scoring → conflicts → results
  - Multi-phase collaboration
  - Real-time updates throughout
- **Multi-ring competition**
  - Concurrent judging across rings
  - Judge rotation scenarios
  - Cross-ring conflict management
- **Network disruption recovery**
  - Normal → failure → offline → recovery
  - State consistency maintenance
  - Queue synchronization
- **Large-scale championship simulation**
  - 200+ entries across 10+ classes
  - 8+ judges with complex workflows
  - Performance at championship scale

## Key Test Scenarios

### Critical Scenarios Validated

1. **Multi-Judge Simultaneous Scoring**
   - Two judges score the same entry within seconds
   - Conflict detection and automatic resolution
   - Head judge authority override capabilities

2. **Real-time Collaboration with Network Issues**
   - Judge disconnects mid-scoring
   - Optimistic updates continue offline
   - Seamless sync when reconnected

3. **High-Volume Conflict Resolution**
   - 100+ simultaneous conflicts
   - Batch processing within 1 second
   - Proper prioritization and escalation

4. **Championship-Scale Performance**
   - 200+ entries across multiple classes
   - 8+ concurrent judges
   - Sub-30-second total processing time

5. **Complex Business Rule Enforcement**
   - Show status progression validation
   - Dog title accumulation rules
   - Judge hierarchy respect

### Performance Benchmarks

- **Scoring Performance**: 400+ scores/second
- **Conflict Resolution**: 100+ conflicts/second
- **Presence Updates**: 500+ updates/second
- **Average Latency**: <50ms
- **95th Percentile**: <100ms
- **Memory Growth**: <50KB per operation

## Running the Tests

### Individual Test Suites
```bash
# Conflict resolution tests
npm run test src/test/phase4/conflict/

# Real-time scoring tests
npm run test src/test/phase4/realtime/

# Optimistic UI tests
npm run test src/test/phase4/optimistic/

# Collaboration tests
npm run test src/test/phase4/collaboration/

# Integration tests
npm run test src/test/phase4/integration/

# Performance tests
npm run test src/test/phase4/performance/

# End-to-end tests
npm run test src/test/phase4/e2e/
```

### All Phase 4 Tests
```bash
npm run test src/test/phase4/
```

### Performance-Focused Tests
```bash
npm run test src/test/phase4/performance/ src/test/phase4/e2e/
```

## Test Configuration

### Environment Variables
- `VITEST_PHASE4_PERFORMANCE`: Enable performance testing mode
- `VITEST_PHASE4_VERBOSE`: Enable detailed logging
- `VITEST_PHASE4_TIMEOUT`: Set custom test timeouts

### Performance Thresholds
- Tests include performance assertions
- Configurable via environment variables
- Fail if performance degrades beyond thresholds

## Mock Strategy

### Service Mocking
- All external services (Supabase, WebSockets) are mocked
- Realistic behavior simulation for network conditions
- Consistent mock data across test suites

### Performance Mocking
- Mock performance API for measurements
- Simulated memory usage tracking
- Network delay simulation

## Integration Points

### Store Integration
- Mock store implementations for optimistic updates
- State snapshot and restoration testing
- Cross-store consistency validation

### Network Simulation
- Various network conditions (fast, slow, intermittent)
- Connection failure and recovery scenarios
- WebSocket event simulation

## Error Scenarios

### Comprehensive Error Testing
- Network timeouts and failures
- Malformed data handling
- Service unavailability
- Memory pressure conditions
- Connection limit scenarios

### Recovery Testing
- Automatic retry mechanisms
- Fallback behavior validation
- State consistency during failures
- User experience during errors

## Metrics and Reporting

### Test Metrics
- Performance benchmarks
- Coverage statistics
- Error rate measurements
- Resource usage tracking

### Continuous Integration
- Automated performance regression detection
- Load testing in CI/CD pipeline
- Performance trend analysis
- Alert thresholds for degradation

## Future Enhancements

### Planned Test Additions
- Browser compatibility testing
- Mobile device simulation
- Accessibility in real-time features
- Security and authentication testing

### Performance Improvements
- More granular performance metrics
- Real-world network condition simulation
- Stress testing with actual hardware limits
- Cross-browser performance comparison

This comprehensive test suite ensures Phase 4 features work reliably under all conditions from small local shows to large championship events with hundreds of participants.