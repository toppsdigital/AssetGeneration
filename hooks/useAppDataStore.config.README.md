# App Data Store Configuration Guide

## Overview

The `useAppDataStore.config.ts` file provides a centralized place to configure all auto-refresh intervals, job status behaviors, cache settings, and debugging options for the App Data Store.

## Quick Configuration

### 🔄 Auto-Refresh Intervals

```typescript
export const AUTO_REFRESH_INTERVALS = {
  JOBS_LIST: 30000,        // How often jobs list refreshes (30 seconds)
  INDIVIDUAL_JOB: 5000,    // How often individual jobs refresh (5 seconds)
}
```

**To change intervals:**
1. Open `hooks/useAppDataStore.config.ts`
2. Modify the values in `AUTO_REFRESH_INTERVALS`
3. Save the file - changes take effect immediately

### 📊 Job Status Configuration

**Active Polling Statuses** (jobs that refresh every `INDIVIDUAL_JOB` interval):
```typescript
ACTIVE_POLLING_STATUSES: [
  'uploading',
  'uploaded', 
  'extracting',
  'generating',
  'upload-failed',    
  'extraction-failed',
  'generation-failed'
]
```

**No Polling Statuses** (jobs that never refresh):
```typescript
NO_POLLING_STATUSES: [
  'completed',  // Finished jobs don't change
]
```

**To add/remove job statuses:**
1. Add status to `ACTIVE_POLLING_STATUSES` to enable polling
2. Add status to `NO_POLLING_STATUSES` to disable polling
3. Remove from both arrays for default behavior

## Common Customizations

### Faster Refresh for Development
```typescript
export const AUTO_REFRESH_INTERVALS = {
  JOBS_LIST: 10000,        // 10 seconds instead of 30
  INDIVIDUAL_JOB: 2000,    // 2 seconds instead of 5
}
```

### Production Optimization
```typescript
export const AUTO_REFRESH_INTERVALS = {
  JOBS_LIST: 60000,        // 1 minute for less server load
  INDIVIDUAL_JOB: 10000,   // 10 seconds for active jobs
}
```

### Custom Job Status Handling
```typescript
// Example: Treat 'generating' as completed (no polling)
NO_POLLING_STATUSES: [
  'completed',
  'generating',  // Add this to stop polling generating jobs
]

// Example: Monitor failed jobs more actively
ACTIVE_POLLING_STATUSES: [
  'uploading',
  'uploaded', 
  'extracting',
  'upload-failed',    // Keep these for monitoring
  'extraction-failed',
]
```

### Disable Debug Logging for Production
```typescript
export const DEBUG_CONFIG = {
  ENABLE_AUTO_REFRESH_LOGGING: false,  // Turn off in production
  ENABLE_CACHE_LOGGING: false,         // Turn off in production
  ENABLE_MUTATION_LOGGING: false,      // Turn off in production
  ENABLE_PERFORMANCE_LOGGING: false,
}
```

## Configuration Validation

The configuration includes built-in validation:

```typescript
import { ConfigValidation } from './hooks/useAppDataStore.config';

// Check if configuration is valid
const validation = ConfigValidation.validateIntervals();
if (!validation.isValid) {
  console.error('Configuration errors:', validation.errors);
}
```

## Helper Functions

Use the provided helper functions in your components:

```typescript
import { ConfigHelpers } from './hooks/useAppDataStore.config';

// Check if a job should poll
const shouldPoll = ConfigHelpers.shouldJobPoll('uploading'); // true

// Get refresh interval for a job
const interval = ConfigHelpers.getJobRefreshInterval('completed'); // null (no polling)

// Check job states
const isInProgress = ConfigHelpers.isJobInProgress('extracting'); // true
const isTerminal = ConfigHelpers.isJobTerminal('completed'); // true
```

## Environment-Specific Configuration

For different environments, you can create conditional configuration:

```typescript
const isDevelopment = process.env.NODE_ENV === 'development';

export const AUTO_REFRESH_INTERVALS = {
  JOBS_LIST: isDevelopment ? 10000 : 30000,        // Faster in dev
  INDIVIDUAL_JOB: isDevelopment ? 2000 : 5000,     // Faster in dev
}

export const DEBUG_CONFIG = {
  ENABLE_AUTO_REFRESH_LOGGING: isDevelopment,      // Only in dev
  ENABLE_CACHE_LOGGING: isDevelopment,             // Only in dev
  ENABLE_MUTATION_LOGGING: isDevelopment,          // Only in dev
  ENABLE_PERFORMANCE_LOGGING: false,
}
```

## Testing Configuration Changes

1. Navigate to `/test-datastore`
2. Click "Show Config" to see current values
3. Test different scenarios with the available controls
4. Monitor browser console for logging output
5. Use React Query DevTools to verify cache behavior

## Configuration Sections

### `AUTO_REFRESH_INTERVALS`
Controls how often data refreshes automatically.

### `JOB_STATUS_CONFIG`
Defines which job statuses trigger different polling behaviors.

### `CACHE_CONFIG`
Controls how long data stays fresh and in memory.

### `RETRY_CONFIG`
Controls retry behavior for failed requests.

### `JOBS_FILTER_CONFIG`
Defines available filter options for jobs list.

### `DEBUG_CONFIG`
Controls console logging and debugging features.

### `FORCE_REFRESH_CONFIG`
Controls when force refresh should be triggered.

## Best Practices

1. **Start with defaults** - The default configuration works well for most use cases
2. **Test changes** - Always test configuration changes on the test page
3. **Consider server load** - Faster intervals mean more server requests
4. **Use validation** - Run validation functions to catch configuration errors
5. **Document changes** - Add comments explaining why you changed default values
6. **Environment-specific** - Use different settings for development vs production

## Common Issues

**Problem**: Jobs not refreshing
- **Solution**: Check if status is in `ACTIVE_POLLING_STATUSES`

**Problem**: Too many server requests
- **Solution**: Increase `JOBS_LIST` and `INDIVIDUAL_JOB` intervals

**Problem**: Jobs list not updating after events
- **Solution**: Call `forceRefreshJobsList()` after job creation/modification

**Problem**: Console spam
- **Solution**: Turn off debug logging in `DEBUG_CONFIG`

## Migration from Hardcoded Values

If you're updating from the previous hardcoded system:

1. **Old**: Jobs list refreshed every 10-30 seconds based on filters
   **New**: Consistent 30 seconds, configurable in `JOBS_LIST`

2. **Old**: Individual jobs refreshed every 2-5 seconds based on status
   **New**: 5 seconds for active statuses, never for completed, configurable

3. **Old**: Status checks scattered in code
   **New**: Centralized in `JOB_STATUS_CONFIG` arrays

4. **Old**: Manual cache synchronization
   **New**: Automatic with `forceRefreshJobsList()` for events
