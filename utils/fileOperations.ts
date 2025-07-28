import { contentPipelineApi } from '../web/utils/contentPipelineApi';

// Update file status using backend response as single source of truth
export const updateFileStatus = async (
  groupFilename: string,
  pdfFilename: string,
  status: 'uploading' | 'uploaded' | 'upload-failed'
): Promise<any> => {
  console.log('🔄 Updating status for', pdfFilename, 'in group', groupFilename, 'to', status);

  try {
    console.log(`📡 Calling backend API: updatePdfFileStatus(${groupFilename}, ${pdfFilename}, ${status})`);

    // Update backend first - this is our single source of truth
    const response = await contentPipelineApi.updatePdfFileStatus(groupFilename, pdfFilename, status);

    console.log(`✅ Backend API response for ${pdfFilename}:`, JSON.stringify(response, null, 2));

    // Check response structure in detail
    if (!response) {
      console.error('❌ Backend returned null/undefined response');
      throw new Error('Backend returned null response');
    }

    if (!response.file) {
      console.error('❌ Backend response missing "file" property:', response);
      throw new Error('Backend response missing file property');
    }

    if (!response.file.original_files) {
      console.error('❌ Backend response missing "original_files" property:', response.file);
      throw new Error('Backend response missing original_files property');
    }

    // Log the specific file status we're looking for
    const fileStatus = response.file.original_files[pdfFilename];
    console.log(`📋 Backend says ${pdfFilename} status is:`, fileStatus);

    console.log('✅ File status updated successfully in backend for', groupFilename);
    
    return response.file; // Return the updated file data
    
  } catch (error) {
    console.error(`❌ Failed to update ${pdfFilename} status in backend:`, error);
    throw error; // Re-throw so caller knows the update failed
  }
};

// Utility functions for job data manipulation
export const getJobDisplayName = (jobData: any) => {
  if (!jobData?.job_id) return 'Unknown Job';
  return jobData.job_id;
};

export const getJobTitle = (jobData: any) => {
  if (!jobData) return 'Loading...';
  const parts = [
    jobData.app_name,
    jobData.release_name,
    jobData.subset_name || jobData.Subset_name
  ].filter(Boolean);
  return parts.join(' - ') || 'Unknown Job';
};

// File validation utilities
export const validateFileData = (fileData: any): boolean => {
  return fileData && 
         typeof fileData === 'object' && 
         Array.isArray(fileData) && 
         fileData.length >= 0;
};

export const sanitizeAppName = (str: string): string => {
  return str.trim().replace(/[^a-zA-Z0-9\-_]/g, '-').replace(/-+/g, '-');
};

// Create file mapping utilities
export const createFileNameToBaseMap = (files: File[]): Map<string, string> => {
  const fileNameToBaseMap = new Map<string, string>();
  files.forEach((file: File) => {
    const fileName = file.name;
    // Extract base name by removing _FR.pdf, _BK.pdf, etc.
    const baseName = fileName.replace(/_(FR|BK|FRONT|BACK)\.pdf$/i, '');
    fileNameToBaseMap.set(fileName, baseName);
  });
  return fileNameToBaseMap;
};

export const groupFilesByBaseName = (files: File[]): Map<string, {name: string, type: 'front' | 'back'}[]> => {
  const fileNameToBaseMap = createFileNameToBaseMap(files);
  const fileGroups = new Map<string, {name: string, type: 'front' | 'back'}[]>();
  
  files.forEach((file: File) => {
    const fileName = file.name;
    const baseName = fileNameToBaseMap.get(fileName);
    if (!baseName) return;
    
    // Determine card type based on filename
    let cardType: 'front' | 'back' = 'front';
    if (fileName.match(/_(BK|BACK)\.pdf$/i)) {
      cardType = 'back';
    } else if (fileName.match(/_(FR|FRONT)\.pdf$/i)) {
      cardType = 'front';
    }
    
    if (!fileGroups.has(baseName)) {
      fileGroups.set(baseName, []);
    }
    fileGroups.get(baseName)!.push({name: fileName, type: cardType});
  });
  
  return fileGroups;
};

