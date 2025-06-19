import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import NavBar from '../../components/NavBar';
import styles from '../../styles/Edit.module.css';

interface AssetItem {
  filename: string;
  job_id: string;
  status: string;
  spot_number?: string;
  color_variant?: string;
  presignedUrl?: string;
}

export default function JobPreviewPage() {
  const router = useRouter();
  const { jobData } = router.query;
  
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (jobData) {
      loadAssets();
    }
  }, [jobData]);

  const loadAssets = async () => {
    try {
      setLoading(true);
      const parsedJobData = JSON.parse(jobData as string);
      
      // Get the first file from the job
      const firstFile = parsedJobData.files?.[0];
      if (!firstFile) {
        setError('No files found in job data');
        return;
      }

      setFileName(firstFile.filename || 'Unknown PDF');
      
      // Get firefly_assets from the first file
      const fireflyAssets = firstFile.firefly_assets || [];
      
      if (fireflyAssets.length === 0) {
        setError('No generated assets found');
        return;
      }

      // Generate presigned URLs for each asset
      const assetsWithUrls = await Promise.all(
        fireflyAssets.map(async (asset: AssetItem) => {
          try {
            // Extract PDF filename without extension for folder structure
            const pdfNameWithoutExt = firstFile.filename.replace(/\.pdf$/i, '');
            // Remove language suffix like _FR, _EN, _ES, etc.
            const baseName = pdfNameWithoutExt.replace(/_[A-Z]{2}$/, '');
            
            // Construct relative S3 path (API will add asset_generator/dev/uploads/ prefix)
            const relativeAssetPath = `PDFs/Output/${baseName}/${asset.filename}`;
            
            const response = await fetch('/api/s3-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                client_method: 'get',
                filename: relativeAssetPath
              }),
            });

            if (response.ok) {
              const data = await response.json();
              return {
                ...asset,
                presignedUrl: data.url
              };
            } else {
              console.warn(`Failed to get presigned URL for ${asset.filename}`);
              return asset;
            }
          } catch (error) {
            console.error(`Error getting presigned URL for ${asset.filename}:`, error);
            return asset;
          }
        })
      );

      setAssets(assetsWithUrls);
      
    } catch (error) {
      console.error('Error loading assets:', error);
      setError('Failed to load assets: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const successfulAssets = assets.filter(asset => asset.status === 'succeeded');
  const failedAssets = assets.filter(asset => asset.status === 'failed');

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
            onClick={() => router.push('/jobs')}
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
            Back to Jobs
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <NavBar
        showHome
        onHome={() => router.push('/')}
        showViewJobs
        onViewJobs={() => router.push('/jobs')}
        title="Preview Job Assets"
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
            
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <h1 style={{
                fontSize: '2rem',
                fontWeight: 600,
                color: '#f8f8f8',
                marginBottom: 16
              }}>
                🎨 Preview Digital Assets
              </h1>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(255, 255, 255, 0.05)',
                padding: 16,
                borderRadius: 12,
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <div>
                  <h2 style={{
                    fontSize: '1.2rem',
                    fontWeight: 600,
                    color: '#f8f8f8',
                    margin: 0
                  }}>
                    {fileName}
                  </h2>
                </div>
                <div style={{
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  color: assets.length > 0 && successfulAssets.length === assets.length ? '#10b981' : 
                        successfulAssets.length === 0 ? '#ef4444' : '#f59e0b'
                }}>
                  {assets.length > 0 ? Math.round((successfulAssets.length / assets.length) * 100) : 0}% successful
                  <span style={{ fontSize: '0.9rem', color: '#9ca3af', marginLeft: 8 }}>
                    ({successfulAssets.length}/{assets.length} assets)
                  </span>
                </div>
              </div>
            </div>



            {/* Image Grid */}
            {successfulAssets.length > 0 && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 24,
                marginBottom: 32,
                alignItems: 'start'
              }}>
                {successfulAssets.map((asset, index) => (
                  <div
                    key={index}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: 12,
                      padding: 16,
                      textAlign: 'center',
                      transition: 'transform 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.02)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    {asset.presignedUrl ? (
                      <div style={{
                        width: '100%',
                        marginBottom: 12,
                        borderRadius: 8,
                        overflow: 'hidden',
                        background: 'rgba(0, 0, 0, 0.2)'
                      }}>
                        <img
                          src={asset.presignedUrl}
                          alt={asset.filename}
                          style={{
                            width: '100%',
                            height: 'auto',
                            maxHeight: '400px',
                            objectFit: 'contain',
                            display: 'block'
                          }}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>
                    ) : (
                      <div style={{
                        width: '100%',
                        height: 200,
                        background: 'rgba(107, 114, 128, 0.2)',
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 12,
                        color: '#9ca3af'
                      }}>
                        📷 Preview unavailable
                      </div>
                    )}
                    
                    <h3 style={{
                      fontSize: '1rem',
                      fontWeight: 600,
                      color: '#f8f8f8',
                      marginBottom: 8,
                      wordBreak: 'break-all'
                    }}>
                      {asset.filename}
                    </h3>
                    
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.8rem',
                      color: '#9ca3af'
                    }}>
                      {asset.spot_number && (
                        <span>Spot: {asset.spot_number}</span>
                      )}
                      {asset.color_variant && (
                        <span>Variant: {asset.color_variant}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Failed Assets (if any) */}
            {failedAssets.length > 0 && (
              <div style={{ marginTop: 32 }}>
                <h3 style={{
                  fontSize: '1.2rem',
                  fontWeight: 600,
                  color: '#ef4444',
                  marginBottom: 16
                }}>
                  ❌ Failed Assets
                </h3>
                <div style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 12,
                  padding: 16
                }}>
                  {failedAssets.map((asset, index) => (
                    <div key={index} style={{
                      marginBottom: 8,
                      color: '#fca5a5'
                    }}>
                      • {asset.filename}
                    </div>
                  ))}
                </div>
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
                <h3 style={{ color: '#9ca3af', fontSize: 18, marginBottom: 8 }}>No Assets Found</h3>
                <p style={{ color: '#6b7280', fontSize: 14 }}>
                  This job doesn't have any generated assets yet.
                </p>
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  );
} 