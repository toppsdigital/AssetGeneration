'use client';

import { LoadingProgress } from './skeletons/LoadingProgress';
import { FileCardSkeleton } from './skeletons/FileCardSkeleton';
import FileCard from './FileCard';
import { getTotalLoadingSteps, getLoadingStepInfo } from '../utils/fileOperations';

interface FilesSectionProps {
  mergedJobData: any;
  jobData: any;
  uploadingFiles: Set<string>;
  loadingFiles: boolean;
  filesLoaded: boolean;
  loadingStep: number;
  loadingMessage: string;
  loadingDetail?: string;
  className?: string;
}

export const FilesSection = ({
  mergedJobData,
  jobData,
  uploadingFiles,
  loadingFiles,
  filesLoaded,
  loadingStep,
  loadingMessage,
  loadingDetail,
  className = ''
}: FilesSectionProps) => {
  // Debug file data flow to FileCard
  console.log('🔍 FilesSection Data Flow Debug:', {
    timestamp: new Date().toISOString(),
    mergedJobDataFilesCount: mergedJobData?.content_pipeline_files?.length || 0,
    uploadingFilesCount: uploadingFiles.size,
    uploadingFilesList: Array.from(uploadingFiles),
    mergedJobDataSample: mergedJobData?.content_pipeline_files?.[0] ? {
      filename: mergedJobData.content_pipeline_files[0].filename,
      originalFilesCount: Object.keys(mergedJobData.content_pipeline_files[0].original_files || {}).length,
      lastUpdated: mergedJobData.content_pipeline_files[0].last_updated
    } : 'no files'
  });
  const shouldShowLoading = () => {
    // Show loading only while we truly await data; if we already have content_pipeline_files, don't mask them
    if (mergedJobData?.content_pipeline_files && mergedJobData.content_pipeline_files.length > 0) return false;
    return (loadingFiles) || (!filesLoaded && (mergedJobData?.api_files?.length || 0) > 0);
  };

  const getEmptyStateMessage = () => {
    if (loadingFiles || shouldShowLoading()) {
      return 'Loading files...';
    } else if (filesLoaded && (!mergedJobData?.content_pipeline_files || mergedJobData.content_pipeline_files.length === 0)) {
      return 'No files available for this job.';
    } else if (!filesLoaded && !loadingFiles && !shouldShowLoading()) {
      return 'Files not loaded yet.';
    } else {
      return 'Loading files...';
    }
  };

  return (
    <div className={className} style={{ marginTop: 32 }}>
      <h2 style={{
        fontSize: '1.5rem',
        fontWeight: 600,
        color: '#f8f8f8',
        marginBottom: 24
      }}>
        📁 Files ({mergedJobData?.content_pipeline_files?.length || 0})
      </h2>

      {shouldShowLoading() ? (
        <div style={{
          transition: 'opacity 0.3s ease',
          opacity: 1
        }}>
          <LoadingProgress
            step={loadingFiles ? loadingStep : 1}
            totalSteps={getTotalLoadingSteps(mergedJobData?.job_status)}
            message={loadingFiles ? loadingMessage : 'Preparing to load files...'}
            detail={loadingFiles ? loadingDetail : `Getting ready to process ${mergedJobData?.api_files?.length || 0} files`}
          />
          
          {/* File Skeletons while loading */}
          <div style={{ 
            marginTop: 32,
            display: 'flex', 
            flexDirection: 'column', 
            gap: 24,
            opacity: 0.6,
            transition: 'opacity 0.3s ease'
          }}>
            {[0, 1, 2].map((index) => (
              <FileCardSkeleton key={index} index={index} />
            ))}
          </div>
        </div>
      ) : (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: 24,
          transition: 'opacity 0.3s ease',
          opacity: 1,
          animation: 'fadeIn 0.3s ease-in'
        }}>
          {mergedJobData?.content_pipeline_files && mergedJobData.content_pipeline_files.length > 0 ? (
            mergedJobData.content_pipeline_files
              .sort((a: any, b: any) => a.filename.toLowerCase().localeCompare(b.filename.toLowerCase()))
              .map((file: any, index: number) => (
              <FileCard 
                key={index} 
                file={file} 
                index={index}
                jobData={jobData}
                uploadingFiles={uploadingFiles}
              />
            ))
          ) : (
            <div style={{
              textAlign: 'center',
              padding: '24px 0',
              color: '#9ca3af',
              fontSize: 14
            }}>
              {getEmptyStateMessage()}
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          0% {
            opacity: 0;
            transform: translateY(10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}; 