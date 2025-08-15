# App Data Store - Centralized Data Management

## Overview

The `useAppDataStore` hook provides a centralized, intelligent data management system that replaces scattered data fetching logic across the application. It handles jobs, files, assets, and related data with automatic caching, smart refresh logic, and optimistic updates.

## Key Features

- **🎯 Single Source of Truth**: All data flows through one centralized system
- **⚡ Intelligent Caching**: Smart cache management with React Query
- **🔄 Auto-Refresh**: Automatic polling based on job status and activity
- **🚀 Optimistic Updates**: Instant UI updates with rollback on failure
- **📊 Type Safety**: Fully typed with comprehensive TypeScript interfaces
- **🛠️ Easy Testing**: Built-in test page for validation

## Quick Start

### Basic Usage

```typescript
import { useAppDataStore } from '../hooks/useAppDataStore';

// Fetch all jobs
const { data: jobs, isLoading, refresh } = useAppDataStore('jobs');

// Fetch job details with files and assets
const { data: job, mutate } = useAppDataStore('jobDetails', {
  jobId: 'job-123',
  includeFiles: true,
  includeAssets: true,
  autoRefresh: true
});

// Update job data
await mutate({
  type: 'updateJob',
  jobId: 'job-123',
  data: { description: 'Updated description' }
});
```

## Selectors

### `'jobs'` - Jobs List
Fetch and manage a list of jobs with filtering.

```typescript
const { data: jobs } = useAppDataStore('jobs', {
  filters: {
    userFilter: 'my',           // 'my' | undefined
    statusFilter: 'in-progress' // 'in-progress' | 'completed' | undefined
  }
});
```

### `'jobDetails'` - Individual Job
Fetch detailed job information with optional related data.

```typescript
const { data: job } = useAppDataStore('jobDetails', {
  jobId: 'job-123',
  includeFiles: true,    // Include file objects
  includeAssets: true,   // Include asset data
  autoRefresh: true      // Enable automatic polling
});
```

### `'jobFiles'` - Job Files
Fetch files associated with a specific job.

```typescript
const { data: files } = useAppDataStore('jobFiles', {
  jobId: 'job-123'
});
```

### `'jobAssets'` - Job Assets
Fetch assets for a specific job.

```typescript
const { data: assets } = useAppDataStore('jobAssets', {
  jobId: 'job-123'
});
```

### `'downloadUrl'` - Download URLs
Generate or fetch download URLs with automatic expiry management.

```typescript
const { data: downloadInfo } = useAppDataStore('downloadUrl', {
  jobId: 'job-123'
});
```

## Mutations

The data store supports various mutation operations:

```typescript
// Update job
await mutate({
  type: 'updateJob',
  jobId: 'job-123',
  data: { description: 'New description' }
});

// Create files
await mutate({
  type: 'createFiles',
  data: [/* file data array */]
});

// Update file status
await mutate({
  type: 'updateFile',
  fileId: 'file-123',
  data: { status: 'uploaded' }
});

// Create asset
await mutate({
  type: 'createAsset',
  jobId: 'job-123',
  data: { /* asset config */ }
});

// Update asset
await mutate({
  type: 'updateAsset',
  jobId: 'job-123',
  assetId: 'asset-123',
  data: { /* updated config */ }
});

// Delete asset
await mutate({
  type: 'deleteAsset',
  jobId: 'job-123',
  assetId: 'asset-123'
});

// Refresh download URL
await mutate({
  type: 'refreshDownloadUrl',
  jobId: 'job-123'
});
```

## Auto-Refresh Logic

The data store uses simplified, predictable auto-refresh intervals:

### **Jobs List:**
- **📋 All Jobs**: 30 seconds (regardless of filters)
- **Consistent**: Same interval for all filters (my vs all, in-progress vs completed)
- **🚀 Force Refresh**: Available for events like new job creation, rerun, regenerate

### **Individual Job Details:**
- **🔄 Non-Completed Jobs**: 5 seconds (active polling)
- **✅ Completed Jobs**: Never polls (automatic stop to save resources)

### Smart Auto-Refresh Behavior

The data store intelligently manages refresh cycles:

1. **Jobs List**: Polls every 30 seconds regardless of applied filters
2. **Individual Jobs**: Polls every 5 seconds for non-completed jobs
3. **Automatic Stop**: Completed jobs stop polling to save resources  
4. **Force Refresh**: Use `forceRefreshJobsList()` for immediate updates on events
5. **Manual Refresh**: Always available regardless of auto-refresh status

### Force Refresh for Events

Use the force refresh function for immediate jobs list updates:

```typescript
const { forceRefreshJobsList } = useAppDataStore('jobs');

// Call after events that create/modify jobs
await forceRefreshJobsList(); // For new job creation, rerun, regenerate, etc.
```

```typescript
// Enable auto-refresh
const { startAutoRefresh, stopAutoRefresh, isAutoRefreshActive } = useAppDataStore('jobDetails', {
  jobId: 'job-123',
  autoRefresh: true
});

// Manual control
startAutoRefresh();  // Start polling
stopAutoRefresh();   // Stop polling
```

