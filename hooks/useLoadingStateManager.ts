import { useState, useEffect } from 'react';
import { UIJobData } from '../types';

interface UseLoadingStateManagerProps {
  isLoadingJob: boolean;
  isLoadingFiles: boolean;
  jobData: UIJobData | null;
  fileData: any[];
  filesLoaded: boolean;
  createFiles?: string | null;
}

export const useLoadingStateManager = ({
  isLoadingJob,
  isLoadingFiles,
  jobData,
  fileData,
  filesLoaded,
  createFiles
}: UseLoadingStateManagerProps) => {
  // Legacy state variables still needed by existing components
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(1);
  const [loadingMessage, setLoadingMessage] = useState('Initializing...');
  const [loadingDetail, setLoadingDetail] = useState<string | undefined>(undefined);

  // Calculate total loading steps based on job status
  const getTotalLoadingSteps = () => {
    const isExtracted = jobData?.job_status?.toLowerCase() === 'extracted';
    return isExtracted ? 4 : 2; // 1-2 for basic loading, 3-4 for extracted jobs with PSD loading
  };

  // Sync legacy state with React Query state - ONLY when NOT in create mode
  useEffect(() => {
    // Skip sync when in create mode to avoid conflicts with createNewFiles()
    if (createFiles === 'true') {
      console.log('🔄 Skipping legacy state sync - in create mode');
      return;
    }
    
    // Update file loading states based on React Query
    const hasFiles = fileData.length > 0;
    const shouldMarkFilesLoaded = !isLoadingFiles && (hasFiles || (jobData && (!jobData.api_files || jobData.api_files.length === 0)));
    
    console.log('🔄 Syncing legacy state (fetch mode):', {
      isLoadingFiles,
      fileDataLength: fileData.length,
      hasApiFiles: jobData?.api_files?.length || 0,
      shouldMarkFilesLoaded,
      currentFilesLoaded: filesLoaded
    });
    
    // Sync loading state
    setLoading(isLoadingJob && !jobData);
    
    // Update loading steps and messages based on React Query state
    if (isLoadingJob && !jobData) {
      setLoadingStep(1);
      setLoadingMessage('Loading job details...');
      setLoadingDetail('Fetching job information');
    } else if (isLoadingFiles) {
      setLoadingStep(2);
      setLoadingMessage('Loading files...');
      setLoadingDetail(`Fetching ${jobData?.api_files?.length || 0} file objects`);
    } else if (shouldMarkFilesLoaded) {
      const isExtracted = jobData?.job_status?.toLowerCase() === 'extracted';
      setLoadingStep(isExtracted ? 4 : 2);
      setLoadingMessage(isExtracted ? 'Ready for PSD selection' : 'Files loaded successfully');
      setLoadingDetail(`${fileData.length} files ready`);
    }
  }, [createFiles, isLoadingFiles, fileData, isLoadingJob, jobData, filesLoaded]);

  // Update loading steps for PSD operations
  const updateLoadingForPSD = (step: number, message: string, detail?: string) => {
    if (jobData?.job_status?.toLowerCase() === 'extracted') {
      setLoadingStep(step);
      setLoadingMessage(message);
      setLoadingDetail(detail);
    }
  };

  // Update loading steps for file operations
  const updateLoadingForFiles = (step: number, message: string, detail?: string) => {
    setLoadingStep(step);
    setLoadingMessage(message);
    setLoadingDetail(detail);
  };

  return {
    // State
    loading,
    loadingStep,
    loadingMessage,
    loadingDetail,
    
    // Setters
    setLoading,
    setLoadingStep,
    setLoadingMessage,
    setLoadingDetail,
    
    // Functions
    getTotalLoadingSteps,
    updateLoadingForPSD,
    updateLoadingForFiles
  };
};
