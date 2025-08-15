// Utility functions for the App Data Store
import { UIJobData, FileData, JOB_STATUS_CATEGORIES } from './useAppDataStore.types';

/**
 * Job status utilities
 */
export const jobStatusUtils = {
  isActive: (status: string): boolean => 
    JOB_STATUS_CATEGORIES.ACTIVE.includes(status as any),
  
  isTerminal: (status: string): boolean => 
    JOB_STATUS_CATEGORIES.TERMINAL.includes(status as any),
  
  isFailed: (status: string): boolean => 
    JOB_STATUS_CATEGORIES.FAILED.includes(status as any),
  
  isCompleted: (status: string): boolean => 
    status === 'completed' || status === 'extracted' || status === 'generated',
  
  shouldAutoRefresh: (status: string): boolean => 
    !JOB_STATUS_CATEGORIES.NO_REFRESH.includes(status as any),
  
  getStatusColor: (status: string): string => {
    if (jobStatusUtils.isCompleted(status)) return 'green';
    if (jobStatusUtils.isFailed(status)) return 'red';
    if (jobStatusUtils.isActive(status)) return 'yellow';
    return 'gray';
  },
  
  getStatusLabel: (status: string): string => {
    const statusMap: Record<string, string> = {
      'uploading': 'Uploading',
      'uploaded': 'Uploaded',
      'upload-failed': 'Upload Failed',
      'extracting': 'Extracting',
      'extracted': 'Extracted',
      'extraction-failed': 'Extraction Failed',
      'generating': 'Generating',
      'generated': 'Generated',
      'generation-failed': 'Generation Failed',
      'completed': 'Completed',
    };
    return statusMap[status] || status;
  }
};

/**
 * File utilities
 */
export const fileUtils = {
  getFilesByStatus: (files: FileData[], status: string): FileData[] => 
    files.filter(file => 
      Object.values(file.original_files || {}).some(f => f.status === status) ||
      Object.values(file.extracted_files || {}).some(f => f.status === status)
    ),
  
  getFileProgress: (file: FileData): { completed: number; total: number; percentage: number } => {
    const originalFiles = Object.values(file.original_files || {});
    const completedFiles = originalFiles.filter(f => f.status === 'uploaded').length;
    const totalFiles = originalFiles.length;
    const percentage = totalFiles > 0 ? Math.round((completedFiles / totalFiles) * 100) : 0;
    
    return { completed: completedFiles, total: totalFiles, percentage };
  },
  
  hasFailedFiles: (file: FileData): boolean => 
    Object.values(file.original_files || {}).some(f => f.status === 'upload-failed') ||
    Object.values(file.extracted_files || {}).some(f => f.status === 'upload-failed'),
  
  getFileTypeCounts: (files: FileData[]): { front: number; back: number; total: number } => {
    let front = 0;
    let back = 0;
    
    files.forEach(file => {
      Object.values(file.original_files || {}).forEach(f => {
        if (f.card_type === 'front') front++;
        if (f.card_type === 'back') back++;
      });
    });
    
    return { front, back, total: front + back };
  }
};

/**
 * Job progress utilities
 */
