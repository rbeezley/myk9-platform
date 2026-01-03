/**
 * Deployment Types
 * 
 * Type definitions for production deployment, database migrations,
 * feature flags, and deployment monitoring systems.
 */

// === Deployment Configuration ===

export interface DeploymentConfig {
  environment: DeploymentEnvironment;
  version: string;
  deploymentId: string;
  timestamp: Date;
  features: FeatureFlagConfig[];
  migrations: MigrationTask[];
  rollbackStrategy: RollbackStrategy;
  healthChecks: HealthCheckConfig[];
}

export type DeploymentEnvironment = 'development' | 'staging' | 'production';

export type DeploymentStatus = 
  | 'pending' 
  | 'in_progress' 
  | 'completed' 
  | 'failed' 
  | 'rolled_back' 
  | 'cancelled';

// === Database Migrations ===

export interface MigrationTask {
  id: string;
  name: string;
  description: string;
  type: MigrationType;
  sql: string;
  rollbackSql?: string;
  dependencies: string[];
  estimatedDuration: number; // in seconds
  riskLevel: RiskLevel;
  status: MigrationStatus;
  executedAt?: Date;
  executedBy?: string;
  errorMessage?: string;
}

export type MigrationType = 
  | 'schema_change' 
  | 'data_migration' 
  | 'index_creation' 
  | 'rls_policy' 
  | 'function_deployment' 
  | 'trigger_update';

export type MigrationStatus = 
  | 'pending' 
  | 'running' 
  | 'completed' 
  | 'failed' 
  | 'skipped' 
  | 'rolled_back';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

// === RLS (Row Level Security) Policies ===