// Loading step management
export const getTotalLoadingSteps = (jobStatus?: string): number => {
  const isExtracted = jobStatus?.toLowerCase() === 'extracted';
  return isExtracted ? 4 : 2; // 1-2 for basic loading, 3-4 for extracted jobs with PSD loading
};

export const getLoadingStepInfo = (
  step: number, 
  jobStatus?: string, 
  fileCount?: number
): { message: string; detail: string } => {
  const isExtracted = jobStatus?.toLowerCase() === 'extracted';
  
  switch (step) {
    case 1:
      return {
        message: 'Loading job details...',
        detail: 'Fetching job information'
      };
    case 2:
      return {
        message: 'Loading files...',
        detail: `Fetching ${fileCount || 0} file objects`
      };
    case 3:
      if (isExtracted) {
        return {
          message: 'Loading PSD templates...',
          detail: 'Fetching available physical PSD files'
        };
      }
      return {
        message: 'Files loaded successfully',
        detail: `${fileCount || 0} files ready`
      };
    case 4:
      return {
        message: 'Loading PSD data...',
        detail: 'Parsing template layers and colors'
      };
    default:
      return {
        message: 'Loading...',
        detail: 'Processing request'
      };
  }
};

// Error handling utilities
export const createApiError = (message: string, response?: Response): Error => {
  const error = new Error(message);
  if (response) {
    (error as any).status = response.status;
    (error as any).statusText = response.statusText;
  }
  return error;
};

export const handleApiResponse = async (response: Response): Promise<any> => {
  if (!response.ok) {
    let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.message) {
        errorMessage += ` - ${errorData.message}`;
      }
    } catch (e) {
      // Ignore JSON parse errors for error responses
    }
    throw createApiError(errorMessage, response);
  }
  
  return response.json();
}; 

/**
 * UI Status Filtering Utilities
 * Maps UI-level status concepts to actual job statuses for filtering
 */

export type UIStatusFilter = 'all' | 'in-progress' | 'completed';

/**
 * Map UI status filter to actual job statuses
 */
export const getJobStatusesForUIFilter = (uiStatus: UIStatusFilter): string[] | null => {
  switch (uiStatus) {
    case 'in-progress':
      return [
        'uploading',
        'extracting', 
        'generating'
      ];
    case 'completed':
      return [
        'uploaded',
        'extracted',
        'generated',
        'completed'
      ];
    case 'all':
    default:
      return null; // Return null to indicate no filtering needed
  }
};

/**
 * Check if a job status matches a UI status filter
 */
export const doesJobMatchUIStatusFilter = (jobStatus: string | undefined, uiFilter: UIStatusFilter): boolean => {
  if (!jobStatus || uiFilter === 'all') return true;
  
  const allowedStatuses = getJobStatusesForUIFilter(uiFilter);
  if (!allowedStatuses) return true;
  
  return allowedStatuses.includes(jobStatus.toLowerCase());
};

/**
 * Get display label for UI status filter
 */
export const getUIStatusFilterLabel = (uiStatus: UIStatusFilter): string => {
  switch (uiStatus) {
    case 'in-progress':
      return 'In Progress';
    case 'completed':
      return 'Completed';
    case 'all':
    default:
      return 'All Jobs';
  }
};

/**
 * Determine UI status category for a given job status
 */
export const getUIStatusFromJobStatus = (jobStatus: string | undefined): 'in-progress' | 'completed' | 'unknown' => {
  if (!jobStatus) return 'unknown';
  
  const lowerStatus = jobStatus.toLowerCase();
  
  if (['uploading', 'extracting', 'generating'].includes(lowerStatus)) {
    return 'in-progress';
  }
  
  if (['uploaded', 'extracted', 'generated', 'completed'].includes(lowerStatus)) {
    return 'completed';
  }
  
  return 'unknown';
}; 