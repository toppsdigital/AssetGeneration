'use client';

import { useRouter } from 'next/navigation';
import { JobHeader, PSDTemplateSelector, DownloadSection, FilesSection, ExtractedDownloadSection } from '../';
import { AssetCreationOverlay } from './AssetCreationOverlay';
import { UIJobData } from '../../types';

interface JobDetailsContentProps {
  mergedJobData: UIJobData;
  jobData: UIJobData | null;
  
  // Core props for details page only (read-only, no job data updates)
  creatingAssets: boolean;
  setCreatingAssets: (creating: boolean) => void;
  loading: boolean;
  isRefreshing?: boolean; // Indicates fresh data is being fetched in background
  freshDataLoaded?: boolean; // Indicates fresh data just arrived
  onAssetsUpdate?: (updatedAssets: { job_id: string; assets: any; _cacheTimestamp?: number } | { _forceRefetch: true; job_id: string }) => void;
}

export const JobDetailsContent = ({
  mergedJobData,
  jobData,
  creatingAssets,
  setCreatingAssets,
  loading,
  isRefreshing = false,
  freshDataLoaded = false,
  onAssetsUpdate
}: JobDetailsContentProps) => {
  const router = useRouter();

  return (
    <div style={{
      width: '100%',
      color: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%'
      }}>
          <div style={{
            maxWidth: 1200,
            width: '100%',
            background: 'rgba(255, 255, 255, 0.06)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 16,
            padding: 32,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
            position: 'relative'
          }}>
            
            {/* Background refresh indicator */}
            {isRefreshing && (
              <div style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: 8,
                padding: '4px 8px',
                fontSize: '12px',
                color: '#22c55e',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}>
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'currentColor',
                  animation: 'pulse 2s infinite'
                }}></div>
                Refreshing...
              </div>
            )}
            
            {/* Fresh data loaded indicator */}
            {freshDataLoaded && (
              <div style={{
                position: 'absolute',
                top: 16,
                right: isRefreshing ? 120 : 16,
                background: 'rgba(34, 197, 94, 0.2)',
                border: '1px solid rgba(34, 197, 94, 0.5)',
                borderRadius: 8,
                padding: '4px 8px',
                fontSize: '12px',
                color: '#22c55e',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                animation: 'fadeIn 0.3s ease-in'
              }}>
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'currentColor'
                }}></div>
                Updated!
              </div>
            )}
            
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
              isRefreshing={isRefreshing}
              isVisible={(() => {
                // Show PSDTemplateSelector only when assets need to be configured or regenerated
                const allowedStatuses = ['extracted', 'generation-failed'];
                const currentStatus = mergedJobData?.job_status?.toLowerCase();
                // Hide for shiloutte_psd job type
                const jobType = (mergedJobData as any)?.job_type?.toLowerCase?.() || '';
                const isSupportedJobType = jobType !== 'shiloutte_psd';
                const shouldShow = allowedStatuses.includes(currentStatus) && !loading && isSupportedJobType;
                console.log('🔍 PSDTemplateSelector visibility check:', {
                  jobStatus: currentStatus,
                  loading,
                  shouldShow,
                  allowedStatuses,
                  jobType,
                  isSupportedJobType
                });
                return shouldShow;
              })()}
              creatingAssets={creatingAssets}
              setCreatingAssets={setCreatingAssets}
              onAssetsUpdate={onAssetsUpdate}
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
              isRefreshing={isRefreshing}
              // Details page: files are always loaded and no uploads in progress
              uploadingFiles={new Set()}
              loadingFiles={false}
              filesLoaded={true}
              loadingStep={1}
              loadingMessage="Ready"
              loadingDetail=""
            />

            {/* Extracted Download Section - shown when status is 'extracted' */}
            <ExtractedDownloadSection
              jobData={mergedJobData}
              isVisible={(() => {
                const shouldShow = (mergedJobData?.job_status || '').toLowerCase() === 'extracted' && !loading;
                return shouldShow;
              })()}
            />

          </div>
        </div>

      {/* Asset Creation Overlay */}
      <AssetCreationOverlay isVisible={creatingAssets} />
    </div>
  );
};