export interface RLSPolicy {
  id: string;
  name: string;
  tableName: string;
  operation: RLSOperation;
  definition: string;
  roles: string[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type RLSOperation = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';

export interface RLSPolicyUpdate {
  policyId: string;
  action: 'create' | 'update' | 'delete' | 'enable' | 'disable';
  newDefinition?: string;
  reason: string;
}

// === Feature Flags ===

export interface FeatureFlagConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  targetAudience: TargetAudience;
  conditions: FeatureCondition[];
  startDate?: Date;
  endDate?: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TargetAudience {
  userTypes: UserType[];
  organizations: string[];
  betaUsers: boolean;
  newUsers: boolean;
  regions: string[];
}

export type UserType = 'exhibitor' | 'judge' | 'secretary' | 'admin' | 'steward';

export interface FeatureCondition {
  type: ConditionType;
  operator: ConditionOperator;
  value: unknown;
}

export type ConditionType = 
  | 'user_id' 
  | 'organization_id' 
  | 'user_type' 
  | 'registration_date' 
  | 'device_type' 
  | 'platform' 
  | 'app_version';

export type ConditionOperator = 
  | 'equals' 
  | 'not_equals' 
  | 'contains' 
  | 'not_contains' 
  | 'greater_than' 
  | 'less_than' 
  | 'in' 
  | 'not_in';

// === Deployment Checklist ===

export interface DeploymentChecklist {
  id: string;
  deploymentId: string;
  version: string;
  environment: DeploymentEnvironment;
  status: DeploymentStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdBy: string;
  preDeploymentTasks: ChecklistTask[];
  migrationTasks: ChecklistTask[];
  deploymentTasks: ChecklistTask[];
  postDeploymentTasks: ChecklistTask[];
  rollbackPlan: RollbackPlan;
}

export interface ChecklistTask {
  id: string;
  name: string;
  description: string;
  category: TaskCategory;
  required: boolean;
  automated: boolean;
  estimatedDuration: number;
  status: TaskStatus;
  assignedTo?: string;
  completedAt?: Date;
  errorMessage?: string;
  artifacts: TaskArtifact[];
  dependencies: string[];
}

export type TaskCategory = 
  | 'database' 
  | 'application' 
  | 'infrastructure' 
  | 'security' 
  | 'monitoring' 
  | 'testing' 
  | 'documentation';

export type TaskStatus = 
  | 'pending' 
  | 'in_progress' 
  | 'completed' 
  | 'failed' 
  | 'skipped' 
  | 'blocked';

export interface TaskArtifact {
  type: ArtifactType;
  name: string;
  url?: string;
  content?: string;
  size?: number;
  checksum?: string;
}

export type ArtifactType = 
  | 'migration_script' 
  | 'backup_file' 
  | 'log_file' 
  | 'test_report' 
  | 'documentation' 
  | 'configuration';

// === Rollback Strategy ===

export interface RollbackPlan {
  id: string;
  deploymentId: string;
  strategy: RollbackStrategy;
  steps: RollbackStep[];
  estimatedDuration: number;
  dataBackups: BackupInfo[];
  riskAssessment: string;
  approvalRequired: boolean;
}

export type RollbackStrategy = 
  | 'blue_green' 
  | 'rolling_back' 
  | 'feature_toggle' 
  | 'database_restore' 
  | 'code_revert';

export interface RollbackStep {
  id: string;
  order: number;
  name: string;
  description: string;
  type: RollbackStepType;
  automated: boolean;
  script?: string;
  estimatedDuration: number;
  dependencies: string[];
}

export type RollbackStepType = 
  | 'code_deployment' 
  | 'database_migration' 
  | 'feature_flag_toggle' 
  | 'cache_invalidation' 
  | 'service_restart' 
  | 'dns_update';

export interface BackupInfo {
  id: string;
  type: BackupType;
  location: string;
  size: number;
  createdAt: Date;
  checksum: string;
  retentionPeriod: number;
}

export type BackupType = 
  | 'database_full' 
  | 'database_incremental' 
  | 'file_system' 
  | 'configuration' 
  | 'user_data';

// === Health Checks ===

export interface HealthCheckConfig {
  id: string;
  name: string;
  description: string;
  type: HealthCheckType;
  endpoint?: string;
  expectedResponse?: unknown;
  timeout: number;
  interval: number;
  retries: number;
  severity: Severity;
  enabled: boolean;
}

export type HealthCheckType = 
  | 'http_endpoint' 
  | 'database_connection' 
  | 'external_service' 
  | 'file_system' 
  | 'memory_usage' 
  | 'cpu_usage';

export type Severity = 'info' | 'warning' | 'error' | 'critical';

export interface HealthCheckResult {
  checkId: string;
  status: HealthStatus;
  responseTime: number;
  timestamp: Date;
  errorMessage?: string;
  metadata: Record<string, unknown>;
}

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

// === Deployment Events ===

export interface DeploymentEvent {
  id: string;
  deploymentId: string;
  type: DeploymentEventType;
  timestamp: Date;
  message: string;
  metadata: Record<string, unknown>;
  severity: Severity;
  source: string;
}

export type DeploymentEventType = 
  | 'deployment_started' 
  | 'deployment_completed' 
  | 'deployment_failed' 
  | 'migration_started' 
  | 'migration_completed' 
  | 'migration_failed' 
  | 'rollback_initiated' 
  | 'rollback_completed' 
  | 'health_check_failed' 
  | 'feature_flag_updated';

// === Monitoring Integration ===

export interface MonitoringConfig {
  errorTracking: ErrorTrackingConfig;
  performanceMonitoring: PerformanceMonitoringConfig;
  userAnalytics: UserAnalyticsConfig;
  customMetrics: CustomMetricConfig[];
}

export interface ErrorTrackingConfig {
  provider: 'sentry' | 'bugsnag' | 'rollbar';
  dsn: string;
  environment: string;
  sampleRate: number;
  enableSourceMaps: boolean;
  filterErrors: string[];
}

export interface PerformanceMonitoringConfig {
  provider: 'sentry' | 'newrelic' | 'datadog';
  apiKey: string;
  traceSampleRate: number;
  enableProfiling: boolean;
  enableWebVitals: boolean;
}

export interface UserAnalyticsConfig {
  provider: 'mixpanel' | 'amplitude' | 'segment';
  apiKey: string;
  trackPageViews: boolean;
  trackUserEvents: boolean;
  enableHeatmaps: boolean;
}

export interface CustomMetricConfig {
  name: string;
  description: string;
  type: MetricType;
  unit: string;
  tags: Record<string, string>;
  alertThresholds: AlertThreshold[];
}

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

export interface AlertThreshold {
  condition: ThresholdCondition;
  value: number;
  severity: Severity;
  notification: NotificationChannel[];
}

export type ThresholdCondition = 
  | 'greater_than' 
  | 'less_than' 
  | 'equals' 
  | 'change_rate';

export type NotificationChannel = 
  | 'email' 
  | 'slack' 
  | 'webhook' 
  | 'sms' 
  | 'pagerduty';

// === Load Testing ===

export interface LoadTestConfig {
  id: string;
  name: string;
  description: string;
  targetEndpoints: LoadTestEndpoint[];
  userLoad: UserLoadConfig;
  duration: number;
  rampUpTime: number;
  rampDownTime: number;
  successCriteria: SuccessCriteria;
  networkConditions: NetworkCondition[];
}

export interface LoadTestEndpoint {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers: Record<string, string>;
  body?: unknown;
  expectedStatus: number[];
  weight: number; // Distribution weight
}

export interface UserLoadConfig {
  virtualUsers: number;
  concurrentUsers: number;
  userScenarios: UserScenario[];
  dataGeneration: DataGenerationConfig;
}

export interface UserScenario {
  name: string;
  description: string;
  steps: ScenarioStep[];
  weight: number;
  thinkTime: number; // Delay between actions
}

export interface ScenarioStep {
  name: string;
  endpoint: string;
  method: string;
  data?: unknown;
  assertions: ResponseAssertion[];
}

export interface ResponseAssertion {
  type: 'status_code' | 'response_time' | 'json_path' | 'header_value';
  condition: string;
  expectedValue: unknown;
}

export interface DataGenerationConfig {
  userProfiles: number;
  dogProfiles: number;
  showData: number;
  organizationData: number;
  realistic: boolean; // Use realistic vs random data
}

export interface SuccessCriteria {
  maxResponseTime: number; // milliseconds
  maxErrorRate: number; // percentage
  minThroughput: number; // requests per second
  maxCpuUsage: number; // percentage
  maxMemoryUsage: number; // MB
}

export interface NetworkCondition {
  name: string;
  latency: number; // milliseconds
  bandwidth: number; // kbps
  packetLoss: number; // percentage
  enabled: boolean;
}

// === Disaster Recovery ===

export interface DisasterRecoveryPlan {
  id: string;
  name: string;
  description: string;
  scenarios: DisasterScenario[];
  recoveryProcedures: RecoveryProcedure[];
  backupStrategy: BackupStrategy;
  rto: number; // Recovery Time Objective (minutes)
  rpo: number; // Recovery Point Objective (minutes)
  lastTested: Date;
  nextTestDate: Date;
}

export interface DisasterScenario {
  id: string;
  name: string;
  description: string;
  probability: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high' | 'critical';
  triggers: string[];
  detectiveControls: string[];
}

export interface RecoveryProcedure {
  id: string;
  scenarioId: string;
  name: string;
  steps: RecoveryStep[];
  estimatedTime: number;
  requiredPersonnel: string[];
  dependencies: string[];
}

export interface RecoveryStep {
  id: string;
  order: number;
  name: string;
  description: string;
  automated: boolean;
  script?: string;
  estimatedDuration: number;
  verificationCriteria: string[];
}

export interface BackupStrategy {
  databases: DatabaseBackupConfig[];
  files: FileBackupConfig[];
  configurations: ConfigBackupConfig[];
  frequency: BackupFrequency;
  retention: BackupRetention;
  testing: BackupTestingConfig;
}

export interface DatabaseBackupConfig {
  name: string;
  type: 'full' | 'incremental' | 'differential';
  schedule: string; // cron expression
  encryption: boolean;
  compression: boolean;
  storageLocation: string;
}

export interface FileBackupConfig {
  paths: string[];
  exclusions: string[];
  type: 'full' | 'incremental';
  schedule: string;
  encryption: boolean;
  compression: boolean;
}

export interface ConfigBackupConfig {
  services: string[];
  includeSecrets: boolean;
  schedule: string;
  encryption: boolean;
  versionControl: boolean;
}

export interface BackupFrequency {
  full: string; // cron expression
  incremental: string;
  differential?: string;
}

export interface BackupRetention {
  daily: number; // days
  weekly: number; // weeks
  monthly: number; // months
  yearly: number; // years
}

export interface BackupTestingConfig {
  frequency: string; // cron expression
  scope: 'sample' | 'full';
  automatedValidation: boolean;
  testRestoreLocation: string;
}