## Configuration

Customize cache and refresh behavior:

```typescript
const { data } = useAppDataStore('jobs', {}, {
  autoRefresh: {
    enabled: true,
    intervals: {
      activeJobs: 3000,     // 3 seconds for individual non-completed jobs
      jobsList: 15000       // 15 seconds for jobs list
    }
  },
  cache: {
    staleTime: {
      jobs: 60 * 1000,      // 1 minute
      files: 30 * 1000,     // 30 seconds
      assets: 120 * 1000,   // 2 minutes
      jobsList: 30 * 1000   // 30 seconds
    }
  }
});
```

## Utility Functions

The data store includes comprehensive utility functions:

```typescript
import { 
  jobStatusUtils, 
  fileUtils, 
  jobProgressUtils,
  filterUtils,
  transformUtils 
} from '../hooks/useAppDataStore.utils';

// Job status utilities
const isActive = jobStatusUtils.isActive('uploading');
const statusColor = jobStatusUtils.getStatusColor('completed');

// Progress calculation
const progress = jobProgressUtils.getOverallProgress(job);

// Data filtering
const activeJobs = filterUtils.filterJobsByStatus(jobs, 'in-progress');
const searchResults = filterUtils.searchJobs(jobs, 'search term');

// Data transformation
const displayData = transformUtils.formatJobForDisplay(job);
```

## Error Handling

The data store provides comprehensive error handling:

```typescript
const { data, error, isLoading } = useAppDataStore('jobDetails', {
  jobId: 'invalid-id'
});

if (error) {
  console.error('Data store error:', error.message);
}

// Errors are automatically retried with exponential backoff
// 404 errors are not retried (job not found)
// Network errors are retried up to 3 times
```

## Cache Management

Manual cache control when needed:

```typescript
const { invalidate, clearCache, preloadData } = useAppDataStore('jobs');

// Invalidate specific cache
invalidate('jobDetails', { jobId: 'job-123' });

// Clear cache completely
clearCache('jobs');

// Preload data
await preloadData('jobDetails', { jobId: 'job-123' });
```

## Testing

Use the built-in test page to validate functionality:

1. Navigate to `/test-datastore` in your browser
2. Test different selectors and options
3. Verify auto-refresh behavior
4. Test mutations and cache invalidation
5. Monitor performance in React Query DevTools

## Migration Guide

### From `useJobData` + `useJobFiles`

**Before:**
```typescript
const { data: jobData } = useJobData(jobId);
const { data: fileData } = useJobFiles(jobId, jobData?.api_files);
```

**After:**
```typescript
const { data: job } = useAppDataStore('jobDetails', {
  jobId,
  includeFiles: true
});
```

### From Manual Cache Synchronization

**Before:**
```typescript
syncJobDataAcrossCaches(queryClient, jobId, updater);
```

**After:**
```typescript
await mutate({
  type: 'updateJob',
  jobId,
  data: updates
});
// Cache sync happens automatically
```

### From Scattered Refresh Logic

**Before:**
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    if (isJobActive) {
      refetch();
    }
  }, 2000);
  return () => clearInterval(interval);
}, [isJobActive]);
```

**After:**
```typescript
const { data } = useAppDataStore('jobDetails', {
  jobId,
  autoRefresh: true  // Automatic intelligent refresh
});
```

## Performance Tips

1. **Use Specific Selectors**: Choose the most specific selector for your needs
2. **Enable Auto-Refresh Judiciously**: Only enable for data that actually changes
3. **Leverage Caching**: Let the data store handle cache management
4. **Batch Mutations**: Group related mutations when possible
5. **Monitor DevTools**: Use React Query DevTools to optimize cache behavior

## Best Practices

1. **One Data Store per Component**: Use a single `useAppDataStore` call per logical data need
2. **Handle Loading States**: Always handle `isLoading` and `error` states
3. **Optimize Re-renders**: Use `useMemo` for expensive computations on data
4. **Error Boundaries**: Wrap components in error boundaries for graceful degradation
5. **Test in Isolation**: Use the test page to validate new functionality

## Troubleshooting

### Common Issues

**Data not updating after mutation:**
- Check that the mutation completed successfully
- Verify cache invalidation is working
- Use React Query DevTools to inspect cache state

**Auto-refresh not working:**
- Ensure `autoRefresh: true` is set in options
- Check that the job status supports auto-refresh
- Verify the component isn't unmounting and remounting

**Performance issues:**
- Check refresh intervals aren't too aggressive
- Monitor cache size in DevTools
- Use performance utilities for expensive operations

**Type errors:**
- Ensure you're using the correct selector and options types
- Check that mutation payloads match expected interfaces
- Import types from the correct module

### Debug Logging

The data store includes comprehensive console logging:
- Enable browser console to see fetch operations
- Monitor cache hits/misses
- Track mutation success/failure
- View auto-refresh cycles

## API Reference

See `useAppDataStore.types.ts` for complete type definitions and interfaces.
