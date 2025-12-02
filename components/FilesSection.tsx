'use client';

import { useState } from 'react';
import { LoadingProgress } from './skeletons/LoadingProgress';
import { FileCardSkeleton } from './skeletons/FileCardSkeleton';
import FileCard from './FileCard';
import { getTotalLoadingSteps, getLoadingStepInfo } from '../utils/fileOperations';
import { UploadLayersModal } from './UploadLayersModal';

interface FilesSectionProps {
  mergedJobData: any;
  jobData: any;
  isRefreshing?: boolean;
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
  isRefreshing = false,
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

  const [isUploadLayersOpen, setIsUploadLayersOpen] = useState(false);

  const handleConfirmUploadLayers = (files: File[], layerType: string, results: Array<{ file: File; matchStatus: 'matched' | 'unmatched' | 'ambiguous'; matchedCardId?: string; newFilename?: string; }>) => {
    // For now, just log selection and computed matches; integration with upload pipeline can hook here.
    console.log('📤 Upload layers confirmed:', {
      layerType,
      fileCount: files.length,
      matchedCount: results.filter(r => r.matchStatus === 'matched').length,
      unmatchedCount: results.filter(r => r.matchStatus !== 'matched').length,
      sample: results.slice(0, 5).map((r) => ({
        name: r.file.name,
        status: r.matchStatus,
        matchedCardId: r.matchedCardId,
        newFilename: r.newFilename
      }))
    });
    setIsUploadLayersOpen(false);
  };

  return (
    <div className={className} style={{ marginTop: 32, opacity: isRefreshing ? 0.5 : 1, pointerEvents: isRefreshing ? 'none' as any : 'auto', position: 'relative' }}>
      {isRefreshing && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.15)' }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={{
          fontSize: '1.5rem',
          fontWeight: 600,
          color: '#f8f8f8',
          margin: 0
        }}>
          📁 Files ({mergedJobData?.content_pipeline_files?.length || 0})
        </h2>
        <button
          onClick={() => setIsUploadLayersOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: '#2563eb',
            color: 'white',
            border: 'none',
            padding: '8px 12px',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600
          }}
        >
          ⬆️ Upload layers
        </button>
      </div>

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

      <UploadLayersModal
        isOpen={isUploadLayersOpen}
        onClose={() => setIsUploadLayersOpen(false)}
        onConfirm={handleConfirmUploadLayers}
        cardIds={Array.from(new Set(
          (mergedJobData?.content_pipeline_files || [])
            .map((f: any) => {
              const name = (f?.filename || '').replace(/^.*[\\/]/, '');
              const idx = name.lastIndexOf('.');
              const base = idx > 0 ? name.substring(0, idx) : name;
              const m = base.match(/(\d+)$/); // extract trailing numeric card_id like ..._7002
              return m ? m[1] : undefined;
            })
            .filter(Boolean)
        ))}
        fileRelease={
          (typeof jobData?.release_name === 'string' && jobData.release_name) ||
          (typeof jobData?.filename_prefix === 'string' && jobData.filename_prefix) ||
          ''
        }
      />
    </div>
  );
}; 