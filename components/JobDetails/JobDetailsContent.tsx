'use client';

import { useRouter } from 'next/navigation';
import { JobHeader, PSDTemplateSelector, DownloadSection, FilesSection } from '../';
import { UploadWarningBanner } from './UploadWarningBanner';
import { AssetCreationOverlay } from './AssetCreationOverlay';
import styles from '../../styles/Edit.module.css';
import { UIJobData } from '../../types';

interface JobDetailsContentProps {
  mergedJobData: UIJobData;
  jobData: UIJobData | null;
  uploadEngine: {
    uploadStarted: boolean;
    allFilesUploaded: boolean;
    totalPdfFiles: number;
    uploadedPdfFiles: number;
    uploadingFiles: Set<string>;
  };
  uploadsInProgress: boolean;
  creatingAssets: boolean;
  setCreatingAssets: (creating: boolean) => void;
  loadingFiles: boolean;
  filesLoaded: boolean;
  loadingStep: number;
  loadingMessage: string;
  loadingDetail?: string;
  loading: boolean;
  onJobDataUpdate: (updatedJobData: any) => void;
  updateJobDataForUpload: () => void; // Simplified to just refresh function
  refetchJobData: () => Promise<any>;
}

export const JobDetailsContent = ({
  mergedJobData,
  jobData,
  uploadEngine,
  uploadsInProgress,
  creatingAssets,
  setCreatingAssets,
  loadingFiles,
  filesLoaded,
  loadingStep,
  loadingMessage,
  loadingDetail,
  loading,
  onJobDataUpdate,
  updateJobDataForUpload,
  refetchJobData
}: JobDetailsContentProps) => {
  const router = useRouter();

  return (
    <div className={styles.pageContainer}>
      {/* Upload Warning Banner */}
      <UploadWarningBanner
        uploadedFiles={uploadEngine.uploadedPdfFiles}
        totalFiles={uploadEngine.totalPdfFiles}
        isVisible={uploadsInProgress}
      />
      
      <div className={styles.editContainer} style={uploadsInProgress ? { paddingTop: '60px' } : {}}>
        <main className={styles.mainContent}>
          <div style={{
            maxWidth: 1200,
            width: '100%',
            background: 'rgba(255, 255, 255, 0.06)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 16,
            padding: 32,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
          }}>
            
            {/* Job Header */}
            <JobHeader 
              jobData={mergedJobData}
              totalPdfFiles={uploadEngine.totalPdfFiles}
              uploadedPdfFiles={uploadEngine.uploadedPdfFiles}
              onRerunJob={mergedJobData && !uploadsInProgress ? () => {
                console.log('🔄 Rerun Job - Pre-filling form with job data:', {
                  job_id: mergedJobData.job_id,
                  app_name: mergedJobData.app_name,
                  filename_prefix: mergedJobData.filename_prefix,
                  description: mergedJobData.description
                });
                
                const queryParams = new URLSearchParams({
                  rerun: 'true',
                  sourceJobId: mergedJobData.job_id || '',
                  appName: mergedJobData.app_name || '',
                  filenamePrefix: mergedJobData.filename_prefix || '',
                  description: mergedJobData.description || ''
                });
                
                console.log('🔗 Rerun Navigation URL:', `/new-job?${queryParams.toString()}`);
                router.push(`/new-job?${queryParams.toString()}`);
              } : undefined}
            />

            {/* PSD Template Selector */}
            <PSDTemplateSelector
              jobData={jobData}
              mergedJobData={mergedJobData}
              isVisible={(() => {
                const shouldShow = (mergedJobData?.job_status?.toLowerCase() === 'extracted' || mergedJobData?.job_status?.toLowerCase() === 'generation-failed') && !loading && !loadingFiles;
                console.log('🔍 PSDTemplateSelector visibility check:', {
                  jobStatus: mergedJobData?.job_status,
                  loading,
                  loadingFiles,
                  shouldShow
                });
                return shouldShow;
              })()}
              creatingAssets={creatingAssets}
              setCreatingAssets={setCreatingAssets}
              onJobDataUpdate={onJobDataUpdate}
            />

            {/* Download Section */}
            <DownloadSection
              jobData={mergedJobData}
              isVisible={(() => {
                const shouldShow = ['complete', 'completed'].includes(mergedJobData?.job_status?.toLowerCase() || '') && !loading && !loadingFiles;
                console.log('🔍 DownloadSection visibility check:', {
                  jobStatus: mergedJobData?.job_status,
                  loading,
                  loadingFiles,
                  shouldShow
                });
                return shouldShow;
              })()}
              onJobDataUpdate={(updatedJobData) => {
                console.log('🔄 DownloadSection provided updated job data - using response data directly');
                onJobDataUpdate(updatedJobData); // Use provided data instead of refetching
              }}
            />

            {/* Files Section */}
            <FilesSection
              mergedJobData={mergedJobData}
              jobData={jobData}
              uploadingFiles={uploadEngine.uploadingFiles}
              loadingFiles={loadingFiles}
              filesLoaded={filesLoaded}
              loadingStep={loadingStep}
              loadingMessage={loadingMessage}
              loadingDetail={loadingDetail}
            />

          </div>
        </main>
      </div>

      {/* Asset Creation Overlay */}
      <AssetCreationOverlay isVisible={creatingAssets} />
    </div>
  );
};
