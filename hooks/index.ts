// Upload management hooks
export { useFileUpload } from './useFileUpload';
export { useUploadEngine } from './useUploadEngine';
export { useJobDetailsData } from './useJobDetailsData';
export { useFileManager } from './useFileManager';
export { usePSDTemplateManager } from './usePSDTemplateManager';
export { useLoadingStateManager } from './useLoadingStateManager';

// Job data hooks (from web/hooks)
export { 
  useJobData, 
  useJobFiles, 
  useUpdateJobStatus, 
  createJobDataFromParams,
  jobKeys 
} from '../web/hooks/useJobData';

// NEW: Centralized App Data Store
export { useAppDataStore, dataStoreKeys } from './useAppDataStore';
export { useJobsWithIndividualPolling } from './useJobsWithIndividualPolling';
export type { 
  AppDataStoreReturn,
  DataSelector,
  SelectorOptions,
  MutationPayload,
  MutationType,
  UIJobData,
  DataStoreConfig
} from './useAppDataStore.types';

// Data store configuration
export { default as AppDataStoreConfig, ConfigHelpers } from './useAppDataStore.config';
export type { JobStatus, UserFilter, StatusFilter, ForceRefreshEvent } from './useAppDataStore.config';

// Data store utilities
export { 
  jobStatusUtils,
  fileUtils,
  jobProgressUtils,
  filterUtils,
  transformUtils,
  cacheUtils,
  performanceUtils,
  validationUtils
} from './useAppDataStore.utils';

// URL cache hook
// usePresignedUrlCache removed - uploads now use Content Pipeline API directly 