export const jobProgressUtils = {
  getOverallProgress: (job: UIJobData): { 
    percentage: number; 
    phase: string; 
    isComplete: boolean;
    hasErrors: boolean;
  } => {
    const status = job.job_status || '';
    
    // Phase mapping
    const phaseMap: Record<string, { phase: string; basePercentage: number }> = {
      'uploading': { phase: 'Uploading Files', basePercentage: 0 },
      'uploaded': { phase: 'Upload Complete', basePercentage: 33 },
      'extracting': { phase: 'Extracting Data', basePercentage: 33 },
      'extracted': { phase: 'Extraction Complete', basePercentage: 66 },
      'generating': { phase: 'Generating Assets', basePercentage: 66 },
      'generated': { phase: 'Assets Generated', basePercentage: 90 },
      'completed': { phase: 'Completed', basePercentage: 100 },
    };
    
    const phaseInfo = phaseMap[status] || { phase: 'Unknown', basePercentage: 0 };
    
    // Calculate detailed percentage for current phase
    let detailedPercentage = phaseInfo.basePercentage;
    
    if (status === 'uploading' && job.original_files_total_count && job.original_files_completed_count) {
      const uploadProgress = (job.original_files_completed_count / job.original_files_total_count) * 33;
      detailedPercentage = uploadProgress;
    }
    
    return {
      percentage: Math.min(detailedPercentage, 100),
      phase: phaseInfo.phase,
      isComplete: jobStatusUtils.isCompleted(status),
      hasErrors: jobStatusUtils.isFailed(status) || (job.original_files_failed_count || 0) > 0
    };
  },
  
  getFileUploadProgress: (job: UIJobData): {
    completed: number;
    total: number;
    failed: number;
    percentage: number;
  } => {
    const completed = job.original_files_completed_count || 0;
    const total = job.original_files_total_count || 0;
    const failed = job.original_files_failed_count || 0;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return { completed, total, failed, percentage };
  }
};

/**
 * Data filtering utilities
 */
export const filterUtils = {
  filterJobsByUser: (jobs: UIJobData[], userId?: string): UIJobData[] => 
    userId ? jobs.filter(job => job.user_id === userId) : jobs,
  
  filterJobsByStatus: (jobs: UIJobData[], statusFilter?: string): UIJobData[] => {
    if (!statusFilter) return jobs;
    
    switch (statusFilter) {
      case 'in-progress':
        return jobs.filter(job => jobStatusUtils.isActive(job.job_status || ''));
      case 'completed':
        return jobs.filter(job => jobStatusUtils.isCompleted(job.job_status || ''));
      case 'failed':
        return jobs.filter(job => jobStatusUtils.isFailed(job.job_status || ''));
      default:
        return jobs.filter(job => job.job_status === statusFilter);
    }
  },
  
  filterJobsByDateRange: (jobs: UIJobData[], startDate?: Date, endDate?: Date): UIJobData[] => {
    if (!startDate && !endDate) return jobs;
    
    return jobs.filter(job => {
      if (!job.created_at) return false;
      const jobDate = new Date(job.created_at);
      
      if (startDate && jobDate < startDate) return false;
      if (endDate && jobDate > endDate) return false;
      
      return true;
    });
  },
  
  searchJobs: (jobs: UIJobData[], searchTerm: string): UIJobData[] => {
    if (!searchTerm.trim()) return jobs;
    
    const term = searchTerm.toLowerCase();
    return jobs.filter(job => 
      job.app_name?.toLowerCase().includes(term) ||
      job.job_id?.toLowerCase().includes(term) ||
      job.filename_prefix?.toLowerCase().includes(term) ||
      job.source_folder?.toLowerCase().includes(term) ||
      job.description?.toLowerCase().includes(term)
    );
  }
};

/**
 * Cache key utilities
 */
export const cacheUtils = {
  generateJobCacheKey: (jobId: string, includeFiles = false, includeAssets = false): string => {
    const parts = ['job', jobId];
    if (includeFiles) parts.push('files');
    if (includeAssets) parts.push('assets');
    return parts.join('-');
  },
  
  generateJobsListCacheKey: (filters: Record<string, any>): string => {
    const sortedFilters = Object.keys(filters)
      .sort()
      .map(key => `${key}:${filters[key]}`)
      .join(',');
    return `jobs-list-${sortedFilters}`;
  },
  
  invalidateRelatedCaches: (queryClient: any, jobId: string) => {
    // This would be used to invalidate all caches related to a specific job
    const patterns = [
      ['datastore', 'jobs'],
      ['datastore', 'files', 'job', jobId],
      ['datastore', 'assets', 'job', jobId],
      ['datastore', 'downloads', 'job', jobId],
    ];
    
    patterns.forEach(pattern => {
      queryClient.invalidateQueries({ queryKey: pattern });
    });
  }
};

