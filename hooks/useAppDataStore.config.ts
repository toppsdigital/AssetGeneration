// Centralized Configuration for App Data Store
// Modify these values to adjust auto-refresh behavior and job status handling

/**
 * AUTO-REFRESH INTERVALS (in milliseconds)
 * Adjust these values to change how often data refreshes automatically
 */
export const AUTO_REFRESH_INTERVALS = {
  // Jobs List Refresh Interval
  JOBS_LIST: 30000, // 30 seconds - How often the jobs list refreshes (regardless of filters)
  
  // Individual Job Refresh Interval  
  INDIVIDUAL_JOB: 5000, // 5 seconds - How often individual non-completed jobs refresh
  
  // Note: Only jobs with status 'completed' stop auto-refreshing
  // All other statuses ('uploading', 'uploaded', 'extracting', 'generating', failed statuses, etc.) 
  // will continue polling every 5 seconds
} as const;

/**
 * JOB STATUS CONFIGURATION
 * Define which job statuses should trigger different behaviors
 */
export const JOB_STATUS_CONFIG = {
  // Job statuses that should actively auto-refresh (poll every INDIVIDUAL_JOB interval)
  ACTIVE_POLLING_STATUSES: [
    'uploading',
    'uploaded', 
    'extracting',
    'generating',
    'upload-failed',    // Failed jobs might recover or need monitoring
    'extraction-failed',
    'generation-failed'
  ] as const,
  
  // Job statuses that should NEVER auto-refresh (polling stops completely)
  NO_POLLING_STATUSES: [
    'completed',  // Job is finished, no more changes expected
    // Add other terminal statuses here if needed
  ] as const,
  
  // Job statuses considered "active" (in progress, changing)
  IN_PROGRESS_STATUSES: [
    'uploading',
    'uploaded',
    'extracting', 
    'generating'
  ] as const,
  
  // Job statuses considered "terminal" (finished, won't change)
  TERMINAL_STATUSES: [
    'completed',
    'extracted',
    'generated',
    'upload-failed',
    'extraction-failed', 
    'generation-failed'
  ] as const,
  
  // Job statuses considered "failed" (error states)
  FAILED_STATUSES: [
    'upload-failed',
    'extraction-failed',
    'generation-failed'
  ] as const,
} as const;

/**
 * CACHE CONFIGURATION
 * Control how long data stays fresh in the cache
 */
export const CACHE_CONFIG = {
  STALE_TIME: {
    // How long data is considered "fresh" before refetching
    jobs: 30 * 1000,      // 30 seconds for individual jobs
    files: 15 * 1000,     // 15 seconds for file data
    assets: 60 * 1000,    // 1 minute for asset data
    jobsList: 10 * 1000,  // 10 seconds for jobs list
  },
  
  GARBAGE_COLLECTION_TIME: {
    // How long to keep data in memory after it becomes stale
    jobs: 5 * 60 * 1000,     // 5 minutes for individual jobs
    files: 3 * 60 * 1000,    // 3 minutes for file data
    assets: 10 * 60 * 1000,  // 10 minutes for asset data
    jobsList: 5 * 60 * 1000, // 5 minutes for jobs list
  },
} as const;

/**
 * RETRY CONFIGURATION
 * Control how failed requests are retried
 */
export const RETRY_CONFIG = {
  // Maximum number of retry attempts for failed requests
  MAX_ATTEMPTS: 3,
  
  // Multiplier for exponential backoff (each retry waits longer)
  BACKOFF_MULTIPLIER: 1.5,
  
  // Maximum delay between retries (30 seconds)
  MAX_DELAY: 30000,
} as const;

/**
 * JOBS LIST FILTER CONFIGURATION
 * Define available filter options and their API mappings
 */
export const JOBS_FILTER_CONFIG = {
  USER_FILTERS: {
    ALL: undefined,    // Show all users' jobs
    MY: 'my',         // Show only current user's jobs
  },
  
  STATUS_FILTERS: {
    ALL: undefined,        // Show all statuses
    IN_PROGRESS: 'in-progress',  // Show only in-progress jobs
    COMPLETED: 'completed',      // Show only completed jobs
    FAILED: 'failed',           // Show only failed jobs (if supported)
  },
} as const;

/**
 * DEBUGGING CONFIGURATION
 * Control console logging and debugging features
 */
export const DEBUG_CONFIG = {
  // Enable detailed console logging for auto-refresh events
  ENABLE_AUTO_REFRESH_LOGGING: false, // Disabled to reduce console noise
  
  // Enable detailed console logging for cache operations
  ENABLE_CACHE_LOGGING: false, // Disabled to reduce console noise
  
  // Enable detailed console logging for mutations
  ENABLE_MUTATION_LOGGING: false, // Disabled to reduce console noise
  
  // Enable performance timing logs
  ENABLE_PERFORMANCE_LOGGING: false,
} as const;

/**
 * FORCE REFRESH CONFIGURATION
 * Control when force refresh should be triggered
 */
