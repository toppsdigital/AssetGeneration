'use client';

import { useRouter } from 'next/navigation';
import { JobHeader, PSDTemplateSelector, DownloadSection, FilesSection } from '../';
import { AssetCreationOverlay } from './AssetCreationOverlay';
import styles from '../../styles/Edit.module.css';
import { UIJobData } from '../../types';

interface JobDetailsContentProps {
  mergedJobData: UIJobData;
  jobData: UIJobData | null;
  
  // Core props for details page only (read-only, no job data updates)
  creatingAssets: boolean;
  setCreatingAssets: (creating: boolean) => void;
  loading: boolean;
}

export const JobDetailsContent = ({
  mergedJobData,
  jobData,
  loading
}: JobDetailsContentProps) => {
  const router = useRouter();

  return (
    <div className={styles.pageContainer}>
      <div className={styles.editContainer}>
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
              onRerunJob={mergedJobData ? () => {
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
                const shouldShow = (mergedJobData?.job_status?.toLowerCase() === 'extracted' || mergedJobData?.job_status?.toLowerCase() === 'generation-failed') && !loading;
                console.log('🔍 PSDTemplateSelector visibility check:', {
                  jobStatus: mergedJobData?.job_status,
                  loading,
                  shouldShow
                });
                return shouldShow;
              })()}
              creatingAssets={creatingAssets}
              setCreatingAssets={setCreatingAssets}
            />

            {/* Download Section */}
            <DownloadSection
              jobData={mergedJobData}
              isVisible={(() => {
                const shouldShow = ['complete', 'completed'].includes(mergedJobData?.job_status?.toLowerCase() || '') && !loading;
                console.log('🔍 DownloadSection visibility check:', {
                  jobStatus: mergedJobData?.job_status,
                  loading,
                  shouldShow
                });
                return shouldShow;
              })()}
            />

            {/* Files Section */}
            <FilesSection
              mergedJobData={mergedJobData}
              jobData={jobData}
              // Details page: files are always loaded and no uploads in progress
              uploadingFiles={new Set()}
              loadingFiles={false}
              filesLoaded={true}
              loadingStep={1}
              loadingMessage="Ready"
              loadingDetail=""
            />

          </div>
        </main>
      </div>

      {/* Asset Creation Overlay */}
      <AssetCreationOverlay isVisible={creatingAssets} />
    </div>
  );
};
