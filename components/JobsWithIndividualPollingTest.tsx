'use client';

import React, { useState, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useAppDataStore, dataStoreKeys } from '../hooks/useAppDataStore';
import { ConfigHelpers } from '../hooks/useAppDataStore.config';
import { contentPipelineApi } from '../web/utils/contentPipelineApi';
import AppDataStoreConfig from '../hooks/useAppDataStore.config';

export default function JobsWithIndividualPollingTest() {
  // State for filters
  const [userFilter, setUserFilter] = useState<'all' | 'my'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in-progress' | 'completed'>('all');
  const [autoRefreshJobs, setAutoRefreshJobs] = useState(true);
  const [autoRefreshIndividual, setAutoRefreshIndividual] = useState(true);
  
  const pathname = usePathname();
  
  // Define pages where auto-refresh is allowed
  const isAutoRefreshAllowedOnPage = AppDataStoreConfig.ALLOWED_AUTO_REFRESH_PAGES.includes(pathname as any);

  // Build options for jobs list (memoized to prevent infinite re-renders)
  const jobsOptions = useMemo(() => ({
    filters: {
      ...(userFilter === 'my' && { userFilter: 'my' }),
      ...(statusFilter !== 'all' && { statusFilter }),
    },
    autoRefresh: autoRefreshJobs,
  }), [userFilter, statusFilter, autoRefreshJobs]);

  // Get the jobs list
  const {
    data: jobs,
    isLoading: isJobsListLoading,
    isRefreshing: isJobsListRefreshing,
    error: jobsListError,
    refresh: refreshJobsList,
    forceRefreshJobsList,
  } = useAppDataStore('jobs', jobsOptions);

  // Extract non-completed job IDs from the jobs list
  const nonCompletedJobIds = useMemo(() => {
    if (!jobs || !Array.isArray(jobs)) return [];
    
    const filtered = jobs
      .filter((job: any) => {
        const jobStatus = job?.job_status || '';
        const shouldNotPoll = ConfigHelpers.shouldJobNeverPoll(jobStatus);
        return !shouldNotPoll;
      })
      .map((job: any) => job.job_id)
      .filter(Boolean); // Remove any undefined/null job IDs

    console.log(`🔍 [JobsWithIndividualPolling] Found ${filtered.length} non-completed jobs to poll:`, filtered);
    return filtered;
  }, [jobs]);

  // Use React Query's useQueries for proper polling
  const individualJobQueries = useQueries({
    queries: (autoRefreshIndividual && isAutoRefreshAllowedOnPage) ? nonCompletedJobIds.map(jobId => ({
      queryKey: dataStoreKeys.jobs.detail(jobId),
      queryFn: async () => {
        console.log(`🌐 [ReactQuery] Making network call for job ${jobId}`);
        const startTime = Date.now();
        const response = await contentPipelineApi.getJob(jobId);
        const endTime = Date.now();
        
        console.log(`✅ [ReactQuery] Network call completed for job ${jobId} in ${endTime - startTime}ms`);
        console.log(`🎯 [ReactQuery] Job ${jobId} status: ${response.job.job_status}`);
        
        return {
          ...response.job,
          api_files: response.job.files,
          files: [],
          content_pipeline_files: [],
          Subset_name: response.job.source_folder
        };
      },
      enabled: autoRefreshIndividual && isAutoRefreshAllowedOnPage,
      refetchInterval: (data, query) => {
        if (!autoRefreshIndividual || !isAutoRefreshAllowedOnPage) {
          if (!isAutoRefreshAllowedOnPage) {
            console.log(`⏸️ [ReactQuery] Auto-refresh disabled for job ${jobId} - page ${pathname} not allowed`);
          } else {
            console.log(`⏸️ [ReactQuery] Auto-refresh disabled for job ${jobId}`);
          }
          return false;
        }
        
        // Check for error state safely
        const hasError = query?.state?.status === 'error';
        if (hasError) {
          console.log(`🔄 [ReactQuery] Continuing to poll job ${jobId} despite error (5s interval)`);
          return 5000; // Continue polling on error
        }
        
        if (!data) {
          console.log(`🔄 [ReactQuery] No data for job ${jobId}, polling every 5000ms`);
          return 5000; // If no data yet, poll every 5 seconds
        }
        
        const jobStatus = data.job_status || '';
        const shouldNotPoll = ConfigHelpers.shouldJobNeverPoll(jobStatus);
        
        if (shouldNotPoll) {
          console.log(`⏹️ [ReactQuery] Job ${jobId} is ${jobStatus}, stopping polling`);
          return false; // Stop polling
        }
        
        console.log(`🔄 [ReactQuery] Job ${jobId} (${jobStatus}) will poll again in 5000ms`);
        return 5000; // Poll every 5 seconds
      },
      refetchIntervalInBackground: true,
      staleTime: 0, // Always consider stale so it refetches
      gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        console.error(`❌ [ReactQuery] Query failed for job ${jobId} (attempt ${failureCount + 1}):`, error);
        return failureCount < 3; // Retry up to 3 times
      },
    })) : [],
  });

  const individualPollingInfo = {
    totalNonCompleted: nonCompletedJobIds.length,
    pollingEnabled: autoRefreshIndividual && isAutoRefreshAllowedOnPage,
    pageAllowed: isAutoRefreshAllowedOnPage,
    currentPage: pathname,
  };

  return (
    <div className="border border-blue-300 rounded-lg p-4 bg-blue-50">
      <h3 className="text-xl font-semibold mb-4 text-blue-800">
        🚀 Jobs with Automatic Individual Polling
      </h3>
      
      {/* Controls */}
      <div className="mb-4 p-3 bg-white rounded border">
        <h4 className="font-medium mb-3">Controls</h4>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* User Filter */}
          <div>
            <label className="block text-sm font-medium mb-1">User:</label>
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value as 'all' | 'my')}
              className="w-full p-2 border border-gray-300 rounded"
            >
              <option value="all">All Users</option>
              <option value="my">My Jobs</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium mb-1">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'in-progress' | 'completed')}
              className="w-full p-2 border border-gray-300 rounded"
            >
              <option value="all">All Status</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Jobs List Auto Refresh */}
          <div>
            <label className="block text-sm font-medium mb-1">Jobs List Auto-Refresh:</label>
            <label className="flex items-center p-2">
              <input
                type="checkbox"
                checked={autoRefreshJobs}
                onChange={(e) => setAutoRefreshJobs(e.target.checked)}
                className="mr-2"
              />
              Enable ({AppDataStoreConfig.AUTO_REFRESH_INTERVALS.JOBS_LIST}ms)
            </label>
          </div>

          {/* Individual Jobs Auto Refresh */}
          <div>
            <label className="block text-sm font-medium mb-1">Individual Jobs Auto-Refresh:</label>
            <label className="flex items-center p-2">
              <input
                type="checkbox"
                checked={autoRefreshIndividual}
                onChange={(e) => setAutoRefreshIndividual(e.target.checked)}
                className="mr-2"
              />
              Enable ({AppDataStoreConfig.AUTO_REFRESH_INTERVALS.INDIVIDUAL_JOB}ms)
            </label>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mb-4 flex gap-2 flex-wrap">
        <button
          onClick={refreshJobsList}
          disabled={isJobsListLoading || isJobsListRefreshing}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {isJobsListRefreshing ? 'Refreshing...' : 'Manual Refresh Jobs List'}
        </button>
        
        <button
          onClick={forceRefreshJobsList}
          disabled={isJobsListLoading}
          className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
        >
          Force Refresh (Events)
        </button>

        {/* Test Individual API Call */}
        {nonCompletedJobIds.length > 0 && (
          <button
            onClick={async () => {
              const testJobId = nonCompletedJobIds[0];
              console.log(`🧪 [TEST] Manual API test for job ${testJobId}`);
              try {
                const startTime = Date.now();
                const response = await contentPipelineApi.getJob(testJobId);
                const endTime = Date.now();
                console.log(`✅ [TEST] Manual API call successful in ${endTime - startTime}ms`, response);
                alert(`✅ Manual API test successful! Job status: ${response.job.job_status}`);
              } catch (error) {
                console.error(`❌ [TEST] Manual API call failed:`, error);
                alert(`❌ Manual API test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
              }
            }}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
          >
            🧪 Test API Call
          </button>
        )}
      </div>

      {/* Status Display */}
      <div className="mb-4 p-3 bg-white rounded border">
        <h4 className="font-medium mb-2">Current Status</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <strong>Jobs List Loading:</strong> {isJobsListLoading ? 'Yes' : 'No'}
          </div>
          <div>
            <strong>Jobs List Refreshing:</strong> {isJobsListRefreshing ? 'Yes' : 'No'}
          </div>
          <div>
            <strong>Total Jobs:</strong> {jobs.length}
          </div>
          <div>
            <strong>Non-Completed Jobs:</strong> 
            <span className="ml-1 font-semibold text-green-600">
              {individualPollingInfo.totalNonCompleted}
            </span>
          </div>
        </div>
      </div>

      {/* Individual Polling Info */}
      <div className="mb-4 p-3 bg-green-50 rounded border border-green-200">
        <h4 className="font-medium mb-2 text-green-800">Individual Job Polling Status</h4>
        <div className="text-sm text-green-700 space-y-1">
          <div>
            <strong>Polling Enabled:</strong> 
            <span className={`ml-1 font-semibold ${individualPollingInfo.pollingEnabled ? 'text-green-600' : 'text-red-600'}`}>
              {individualPollingInfo.pollingEnabled ? 'YES' : 'NO'}
            </span>
            {!individualPollingInfo.pageAllowed && (
              <div className="text-xs text-orange-600 mt-1">
                ⚠️ Auto-refresh disabled: Page '{individualPollingInfo.currentPage}' not in allowed list {JSON.stringify(AppDataStoreConfig.ALLOWED_AUTO_REFRESH_PAGES)}
              </div>
            )}
          </div>
          <div>
            <strong>Jobs Being Polled:</strong> {individualPollingInfo.totalNonCompleted}
          </div>
          <div>
            <strong>Active Queries:</strong> {individualJobQueries.length}
          </div>
          <div>
            <strong>Currently Fetching:</strong> {individualJobQueries.filter(q => q.isFetching).length}
          </div>
          <div>
            <strong>Queries with Data:</strong> {individualJobQueries.filter(q => q.data).length}
          </div>
          {nonCompletedJobIds.length > 0 && (
            <div>
              <strong>Job IDs Being Polled:</strong> 
              <div className="mt-1 text-xs bg-white p-2 rounded border max-h-20 overflow-auto">
                {nonCompletedJobIds.join(', ')}
              </div>
            </div>
          )}
          <div className="mt-2 p-2 bg-green-100 rounded text-xs">
            <strong>How it works:</strong> Uses React Query's useQueries with refetchInterval to poll each non-completed job 
            individually every {AppDataStoreConfig.AUTO_REFRESH_INTERVALS.INDIVIDUAL_JOB}ms (5 seconds). 
            When a job becomes "completed", it automatically stops polling that specific job.
            This approach integrates with React Query's caching and provides proper query state management.
          </div>
        </div>
      </div>

      {/* Error Display */}
      {jobsListError && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded border">
          <strong>Error:</strong> {jobsListError.message}
        </div>
      )}

      {/* Jobs List */}
      <div className="bg-white p-3 rounded border max-h-96 overflow-auto">
        {isJobsListLoading ? (
          <div className="text-center py-4">Loading jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="text-gray-500 text-center py-4">No jobs found</div>
        ) : (
          <div>
            <div className="font-semibold mb-3">Jobs ({jobs.length}):</div>
            <div className="space-y-2">
              {jobs.map((job: any, idx: number) => (
                <div key={job.job_id || idx} className="p-2 bg-gray-50 rounded border">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">{job.app_name || 'Unnamed'}</div>
                      <div className="text-sm text-gray-600">
                        ID: {job.job_id}
                      </div>
                      <div className="text-xs text-gray-500">
                        Created: {job.created_at}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`px-2 py-1 rounded text-xs ${
                        job.job_status === 'completed' ? 'bg-green-100 text-green-800' :
                        job.job_status?.includes('failed') ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {job.job_status}
                      </span>
                      <div className="text-xs mt-1">
                        {(() => {
                          const isNonCompleted = nonCompletedJobIds.includes(job.job_id);
                          const queryIndex = nonCompletedJobIds.indexOf(job.job_id);
                          const query = queryIndex >= 0 ? individualJobQueries[queryIndex] : null;
                          
                          if (!isNonCompleted) {
                            return <span className="text-gray-500">⏹️ Not Polling</span>;
                          }
                          
                          if (!autoRefreshIndividual || !isAutoRefreshAllowedOnPage) {
                            if (!isAutoRefreshAllowedOnPage) {
                              return <span className="text-orange-500">⏸️ Page Not Allowed</span>;
                            }
                            return <span className="text-orange-500">⏸️ Polling Disabled</span>;
                          }
                          
                          if (!query) {
                            return <span className="text-gray-500">⏳ Initializing...</span>;
                          }
                          
                          if (query.isFetching) {
                            return <span className="text-blue-600 font-semibold">🌐 Fetching...</span>;
                          }
                          
                          if (query.error) {
                            return <span className="text-red-600 font-semibold">❌ Error</span>;
                          }
                          
                          if (query.data) {
                            const shouldStopPolling = ConfigHelpers.shouldJobNeverPoll(query.data.job_status);
                            if (shouldStopPolling) {
                              return <span className="text-gray-500">⏹️ Completed</span>;
                            }
                            return <span className="text-green-600 font-semibold">🔄 Polling (5s)</span>;
                          }
                          
                          return <span className="text-yellow-600">⏳ Loading...</span>;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