/**
 * Data transformation utilities
 */
export const transformUtils = {
  normalizeJobData: (apiJob: any): UIJobData => ({
    ...apiJob,
    api_files: apiJob.files || [],
    files: [],
    content_pipeline_files: [],
    Subset_name: apiJob.source_folder || '',
    assets: apiJob.assets || {}
  }),
  
  normalizeFileData: (apiFile: any): FileData => ({
    filename: apiFile.filename,
    job_id: apiFile.job_id,
    last_updated: apiFile.last_updated || new Date().toISOString(),
    original_files: apiFile.original_files || {},
    extracted_files: apiFile.extracted_files || {},
    firefly_assets: apiFile.firefly_assets || {}
  }),
  
  formatJobForDisplay: (job: UIJobData): {
    id: string;
    name: string;
    status: string;
    statusColor: string;
    progress: number;
    createdAt: string;
    filesCount: number;
    hasErrors: boolean;
  } => {
    const progress = jobProgressUtils.getOverallProgress(job);
    
    return {
      id: job.job_id || '',
      name: job.app_name || 'Unnamed Job',
      status: jobStatusUtils.getStatusLabel(job.job_status || ''),
      statusColor: jobStatusUtils.getStatusColor(job.job_status || ''),
      progress: progress.percentage,
      createdAt: job.created_at || '',
      filesCount: job.api_files?.length || 0,
      hasErrors: progress.hasErrors
    };
  }
};

/**
 * Performance utilities
 */
export const performanceUtils = {
  debounce: <T extends (...args: any[]) => any>(
    func: T,
    delay: number
  ): ((...args: Parameters<T>) => void) => {
    let timeoutId: NodeJS.Timeout;
    
    return (...args: Parameters<T>) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  },
  
  throttle: <T extends (...args: any[]) => any>(
    func: T,
    delay: number
  ): ((...args: Parameters<T>) => void) => {
    let isThrottled = false;
    
    return (...args: Parameters<T>) => {
      if (!isThrottled) {
        func(...args);
        isThrottled = true;
        setTimeout(() => {
          isThrottled = false;
        }, delay);
      }
    };
  },
  
  memoize: <T extends (...args: any[]) => any>(
    func: T,
    getKey?: (...args: Parameters<T>) => string
  ): T => {
    const cache = new Map();
    
    return ((...args: Parameters<T>) => {
      const key = getKey ? getKey(...args) : JSON.stringify(args);
      
      if (cache.has(key)) {
        return cache.get(key);
      }
      
      const result = func(...args);
      cache.set(key, result);
      return result;
    }) as T;
  }
};

/**
 * Validation utilities
 */
export const validationUtils = {
  isValidJobId: (jobId: string): boolean => 
    typeof jobId === 'string' && jobId.length > 0 && jobId.trim() !== '',
  
  isValidJobData: (job: any): job is UIJobData => 
    job && 
    typeof job === 'object' && 
    typeof job.job_id === 'string' && 
    typeof job.app_name === 'string',
  
  isValidFileData: (file: any): file is FileData => 
    file && 
    typeof file === 'object' && 
    typeof file.filename === 'string',
  
  validateMutationPayload: (payload: any): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    if (!payload.type) {
      errors.push('Mutation type is required');
    }
    
    // Add specific validation based on mutation type
    switch (payload.type) {
      case 'updateJob':
        if (!payload.jobId) errors.push('Job ID is required for updateJob');
        if (!payload.data) errors.push('Data is required for updateJob');
        break;
      case 'createFiles':
        if (!payload.data || !Array.isArray(payload.data)) {
          errors.push('File data array is required for createFiles');
        }
        break;
      // Add more validation as needed
    }
    
    return { isValid: errors.length === 0, errors };
  }
};
