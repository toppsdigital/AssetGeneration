'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAppDataStore } from '../hooks/useAppDataStore';
import AppDataStoreConfig from '../hooks/useAppDataStore.config';
import DataStoreDebugger from './DataStoreDebugger';
import JobsWithIndividualPollingTest from './JobsWithIndividualPollingTest';

function JobsListTest() {
  // State for filters
  const [userFilter, setUserFilter] = useState<'all' | 'my'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in-progress' | 'completed'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Build options for useAppDataStore (memoized to prevent infinite re-renders)
  const options = useMemo(() => ({
    filters: {
      ...(userFilter === 'my' && { userFilter: 'my' }),
      ...(statusFilter !== 'all' && { statusFilter }),
    },
    autoRefresh,
  }), [userFilter, statusFilter, autoRefresh]);

  const { 
    data: jobs, 
    isLoading, 
    isRefreshing, 
    error, 
    refresh,
    isAutoRefreshActive,
    forceRefreshJobsList
  } = useAppDataStore('jobs', options);

  // React Query now handles auto-refresh automatically via refetchInterval
  // No manual effects needed - just toggle autoRefresh in options

  return (
    <div className="border border-gray-300 rounded-lg p-4">
      <h3 className="text-xl font-semibold mb-4">Jobs List Test</h3>
      
      {/* Filter Controls */}
      <div className="mb-4 p-3 bg-gray-50 rounded">
        <h4 className="font-medium mb-3">Filters</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

          {/* Auto Refresh */}
          <div>
            <label className="block text-sm font-medium mb-1">Auto Refresh:</label>
            <label className="flex items-center p-2">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="mr-2"
              />
              Enable ({AppDataStoreConfig.AUTO_REFRESH_INTERVALS.JOBS_LIST}ms)
            </label>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mb-4 flex gap-2 flex-wrap">
        <button
          onClick={refresh}
          disabled={isLoading || isRefreshing}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {isRefreshing ? 'Refreshing...' : 'Manual Refresh'}
        </button>
        
        <button
          onClick={forceRefreshJobsList}
          disabled={isLoading}
          className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
        >
          Force Refresh (Events)
        </button>
      </div>

      {/* Status Display */}
      <div className="mb-4 p-3 bg-gray-100 rounded">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <strong>Loading:</strong> {isLoading ? 'Yes' : 'No'}
          </div>
          <div>
            <strong>Refreshing:</strong> {isRefreshing ? 'Yes' : 'No'}
          </div>
          <div>
            <strong>Auto Refresh:</strong> 
            <span className={`ml-1 ${isAutoRefreshActive ? 'text-green-600 font-medium' : 'text-gray-500'}`}>
              {isAutoRefreshActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div>
            <strong>Count:</strong> {jobs && Array.isArray(jobs) ? jobs.length : 0}
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          <strong>Error:</strong> {error.message}
        </div>
      )}

      {/* Results */}
      <div className="bg-gray-50 p-3 rounded max-h-96 overflow-auto">
        {isLoading ? (
          <div className="text-center py-4">Loading jobs...</div>
        ) : jobs && Array.isArray(jobs) ? (
          <div>
            <div className="font-semibold mb-3">Jobs ({jobs.length}):</div>
            {jobs.length === 0 ? (
              <div className="text-gray-500 text-center py-4">No jobs found</div>
            ) : (
              <div className="space-y-2">
                {jobs.map((job: any, idx: number) => (
                  <div key={job.job_id || idx} className="p-2 bg-white rounded border">
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
                      <span className={`px-2 py-1 rounded text-xs ${
                        job.job_status === 'completed' ? 'bg-green-100 text-green-800' :
                        job.job_status?.includes('failed') ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {job.job_status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4">No data available</div>
        )}
      </div>
    </div>
  );
}

export default function DataStoreTestPage() {
  const [testJobId, setTestJobId] = useState('');

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Jobs List Data Store Test</h1>
        <p className="text-gray-600">
          Test the jobs list functionality with different filters and auto-refresh settings.
        </p>
      </div>

      {/* Simple Config Info */}
      <div className="mb-6 p-3 bg-blue-50 rounded-lg">
        <h3 className="font-medium mb-2">Auto-Refresh Configuration:</h3>
        <div className="text-sm text-gray-600 space-y-1">
          <div>• Jobs List: <strong>{AppDataStoreConfig.AUTO_REFRESH_INTERVALS.JOBS_LIST}ms</strong> ({AppDataStoreConfig.AUTO_REFRESH_INTERVALS.JOBS_LIST / 1000}s) - All jobs regardless of status</div>
          <div>• Individual Jobs: <strong>{AppDataStoreConfig.AUTO_REFRESH_INTERVALS.INDIVIDUAL_JOB}ms</strong> ({AppDataStoreConfig.AUTO_REFRESH_INTERVALS.INDIVIDUAL_JOB / 1000}s) - Non-completed jobs only</div>
          <div>• Configuration file: <code>hooks/useAppDataStore.config.ts</code></div>
        </div>
      </div>

      {/* NEW: Automatic Individual Job Polling Test */}
      <JobsWithIndividualPollingTest />

      {/* Main Test Component */}
      <div className="mt-6">
        <JobsListTest />
      </div>

      {/* Debugger Component - TEMPORARILY DISABLED */}
      {/* <DataStoreDebugger selector="jobs" /> */}

      {/* Individual Job Test */}
      <div className="mt-6 p-4 bg-green-50 rounded-lg">
        <h3 className="font-medium mb-3">Manual Individual Job Auto-Refresh Test</h3>
        <p className="text-sm text-gray-600 mb-3">
          (Use the automatic polling test above instead - this is for manual testing specific job IDs)
        </p>
        <div className="mb-3">
          <label className="block text-sm font-medium mb-1">
            Enter Job ID to test individual job auto-refresh:
          </label>
          <input
            type="text"
            value={testJobId}
            onChange={(e) => setTestJobId(e.target.value)}
            placeholder="Enter a job ID with 'uploading' status..."
            className="w-full p-2 border border-gray-300 rounded"
          />
        </div>
        
        {/* Debugger temporarily disabled to isolate infinite loop issue */}
        {/* {testJobId && (
          <DataStoreDebugger selector="jobDetails" jobId={testJobId} />
        )} */}
        
        {testJobId && (
          <div className="p-3 bg-blue-50 rounded border">
            <div className="text-sm">Testing job ID: <strong>{testJobId}</strong></div>
            <div className="text-xs text-gray-600 mt-1">
              DataStoreDebugger temporarily disabled to isolate infinite loop issue.
              Check console for polling logs instead.
            </div>
          </div>
        )}
      </div>

      {/* Usage Notes */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-medium mb-2">Test Instructions:</h3>
        <div className="text-sm text-gray-600 space-y-2">
          <div className="font-medium text-blue-700">🚀 NEW: Automatic Individual Job Polling (Top Section)</div>
          <div className="ml-4 space-y-1">
            <div>• Automatically detects non-completed jobs from the jobs list</div>
            <div>• Starts polling each non-completed job individually every 5 seconds</div>
            <div>• Stops polling when jobs become "completed"</div>
            <div>• No manual job ID entry required!</div>
          </div>
          
          <div className="font-medium text-gray-700 mt-3">📋 Basic Testing</div>
          <div className="ml-4 space-y-1">
            <div>• Change filters to test different API calls</div>
            <div>• Toggle auto-refresh settings to test polling behavior</div>
            <div>• Use "Force Refresh" to simulate events (new job, rerun, etc.)</div>
            <div>• Check browser console for detailed polling logs</div>
            <div>• Monitor React Query DevTools for cache behavior</div>
          </div>
          
          <div className="font-medium text-green-700 mt-3">🔍 Manual Testing (Lower Sections)</div>
          <div className="ml-4 space-y-1">
            <div>• Use the manual job ID entry for testing specific jobs</div>
            <div>• Use the debugger sections to see real-time auto-refresh status</div>
          </div>
        </div>
      </div>
    </div>
  );
}
