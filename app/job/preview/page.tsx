'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense, useRef, useMemo } from 'react';
import Head from 'next/head';
import ImagePreview from '../../../components/ImagePreview';
import ExpandedImageModal from '../../../components/ExpandedImageModal';
import { PageTitle } from '../../../components';
import { useAppDataStore } from '../../../hooks/useAppDataStore';
import styles from '../../../styles/Edit.module.css';

interface AssetItem {
  filePath: string;
  filename: string;
  isTiff: boolean;
}

function JobPreviewPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // New URL format parameters
  let jobId = searchParams.get('jobId');
  let fileId = searchParams.get('fileId'); 
  let mode = searchParams.get('mode'); // 'extracted-assets' or 'digital-assets'
  
  // Legacy URL format parameters (for backward compatibility)
  const legacyJobPath = searchParams.get('jobPath');
  const legacyFileName = searchParams.get('fileName');
  const legacyType = searchParams.get('type');
  
  // Handle backward compatibility with old URL format
  if (!jobId && !fileId && !mode && legacyJobPath && legacyFileName && legacyType) {
    console.log(`🔄 [Preview] Converting legacy URL format to new format`);
    jobId = legacyJobPath;
    fileId = legacyFileName + '.pdf'; // Add extension since legacy format didn't include it
    mode = legacyType === 'firefly' ? 'digital-assets' : 'extracted-assets';
    
    // Redirect to new URL format
    const newUrl = `/job/preview?jobId=${encodeURIComponent(jobId)}&fileId=${encodeURIComponent(fileId)}&mode=${mode}`;
    console.log(`🔄 [Preview] Redirecting to new URL format:`, newUrl);
    router.replace(newUrl);
    return null; // Don't render while redirecting
  }
  
  const [expandedImageIndex, setExpandedImageIndex] = useState<number | null>(null);
  
  // Cache for presigned URLs - maps filename to { presignedUrl, isTiff }
  const presignedUrlCache = useRef<Map<string, { presignedUrl: string; isTiff: boolean }>>(new Map());

  // Get cached file data from centralized store
  const { 
    data: jobFiles, 
    isLoading, 
    error: filesError 
  } = useAppDataStore('jobFiles', { 
    jobId: jobId || '', 
    autoRefresh: false 
  });

  // Debug current URL parameters
  console.log(`🔍 [Preview] Current URL parameters:`, {
    jobId,
    fileId,
    mode,
    allParams: Object.fromEntries(searchParams.entries())
  });

  // Find the specific file and extract assets based on mode
  const { fileData, assets, displayName, error } = useMemo(() => {
    if (!jobId || !fileId || !mode) {
      console.warn(`⚠️ [Preview] Missing required parameters:`, {
        jobId: jobId || 'MISSING',
        fileId: fileId || 'MISSING', 
        mode: mode || 'MISSING',
        allParams: Object.fromEntries(searchParams.entries())
      });
      
      return {
        fileData: null,
        assets: [],
        displayName: '',
        error: `Missing required parameters. Expected: jobId, fileId, and mode. Got: ${JSON.stringify({
          jobId: jobId || 'missing',
          fileId: fileId || 'missing',
          mode: mode || 'missing'
        })}`
      };
    }

    if (filesError) {
      return {
        fileData: null,
        assets: [],
        displayName: '',
        error: `Failed to load file data: ${filesError.message}`
      };
    }

    if (!jobFiles || jobFiles.length === 0) {
      if (!isLoading) {
        return {
          fileData: null,
          assets: [],
          displayName: '',
          error: 'No files found for this job'
        };
      }
      return { fileData: null, assets: [], displayName: '', error: null };
    }

    // Find the specific file by filename (fileId)
    const targetFile = jobFiles.find(file => file.filename === fileId);
    if (!targetFile) {
      return {
        fileData: null,
        assets: [],
        displayName: '',
        error: `File "${fileId}" not found in job files`
      };
    }

    console.log(`🎯 [Preview] Found file data for ${fileId}:`, {
      filename: targetFile.filename,
      extracted_files: targetFile.extracted_files,
      firefly_assets: targetFile.firefly_assets
    });

    // Extract assets based on mode
    let assetPaths: string[] = [];
    let modeDisplayName = '';

    if (mode === 'extracted-assets') {
      // Get extracted layer assets
      const extractedFiles = targetFile.extracted_files || {};
      console.log(`📂 [Preview] Extracted files structure:`, extractedFiles);
      
      // Extract file paths from asset objects or strings
      const rawAssets = Object.values(extractedFiles).flat().filter(Boolean);
      assetPaths = rawAssets.map((asset: any) => {
        if (typeof asset === 'string') {
          return asset;
        } else if (asset && typeof asset === 'object' && asset.file_path) {
          return asset.file_path;
        } else {
          console.warn(`🚫 [Preview] Invalid extracted asset format:`, asset);
          return null;
        }
      }).filter(Boolean) as string[];
      
      modeDisplayName = 'Extracted Layers';
    } else if (mode === 'digital-assets') {
      // Get digital collectible assets (Firefly)
      const fireflyAssets = targetFile.firefly_assets || {};
      console.log(`🎨 [Preview] Firefly assets structure:`, fireflyAssets);
      
      // Extract file paths from asset objects or strings
      const rawAssets = Object.values(fireflyAssets).flat().filter(Boolean);
      assetPaths = rawAssets.map((asset: any) => {
        if (typeof asset === 'string') {
          return asset;
        } else if (asset && typeof asset === 'object' && asset.file_path) {
          return asset.file_path;
        } else {
          console.warn(`🚫 [Preview] Invalid firefly asset format:`, asset);
          return null;
        }
      }).filter(Boolean) as string[];
      
      modeDisplayName = 'Digital Collectibles';
    } else {
      return {
        fileData: targetFile,
        assets: [],
        displayName: '',
        error: `Invalid mode "${mode}". Must be "extracted-assets" or "digital-assets"`
      };
    }

    console.log(`🖼️ [Preview] Found ${assetPaths.length} ${modeDisplayName.toLowerCase()} for ${fileId}:`, assetPaths);
    console.log(`🔍 [Preview] Asset paths types:`, assetPaths.map(path => ({ path, type: typeof path })));

    if (assetPaths.length === 0) {
      return {
        fileData: targetFile,
        assets: [],
        displayName: `${targetFile.filename} • ${modeDisplayName}`,
        error: `No ${modeDisplayName.toLowerCase()} found for this file`
      };
    }

    // Define supported image formats
    const imageExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', 
      '.tif', '.tiff', '.svg', '.ico', '.avif', '.heic', '.heif'
    ];
    
    // Filter to only include valid string paths and image files
    const imageAssets = assetPaths
      .filter((filePath: any): filePath is string => {
        // First, ensure filePath is a valid string
        if (typeof filePath !== 'string' || !filePath.trim()) {
          console.log(`🚫 [Preview] Excluding invalid path:`, filePath, typeof filePath);
          return false;
        }
        
        // Then check if it's an image file
        const filename = filePath.split('/').pop() || filePath;
        const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
        const isImage = imageExtensions.includes(extension);
        
        if (!isImage) {
          console.log(`🚫 [Preview] Excluding non-image file: ${filename} (${extension})`);
        }
        
        return isImage;
      })
      .map((filePath: string): AssetItem => {
        const filename = filePath.split('/').pop() || filePath;
        const isTiff = filename.toLowerCase().endsWith('.tif') || filename.toLowerCase().endsWith('.tiff');
        
        return {
          filePath,
          filename,
          isTiff
        };
      });

    console.log(`📊 [Preview] Created ${imageAssets.length} image assets from ${assetPaths.length} total files`);

    return {
      fileData: targetFile,
      assets: imageAssets,
      displayName: `${targetFile.filename} • ${imageAssets.length} ${modeDisplayName}`,
      error: imageAssets.length === 0 ? `No image files found in ${modeDisplayName.toLowerCase()}` : null
    };
  }, [jobId, fileId, mode, jobFiles, isLoading, filesError]);

  // Modal navigation functions
  const handleImageExpand = (imageData: { src: string; alt: string; isTiff: boolean }) => {
    // Find the index of the expanded image
    const index = assets.findIndex(asset => asset.filename === imageData.alt);
    setExpandedImageIndex(index >= 0 ? index : 0);
  };

  const handleModalClose = () => {
    setExpandedImageIndex(null);
  };

  const handlePreviousImage = () => {
    if (expandedImageIndex !== null && expandedImageIndex > 0) {
      setExpandedImageIndex(expandedImageIndex - 1);
    }
  };

  const handleNextImage = () => {
    if (expandedImageIndex !== null && expandedImageIndex < assets.length - 1) {
      setExpandedImageIndex(expandedImageIndex + 1);
    }
  };

  // Get current expanded image data (filePath will be resolved by modal's cache logic)
  const expandedImage = expandedImageIndex !== null && assets[expandedImageIndex] 
    ? (() => {
        const asset = assets[expandedImageIndex];
        return {
          src: asset.filePath, // Modal will check cache and use optimized URL
          alt: asset.filename,
          isTiff: asset.isTiff
        };
      })()
    : null;

  // Generate page title based on mode and data
  const getPageTitle = () => {
    if (displayName) {
      return displayName;
    }
    
    if (!mode) return 'Preview Assets';
    
    const assetTypeLabel = mode === 'digital-assets' ? 'Digital Collectibles' : 'Extracted Layers';
    const assetCount = assets.length;
    const assetWord = assetCount === 1 ? 'asset' : 'assets';
    
    return `${assetCount} ${assetTypeLabel}`;
  };

  // Remove the prefetch effect since we're not using presigned URLs anymore
  useEffect(() => {
    // Cleanup any existing cached URLs when component unmounts
    return () => {
      presignedUrlCache.current.clear();
    };
  }, []);

  if (isLoading) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.loading}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔄</div>
          <h2>Loading Assets...</h2>
          <p>Please wait while we fetch your file data from cache.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.loading}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
          <h2>Error Loading Assets</h2>
          <p style={{ marginBottom: 16 }}>{error}</p>
          
          {!jobId && !fileId && !mode && (
            <div style={{ 
              background: 'rgba(255, 255, 255, 0.05)', 
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 8,
              padding: 16,
              marginBottom: 16,
              fontSize: 14,
              color: '#9ca3af'
            }}>
              <p><strong>How to access this page:</strong></p>
              <p>• Navigate from Job Details → File Card → "Preview" button</p>
              <p>• URL format: <code>/job/preview?jobId=...&fileId=...&mode=...</code></p>
            </div>
          )}
          
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            {jobId && (
              <button 
                onClick={() => {
                  sessionStorage.setItem('navigationSource', 'preview');
                  router.push(`/job/details?jobId=${encodeURIComponent(jobId)}`);
                }}
                style={{
                  padding: '8px 16px',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer'
                }}
              >
                Back to Job Details
              </button>
            )}
            
            <button 
              onClick={() => {
                router.push('/jobs');
              }}
              style={{
                padding: '8px 16px',
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer'
              }}
            >
              Go to Jobs List
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Preview {mode === 'extracted-assets' ? 'Extracted Layers' : 'Digital Collectibles'}</title>
      </Head>
      <div className={styles.pageContainer}>
        <PageTitle title={getPageTitle()} />
      
        <div className={styles.editContainer}>
          <main className={styles.mainContent}>
            {/* Image Grid - Google Photos Style */}
            {assets.length > 0 && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 240px))',
                gap: 16,
                marginBottom: 24,
                justifyContent: 'center',
                padding: '24px',
                maxWidth: '100%',
                width: '100%'
              }}>
                {assets.map((asset, index) => (
                    <div
                      key={index}
                      style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: 12,
                        overflow: 'hidden',
                        transition: 'all 0.2s ease',
                        cursor: 'pointer',
                        width: '100%',
                        maxWidth: '240px',
                        minWidth: '220px',
                        height: 'auto',
                        position: 'relative',
                        padding: '8px'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.02)';
                        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.4)';
                        e.currentTarget.style.zIndex = '10';
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = 'none';
                        e.currentTarget.style.zIndex = '1';
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                      }}
                      onClick={() => setExpandedImageIndex(index)}
                    >
                      <div style={{
                        width: '100%',
                        aspectRatio: '5/7', // Trading card aspect ratio
                        borderRadius: 8,
                        overflow: 'hidden',
                        background: 'rgba(0, 0, 0, 0.1)',
                        position: 'relative',
                        marginBottom: '12px'
                      }}>
                        <ImagePreview
                          filePath={asset.filePath}
                          alt={asset.filename}
                          onExpand={handleImageExpand}
                          lazy={index >= 12} // Load first 12 images immediately
                          priority={index < 6} // Preload first 6 images for instant loading
                        />
                      </div>
                      
                      {/* Filename below image */}
                      <div style={{
                        padding: '0 4px 4px 4px',
                        textAlign: 'center'
                      }}>
                        <h3 style={{
                          fontSize: '13px',
                          fontWeight: 500,
                          color: '#e5e7eb',
                          margin: 0,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          width: '100%',
                          lineHeight: '1.3'
                        }}
                        title={asset.filename}
                        >
                          {asset.filename}
                        </h3>
                      </div>
                    </div>
                ))}
              </div>
            )}

            {/* No Assets Message */}
            {assets.length === 0 && !error && (
              <div style={{
                textAlign: 'center',
                padding: '48px 24px',
                margin: '24px',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: 12,
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📷</div>
                <h3 style={{ color: '#9ca3af', fontSize: 18, marginBottom: 8 }}>
                  No {mode === 'digital-assets' ? 'Digital Collectibles' : 'Assets'} Found
                </h3>
                <p style={{ color: '#6b7280', fontSize: 14 }}>
                  This file doesn't have any {mode === 'digital-assets' ? 'digital collectibles' : 'extracted assets'} yet.
                </p>
              </div>
            )}
          </main>
        </div>

        {/* Enhanced Image Modal */}
        <ExpandedImageModal
          image={expandedImage}
          onClose={handleModalClose}
          onNext={handleNextImage}
          onPrevious={handlePreviousImage}
          currentIndex={expandedImageIndex}
          totalCount={assets.length}
          allAssets={assets}
        />
      </div>
    </>
  );
}

export default function JobPreviewPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#0f172a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 64,
            height: 64,
            border: '4px solid rgba(16, 185, 129, 0.2)',
            borderTop: '4px solid #10b981',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px auto'
          }} />
          <p style={{ color: '#e0e0e0' }}>Loading preview...</p>
        </div>
      </div>
    }>
      <JobPreviewPageContent />
    </Suspense>
  );
} 