export const FORCE_REFRESH_CONFIG = {
  // Events that should trigger a force refresh of the jobs list
  JOBS_LIST_FORCE_REFRESH_EVENTS: [
    'job_created',     // New job created
    'job_rerun',       // Job rerun operation
    'job_regenerate',  // Asset regeneration
    'job_deleted',     // Job deleted
    'job_status_major_change', // Major status change (e.g., failed to completed)
  ] as const,
  
  // Whether to automatically invalidate related caches during force refresh
  AUTO_INVALIDATE_RELATED_CACHES: true,
} as const;

/**
 * HELPER FUNCTIONS
 * Utility functions to work with the configuration
 */
export const ConfigHelpers = {
  // Check if a job status should actively poll
  shouldJobPoll: (status: string): boolean => 
    JOB_STATUS_CONFIG.ACTIVE_POLLING_STATUSES.includes(status as any),
  
  // Check if a job status should never poll
  shouldJobNeverPoll: (status: string): boolean => 
    JOB_STATUS_CONFIG.NO_POLLING_STATUSES.includes(status as any),
  
  // Check if a job is in progress
  isJobInProgress: (status: string): boolean => 
    JOB_STATUS_CONFIG.IN_PROGRESS_STATUSES.includes(status as any),
  
  // Check if a job is in a terminal state
  isJobTerminal: (status: string): boolean => 
    JOB_STATUS_CONFIG.TERMINAL_STATUSES.includes(status as any),
  
  // Check if a job has failed
  isJobFailed: (status: string): boolean => 
    JOB_STATUS_CONFIG.FAILED_STATUSES.includes(status as any),
  
  // Get the appropriate refresh interval for a job
  getJobRefreshInterval: (status: string): number | null => {
    if (ConfigHelpers.shouldJobNeverPoll(status)) {
      return null; // No polling
    }
    return AUTO_REFRESH_INTERVALS.INDIVIDUAL_JOB;
  },
  
  // Get jobs list refresh interval
  getJobsListRefreshInterval: (): number => AUTO_REFRESH_INTERVALS.JOBS_LIST,
} as const;

/**
 * VALIDATION FUNCTIONS
 * Validate configuration values
 */
export const ConfigValidation = {
  // Validate that intervals are reasonable
  validateIntervals: (): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    if (AUTO_REFRESH_INTERVALS.JOBS_LIST < 1000) {
      errors.push('Jobs list interval should be at least 1 second (1000ms)');
    }
    
    if (AUTO_REFRESH_INTERVALS.INDIVIDUAL_JOB < 1000) {
      errors.push('Individual job interval should be at least 1 second (1000ms)');
    }
    
    if (AUTO_REFRESH_INTERVALS.JOBS_LIST < AUTO_REFRESH_INTERVALS.INDIVIDUAL_JOB) {
      errors.push('Jobs list interval should not be faster than individual job interval');
    }
    
    return { isValid: errors.length === 0, errors };
  },
  
  // Validate job status configuration
  validateJobStatuses: (): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    // Check for overlaps between active and no-polling statuses
    const activeSet = new Set(JOB_STATUS_CONFIG.ACTIVE_POLLING_STATUSES);
    const noPollSet = new Set(JOB_STATUS_CONFIG.NO_POLLING_STATUSES);
    
    const overlap = [...activeSet].filter(status => noPollSet.has(status as any));
    if (overlap.length > 0) {
      errors.push(`Status overlap found: ${overlap.join(', ')} cannot be both active and no-poll`);
    }
    
    return { isValid: errors.length === 0, errors };
  },
} as const;

// Export type definitions for the configuration
export type JobStatus = 
  | typeof JOB_STATUS_CONFIG.ACTIVE_POLLING_STATUSES[number]
  | typeof JOB_STATUS_CONFIG.NO_POLLING_STATUSES[number];

export type UserFilter = typeof JOBS_FILTER_CONFIG.USER_FILTERS[keyof typeof JOBS_FILTER_CONFIG.USER_FILTERS];
export type StatusFilter = typeof JOBS_FILTER_CONFIG.STATUS_FILTERS[keyof typeof JOBS_FILTER_CONFIG.STATUS_FILTERS];
export type ForceRefreshEvent = typeof FORCE_REFRESH_CONFIG.JOBS_LIST_FORCE_REFRESH_EVENTS[number];

// Default export with all configuration
/**
 * AUTO-REFRESH PAGE RESTRICTIONS
 * Pages where auto-refresh polling is allowed to run
 */
export const ALLOWED_AUTO_REFRESH_PAGES = [
  '/test-datastore', // Test page for useAppDataStore
  '/jobs',           // Main jobs list page
] as const;

export default {
  AUTO_REFRESH_INTERVALS,
  JOB_STATUS_CONFIG,
  CACHE_CONFIG,
  RETRY_CONFIG,
  JOBS_FILTER_CONFIG,
  DEBUG_CONFIG,
  FORCE_REFRESH_CONFIG,
  ALLOWED_AUTO_REFRESH_PAGES,
  ConfigHelpers,
  ConfigValidation,
} as const;
