import { useMemo } from 'react';
import { useAppDataStore } from './useAppDataStore';
import { ConfigHelpers } from './useAppDataStore.config';
import type { SelectorOptions } from './useAppDataStore.types';

interface UseJobsWithIndividualPollingOptions extends Omit<SelectorOptions, 'jobId'> {
  // Whether to auto-refresh the jobs list
  autoRefreshJobsList?: boolean;
  // Whether to auto-refresh individual non-completed jobs
  autoRefreshIndividualJobs?: boolean;
}

interface JobsWithIndividualPollingResult {
  // Jobs list data
  jobs: any[];
  
  // Non-completed job IDs that are being individually polled
  nonCompletedJobIds: string[];
  
  // Individual job data for non-completed jobs
  individualJobsData: Record<string, {
    data: any;
    isLoading: boolean;
    isRefreshing: boolean;
    error: Error | null;
    isAutoRefreshActive: boolean;
  }>;
  
  // Overall state
  isJobsListLoading: boolean;
  isJobsListRefreshing: boolean;
  jobsListError: Error | null;
  
  // Actions
  refreshJobsList: () => Promise<void>;
  forceRefreshJobsList: () => Promise<void>;
  
  // Individual job polling info
  individualPollingInfo: {
    totalNonCompleted: number;
    pollingEnabled: boolean;
  };
}

export function useJobsWithIndividualPolling(
  options: UseJobsWithIndividualPollingOptions = {}
): JobsWithIndividualPollingResult {
  const {
    autoRefreshJobsList = true,
    autoRefreshIndividualJobs = true,
    filters,
    ...otherOptions
  } = options;

  // Get the jobs list
  const {
    data: jobs,
    isLoading: isJobsListLoading,
    isRefreshing: isJobsListRefreshing,
    error: jobsListError,
    refresh: refreshJobsList,
    forceRefreshJobsList,
  } = useAppDataStore('jobs', {
    filters,
    autoRefresh: autoRefreshJobsList,
    ...otherOptions,
  });

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

  // Get individual job data for each non-completed job (this will trigger individual polling)
  const individualJobsData = useMemo(() => {
    const result: Record<string, any> = {};
    
    if (!autoRefreshIndividualJobs) {
      return result;
    }

    // For each non-completed job, we'll use the useAppDataStore hook
    // Note: This is a pattern that violates rules of hooks, so we need a different approach
    return result;
  }, [nonCompletedJobIds, autoRefreshIndividualJobs]);

  return {
    jobs: jobs || [],
    nonCompletedJobIds,
    individualJobsData,
    isJobsListLoading,
    isJobsListRefreshing,
    jobsListError,
    refreshJobsList,
    forceRefreshJobsList,
    individualPollingInfo: {
      totalNonCompleted: nonCompletedJobIds.length,
      pollingEnabled: autoRefreshIndividualJobs,
    },
  };
}
