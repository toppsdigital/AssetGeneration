// Types and interfaces for the centralized app data store
import { JobData, FileData } from '../web/utils/contentPipelineApi';

// Re-export imported types for use in other files
export type { FileData };

// Extended job data for UI needs
export interface UIJobData extends JobData {
  psd_file?: string;
  template?: string;
  total_files?: number;
  timestamp?: string;
  Subset_name?: string;
  job_path?: string;
  api_files?: string[];
  content_pipeline_files?: FileData[];
}

// Normalized data structure
export interface AppDataState {
  jobs: Record<string, UIJobData>;
  files: Record<string, FileData>;
  assets: Record<string, Record<string, any>>; // jobId -> assets
  metadata: {
    jobsList: {
      items: string[]; // job IDs
      totalCount: number;
      lastUpdated: string;
      filters?: {
        userFilter?: string;
        statusFilter?: string;
      };
    };
    downloadUrls: Record<string, {
      url: string;
      expires: string;
      created: string;
    }>;
  };
}

// Data store configuration
export interface DataStoreConfig {
  // Auto-refresh settings
  autoRefresh: {
    enabled: boolean;
    intervals: {
      activeJobs: number; // ms - for individual jobs that are not completed
      jobsList: number; // ms - for jobs list page (all filters)
    };
  };
  
  // Cache settings
  cache: {
    staleTime: {
      jobs: number;
      files: number;
      assets: number;
      jobsList: number;
    };
    gcTime: {
      jobs: number;
      files: number;
      assets: number;
      jobsList: number;
    };
  };
  
  // Retry settings
  retry: {
    attempts: number;
    backoffMultiplier: number;
  };
}

// Selectors for different UI use cases
export type DataSelector = 
  | 'jobs' 
  | 'jobDetails' 
  | 'jobFiles' 
  | 'jobAssets'
  | 'downloadUrl'
  | 'batchJobs'; // Batch fetch multiple jobs by IDs

export interface SelectorOptions {
  jobId?: string;
  jobIds?: string[]; // For batch job requests ('batchJobs' selector)
  filters?: {
    userFilter?: string;
    statusFilter?: string;
  };
  includeFiles?: boolean;
  includeAssets?: boolean;
  autoRefresh?: boolean;
  // When true with 'jobs' selector, automatically polls individual non-completed jobs every 5 seconds
  autoRefreshIndividualJobs?: boolean;
}

// Mutation types
export type MutationType = 
  | 'createJob'
  | 'rerunJob'
  | 'updateJob' 
  | 'deleteJob'
  | 'createFiles'
  | 'batchGetFiles'
  | 'updateFile'
  | 'updateFileStatus'
  | 'updatePdfFileStatus'
  | 'batchUpdatePdfFileStatus'
  | 'createAsset'
  | 'updateAsset'
  | 'deleteAsset'
  | 'deleteAllAssets'
  | 'bulkUpdateAssets'
  | 'generateAssets'
  | 'regenerateAssets'
  | 'extractPdfData'
  | 'refreshDownloadUrl';

export interface MutationPayload {
  type: MutationType;
  jobId?: string;
  fileId?: string;
  assetId?: string;
  data?: any;
}

// Loading and error states
export interface DataStoreState {
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  lastUpdated: string | null;
}

// Hook return type
export interface AppDataStoreReturn<T = any> {
  // Data
  data: T;
  
  // State
  isLoading: boolean;
  isRefreshing: boolean;
  isMutating: boolean;
  error: Error | null;
  
  // Actions
  refresh: () => Promise<void>;
  mutate: (payload: MutationPayload) => Promise<any>;
  invalidate: (selector?: DataSelector, options?: SelectorOptions) => void;
  
  // Cache management
  clearCache: (selector?: DataSelector) => void;
  preloadData: (selector: DataSelector, options: SelectorOptions) => Promise<void>;
  
  // Force refresh for specific events
  forceRefreshJobsList: () => Promise<void>;
  
  // Auto-refresh status (handled internally by React Query)
  isAutoRefreshActive: boolean;
}

// Job status categories for refresh logic
export const JOB_STATUS_CATEGORIES = {
  ACTIVE: ['uploading', 'uploaded', 'extracting', 'generating'] as const,
  TERMINAL: ['completed', 'extracted', 'generated', 'upload-failed', 'extraction-failed', 'generation-failed'] as const,
  FAILED: ['upload-failed', 'extraction-failed', 'generation-failed'] as const,
  NO_REFRESH: ['completed'] as const, // Jobs that should never be auto-refreshed
} as const;

export type ActiveJobStatus = typeof JOB_STATUS_CATEGORIES.ACTIVE[number];
export type TerminalJobStatus = typeof JOB_STATUS_CATEGORIES.TERMINAL[number];
export type FailedJobStatus = typeof JOB_STATUS_CATEGORIES.FAILED[number];
export type NoRefreshJobStatus = typeof JOB_STATUS_CATEGORIES.NO_REFRESH[number];

// Note: Default configuration is now imported from config file
// See hooks/useAppDataStore.config.ts to modify intervals and settings
export const DEFAULT_DATA_STORE_CONFIG: DataStoreConfig = {
  autoRefresh: {
    enabled: true,
    intervals: {
      activeJobs: 5000, // Will be overridden by config file
      jobsList: 30000, // Will be overridden by config file
    },
  },
  cache: {
    staleTime: {
      jobs: 30 * 1000, // Will be overridden by config file
      files: 15 * 1000, // Will be overridden by config file  
      assets: 60 * 1000, // Will be overridden by config file
      jobsList: 10 * 1000, // Will be overridden by config file
    },
    gcTime: {
      jobs: 5 * 60 * 1000, // Will be overridden by config file
      files: 3 * 60 * 1000, // Will be overridden by config file
      assets: 10 * 60 * 1000, // Will be overridden by config file
      jobsList: 5 * 60 * 1000, // Will be overridden by config file
    },
  },
  retry: {
    attempts: 3, // Will be overridden by config file
    backoffMultiplier: 1.5, // Will be overridden by config file
  },
};
