'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense, useRef } from 'react';
import Head from 'next/head';
import NavBar from '../../../components/NavBar';
import ImagePreview from '../../../components/ImagePreview';
import ExpandedImageModal from '../../../components/ExpandedImageModal';
import styles from '../../../styles/Edit.module.css';

interface AssetItem {
  filePath: string;
  filename: string;
  isTiff: boolean;
}

function JobPreviewPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobPath = searchParams.get('jobPath');
  const fileName = searchParams.get('fileName');
  const type = searchParams.get('type');
  const filePaths = searchParams.get('filePaths');
  const assetUrls = searchParams.get('assetUrls');
  
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [expandedImageIndex, setExpandedImageIndex] = useState<number | null>(null);
  
  // Cache for presigned URLs - maps filename to { presignedUrl, isTiff }
  const presignedUrlCache = useRef<Map<string, { presignedUrl: string; isTiff: boolean }>>(new Map());

  useEffect(() => {
    if (jobPath && fileName && type) {
      loadAssets();
    }
  }, [jobPath, fileName, type, filePaths, assetUrls]);

  const loadAssets = async () => {
    try {
      setLoading(true);
      
      if (!jobPath || !fileName || !type) {
        setError('Missing required parameters');
        return;
      }

      setDisplayName(fileName as string);
      
      // Parse the actual file paths/URLs passed from details page
      // For digital collectibles, use assetUrls; for extracted layers, use filePaths
      const urlParameter = type === 'firefly' ? assetUrls : filePaths;
      
      if (!urlParameter) {
        setError(`No ${type === 'firefly' ? 'digital collectibles' : 'file paths'} provided`);
        return;
      }

      let actualFilePaths: string[] = [];
      try {
        actualFilePaths = JSON.parse(decodeURIComponent(urlParameter as string));
        console.log(`🎯 Preview page - Loading ${actualFilePaths.length} ${type} assets:`, actualFilePaths);
      } catch (error) {
        console.error(`❌ Failed to parse ${type === 'firefly' ? 'digital collectible URLs' : 'filePaths'} parameter:`, error);
        setError(`Invalid ${type === 'firefly' ? 'digital collectible URLs' : 'file paths'} parameter`);
        return;
      }

      if (actualFilePaths.length === 0) {
        setError(`No ${type === 'firefly' ? 'digital collectibles' : type + ' files'} found`);
        return;
      }

      console.log(`🔍 Loading ${actualFilePaths.length} ${type} files:`, actualFilePaths);
      
      // Create simplified asset items
      const assetItems: AssetItem[] = actualFilePaths.map((filePath: string) => {
        const filename = filePath.split('/').pop() || filePath;
        const isTiff = filename.toLowerCase().endsWith('.tif') || filename.toLowerCase().endsWith('.tiff');
        
        return {
          filePath,
          filename,
          isTiff
        };
      });

      console.log(`📊 Created ${assetItems.length} asset items`);
      setAssets(assetItems);
      
    } catch (error) {
      console.error('Error loading assets:', error);
      setError('Failed to load assets: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Modal navigation functions
  const handleImageExpand = (imageData: { src: string; alt: string; isTiff: boolean }) => {
    // Cache the presigned URL for reuse
    presignedUrlCache.current.set(imageData.alt, {
      presignedUrl: imageData.src,
      isTiff: imageData.isTiff
    });
    
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

  // Get current expanded image data with cached presigned URL if available
  const expandedImage = expandedImageIndex !== null && assets[expandedImageIndex] 
    ? (() => {
        const asset = assets[expandedImageIndex];
        const cached = presignedUrlCache.current.get(asset.filename);
        
        return {
          src: cached?.presignedUrl || asset.filePath, // Use cached URL if available, fallback to file path
          alt: asset.filename,
          isTiff: asset.isTiff,
          hasCachedUrl: !!cached
        };
      })()
    : null;

  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <NavBar
          showHome
          onHome={() => router.push('/')}
          title="Loading Assets..."
        />
        <div className={styles.loading}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔄</div>
          <h2>Loading Generated Assets...</h2>
          <p>Please wait while we fetch your digital assets.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.pageContainer}>
        <NavBar
          showHome
          onHome={() => router.push('/')}
          title="Preview Assets"
        />
        <div className={styles.loading}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
          <h2>Error Loading Assets</h2>
          <p>{error}</p>
          <button 
            onClick={() => router.push(`/job/details?jobId=${encodeURIComponent(jobPath as string)}`)}
            style={{
              marginTop: 16,
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
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Preview {type === 'extracted' ? 'Extracted Layers' : 'Digital Collectibles'}</title>
      </Head>
      <div className={styles.pageContainer}>
        <NavBar
          showHome
          onHome={() => router.push('/')}
          showBackToEdit
          onBackToEdit={() => router.push(`/job/details?jobId=${encodeURIComponent(jobPath as string)}`)}
          backLabel="Job Details"
          title={`${displayName} ${type === 'extracted' ? 'Extracted Layers' : 'Digital Collectibles'}`}
        />
      
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
              {/* Image Grid */}
              {assets.length > 0 && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: 24,
                  marginBottom: 32,
                  alignItems: 'start'
                }}>
                  {assets.map((asset, index) => (
                    <div
                      key={index}
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: 12,
                        padding: 16,
                        textAlign: 'center',
                        transition: 'transform 0.2s ease',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.02)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                      onClick={() => setExpandedImageIndex(index)}
                    >
                      <div style={{
                        width: '100%',
                        marginBottom: 12,
                        borderRadius: 8,
                        overflow: 'hidden',
                        background: 'rgba(0, 0, 0, 0.2)'
                      }}>
                        <ImagePreview
                          filePath={asset.filePath}
                          alt={asset.filename}
                          onExpand={handleImageExpand}
                          lazy={index >= 6} // Load first 6 images immediately for better performance
                          priority={index < 3} // Preload first 3 images for instant loading
                        />
                      </div>
                      
                      <h3 style={{
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        color: '#f8f8f8',
                        marginBottom: 8,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        width: '100%'
                      }}
                      title={asset.filename}
                      >
                        {asset.filename}
                      </h3>
                    </div>
                  ))}
                </div>
              )}

              {/* No Assets Message */}
              {assets.length === 0 && (
                <div style={{
                  textAlign: 'center',
                  padding: '48px 0',
                  background: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: 12,
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>📷</div>
                  <h3 style={{ color: '#9ca3af', fontSize: 18, marginBottom: 8 }}>
                    No {type === 'firefly' ? 'Digital Collectibles' : 'Assets'} Found
                  </h3>
                  <p style={{ color: '#6b7280', fontSize: 14 }}>
                    This job doesn't have any {type === 'firefly' ? 'digital collectibles' : 'generated assets'} yet.
                  </p>
                </div>
              )}
            </div>
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