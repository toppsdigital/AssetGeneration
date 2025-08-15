'use client';

import React, { useEffect, useState } from 'react';
import { useAppDataStore } from '../hooks/useAppDataStore';
import AppDataStoreConfig from '../hooks/useAppDataStore.config';

interface DataStoreDebuggerProps {
  jobId?: string;
  selector?: 'jobs' | 'jobDetails';
}

export default function DataStoreDebugger({ jobId, selector = 'jobs' }: DataStoreDebuggerProps) {
  const [debugInfo, setDebugInfo] = useState<any>({});

  const options = selector === 'jobDetails' && jobId 
    ? { jobId, autoRefresh: true }
    : { autoRefresh: true };

  const { 
    data, 
    isLoading, 
    isRefreshing, 
    error,
    isAutoRefreshActive 
  } = useAppDataStore(selector, options);

  useEffect(() => {
    const info: any = {
      selector,
      isLoading,
      isRefreshing,
      isAutoRefreshActive,
      hasData: !!data,
      hasError: !!error,
      config: {
        autoRefreshEnabled: AppDataStoreConfig.AUTO_REFRESH_INTERVALS,
        debugLoggingEnabled: AppDataStoreConfig.DEBUG_CONFIG.ENABLE_AUTO_REFRESH_LOGGING,
      }
    };

    if (selector === 'jobDetails' && data) {
      const job = data as any;
      info.jobData = {
        jobId: job.job_id,
        status: job.job_status,
        appName: job.app_name,
        isInActivePolling: AppDataStoreConfig.JOB_STATUS_CONFIG.ACTIVE_POLLING_STATUSES.includes(job.job_status),
        isInNoPoll: AppDataStoreConfig.JOB_STATUS_CONFIG.NO_POLLING_STATUSES.includes(job.job_status),
      };
    }

    if (selector === 'jobs' && data) {
      info.jobsData = {
        count: Array.isArray(data) ? data.length : 0,
        firstFewJobs: Array.isArray(data) ? data.slice(0, 3).map((job: any) => ({
          id: job.job_id,
          status: job.job_status,
          appName: job.app_name
        })) : []
      };
    }

    // Only update state if the info has actually changed
    setDebugInfo(prevInfo => {
      const infoString = JSON.stringify(info);
      const prevInfoString = JSON.stringify(prevInfo);
      
      if (infoString === prevInfoString) {
        return prevInfo; // No change, don't trigger re-render
      }
      
      return { ...info, timestamp: new Date().toISOString() }; // Add timestamp only when updating
    });
  }, [selector, isLoading, isRefreshing, isAutoRefreshActive, data, error, jobId]);

  return (
    <div className="mt-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
      <h3 className="font-semibold text-yellow-800 mb-3">
        🐛 Data Store Debugger - {selector}
        {jobId && ` (Job: ${jobId})`}
      </h3>
      
      <div className="space-y-3">
        {/* Real-time Status */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <div>
            <strong>Loading:</strong> 
            <span className={isLoading ? 'text-orange-600' : 'text-green-600'}>
              {isLoading ? ' Yes' : ' No'}
            </span>
          </div>
          <div>
            <strong>Refreshing:</strong> 
            <span className={isRefreshing ? 'text-blue-600' : 'text-gray-600'}>
              {isRefreshing ? ' Yes' : ' No'}
            </span>
          </div>
          <div>
            <strong>Auto-Refresh:</strong> 
            <span className={isAutoRefreshActive ? 'text-green-600 font-semibold' : 'text-red-600'}>
              {isAutoRefreshActive ? ' ACTIVE' : ' INACTIVE'}
            </span>
          </div>
          <div>
            <strong>Has Data:</strong> 
            <span className={debugInfo.hasData ? 'text-green-600' : 'text-gray-600'}>
              {debugInfo.hasData ? ' Yes' : ' No'}
            </span>
          </div>
        </div>

        {/* Configuration Check */}
        <div className="p-2 bg-white rounded border text-xs">
          <div className="font-medium mb-1">Configuration Status:</div>
          <div className="space-y-1">
            <div>Jobs List Interval: <strong>{AppDataStoreConfig.AUTO_REFRESH_INTERVALS.JOBS_LIST}ms</strong></div>
            <div>Individual Job Interval: <strong>{AppDataStoreConfig.AUTO_REFRESH_INTERVALS.INDIVIDUAL_JOB}ms</strong></div>
            <div>Debug Logging: <strong>{AppDataStoreConfig.DEBUG_CONFIG.ENABLE_AUTO_REFRESH_LOGGING ? 'ON' : 'OFF'}</strong></div>
            <div>Auto-Refresh Enabled: <strong>{options.autoRefresh ? 'YES' : 'NO'}</strong></div>
          </div>
        </div>

        {/* Job-specific Debug Info */}
        {debugInfo.jobData && (
          <div className="p-2 bg-white rounded border text-xs">
            <div className="font-medium mb-1">Individual Job Polling Analysis:</div>
            <div className="space-y-1">
              <div>Status: <strong>{debugInfo.jobData.status}</strong></div>
              <div>Should Poll: 
                <span className={!debugInfo.jobData.isInNoPoll ? 'text-green-600 font-semibold' : 'text-red-600'}>
                  {!debugInfo.jobData.isInNoPoll ? ' YES (every 5 seconds)' : ' NO (completed job)'}
                </span>
              </div>
              <div>Is Completed: 
                <span className={debugInfo.jobData.isInNoPoll ? 'text-orange-600' : 'text-green-600'}>
                  {debugInfo.jobData.isInNoPoll ? ' YES' : ' NO'}
                </span>
              </div>
              <div className="mt-1 p-1 bg-gray-50 rounded">
                <div className="font-medium text-xs">Polling Logic:</div>
                <div className="text-xs text-gray-600">
                  • Non-completed jobs: Poll every 5 seconds<br/>
                  • Completed jobs: Stop polling
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Jobs List Debug Info */}
        {debugInfo.jobsData && (
          <div className="p-2 bg-white rounded border text-xs">
            <div className="font-medium mb-1">Jobs List Info:</div>
            <div>Total Jobs: <strong>{debugInfo.jobsData.count}</strong></div>
            {debugInfo.jobsData.firstFewJobs.length > 0 && (
              <div className="mt-1">
                <div className="font-medium">Sample Jobs:</div>
                {debugInfo.jobsData.firstFewJobs.map((job: any, idx: number) => (
                  <div key={idx} className="ml-2">
                    • {job.appName} ({job.status})
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Error Info */}
        {error && (
          <div className="p-2 bg-red-100 text-red-700 rounded border text-xs">
            <div className="font-medium">Error:</div>
            <div>{error.message}</div>
          </div>
        )}

        {/* Instructions */}
        <div className="p-2 bg-blue-50 text-blue-700 rounded border text-xs">
          <div className="font-medium mb-1">Debug Instructions:</div>
          <div className="space-y-1">
            <div>• Open browser console to see detailed auto-refresh logs</div>
            <div>• If auto-refresh is INACTIVE, check the console for why it's not starting</div>
            <div>• If no logs appear, debug logging might be disabled</div>
            <div>• For jobs list: Auto-refresh should always be ACTIVE when enabled</div>
            <div>• For job details: Auto-refresh depends on job status configuration</div>
          </div>
        </div>
      </div>
    </div>
  );
}
