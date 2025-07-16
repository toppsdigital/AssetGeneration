import React from 'react';
import { useRouter } from 'next/navigation';

// TypeScript interfaces
interface FileInfo {
  card_type: string;
  status: string;
}

interface ExtractedFile {
  layer_type: string;
  status: string;
  file_path?: string;
}

interface FireflyAsset {
  status: string;
  asset_url?: string;
  file_path?: string;
  card_type?: string;
  layer_type?: string;
  job_url?: string;
}

interface FileData {
  filename: string;
  last_updated?: string;
  original_files?: Record<string, FileInfo>;
  extracted_files?: Record<string, ExtractedFile>;
  firefly_assets?: Record<string, FireflyAsset>;
}

interface FileCardProps {
  file: FileData;
  index?: number;
  jobData?: {
    job_id?: string;
  };
  uploadingFiles?: Set<string>;
}

const capitalizeStatus = (status: string): string => {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
};

const FileCard: React.FC<FileCardProps> = ({ 
  file, 
  index = 0, 
  jobData, 
  uploadingFiles = new Set() 
}) => {
  const router = useRouter();

  return (
    <div style={{
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: 12,
      padding: 20,
      minHeight: 280,
      transition: 'all 0.3s ease',
      opacity: 1,
      animationDelay: `${index * 0.1}s`,
      animation: 'fadeIn 0.3s ease-in-out forwards'
    }}>
      {/* File Header */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{
          fontSize: '1.2rem',
          fontWeight: 600,
          color: '#f8f8f8',
          margin: '0 0 8px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          📄 {file.filename}
        </h3>
        {file.last_updated && (
          <p style={{
            color: '#9ca3af',
            fontSize: 14,
            margin: 0
          }}>
            Last updated: {new Date(file.last_updated).toLocaleString()}
          </p>
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 20,
        marginBottom: 24
      }}>
        {/* Original PDF Files */}
        <div>
          <h4 style={{
            color: '#f59e0b',
            fontSize: 16,
            fontWeight: 600,
            margin: '0 0 12px 0'
          }}>
            📄 Original PDF Files ({file.original_files ? Object.keys(file.original_files).length : 0})
          </h4>
          <div style={{
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 8,
            padding: 12,
            maxHeight: 200,
            overflowY: 'auto'
          }}>
            {file.original_files && Object.keys(file.original_files).length > 0 ? (
              Object.entries(file.original_files).map(([filename, fileInfo], origIndex) => (
                <div key={origIndex} style={{
                  marginBottom: 8,
                  fontSize: 13,
                  color: '#fbbf24',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>📋</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{filename}</span>
                      {/* Show loading spinner when upload is actively happening */}
                      {uploadingFiles.has(filename) && (
                        <div style={{
                          width: 12,
                          height: 12,
                          border: '1.5px solid rgba(245, 158, 11, 0.3)',
                          borderTop: '1.5px solid #f59e0b',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite',
                          marginLeft: 4
                        }} />
                      )}
                    </span>
                    {/* Show animated uploading text for files being uploaded */}
                    {uploadingFiles.has(filename) && (
                      <span style={{
                        fontSize: 11,
                        color: '#f59e0b',
                        animation: 'pulse 2s infinite',
                        marginLeft: 4
                      }}>
                        Uploading...
                      </span>
                    )}
                  </span>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{
                      fontSize: 11,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: 'rgba(245, 158, 11, 0.2)',
                      color: '#f59e0b'
                    }}>
                      {fileInfo.card_type}
                    </span>
                    <span style={{
                      fontSize: 11,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: fileInfo.status.toLowerCase() === 'uploaded' 
                        ? 'rgba(16, 185, 129, 0.2)' 
                        : fileInfo.status.toLowerCase() === 'upload-failed'
                        ? 'rgba(239, 68, 68, 0.2)'
                        : 'rgba(249, 115, 22, 0.2)',
                      color: fileInfo.status.toLowerCase() === 'uploaded' 
                        ? '#34d399' 
                        : fileInfo.status.toLowerCase() === 'upload-failed'
                        ? '#fca5a5'
                        : '#fdba74'
                    }}>
                      {capitalizeStatus(fileInfo.status)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>
                No original PDF files found
              </p>
            )}
          </div>
        </div>

        {/* Extracted Layers - Only show if there are extracted files */}
        {file.extracted_files && Object.keys(file.extracted_files).length > 0 && (
          <div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12
            }}>
              <h4 style={{
                color: '#60a5fa',
                fontSize: 16,
                fontWeight: 600,
                margin: 0
              }}>
                🖼️ Extracted Layers ({Object.keys(file.extracted_files).length})
              </h4>
              {(() => {
                // Check if all extracted files have "uploaded" status (case insensitive)
                const allUploaded = Object.values(file.extracted_files || {}).every(
                  extractedFile => extractedFile.status.toLowerCase() === 'uploaded'
                );
                
                return allUploaded ? (
                  <button
                    onClick={() => {
                      // Collect file paths from extracted files
                      const filePaths = Object.values(file.extracted_files || {}).map(extractedFile => 
                        extractedFile.file_path
                      ).filter(path => path);
                      
                      const baseName = file.filename.replace('.pdf', '').replace('.PDF', '');
                      // Use jobId since jobPath is not available
                      const jobPath = jobData?.job_id || '';
                      
                      // Pass the file paths as a query parameter
                      const filePathsParam = encodeURIComponent(JSON.stringify(filePaths));
                      router.push(`/job/preview?jobPath=${encodeURIComponent(jobPath)}&fileName=${encodeURIComponent(baseName)}&type=extracted&filePaths=${filePathsParam}`);
                    }}
                    style={{
                      background: 'rgba(59, 130, 246, 0.2)',
                      border: '1px solid rgba(59, 130, 246, 0.4)',
                      borderRadius: 6,
                      color: '#60a5fa',
                      cursor: 'pointer',
                      fontSize: 12,
                      padding: '6px 12px',
                      transition: 'all 0.2s',
                      fontWeight: 500
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(59, 130, 246, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
                    }}
                  >
                    👁️ Preview Layers
                  </button>
                ) : (
                  <span style={{
                    fontSize: 12,
                    color: '#9ca3af',
                    padding: '6px 12px',
                    border: '1px solid rgba(156, 163, 175, 0.3)',
                    borderRadius: 6,
                    background: 'rgba(156, 163, 175, 0.1)'
                  }}>
                    ⏳ Waiting for all layers to be uploaded
                  </span>
                );
              })()}
            </div>
            <div style={{
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: 8,
              padding: 12,
              maxHeight: 200,
              overflowY: 'auto'
            }}>
              {Object.entries(file.extracted_files).map(([filename, extractedFile], extIndex) => (
                <div key={extIndex} style={{
                  marginBottom: 8,
                  fontSize: 13,
                  color: '#bfdbfe',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>🖼️</span>
                    <span>{filename}</span>
                  </span>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ 
                      background: 'rgba(59, 130, 246, 0.2)', 
                      padding: '2px 6px', 
                      borderRadius: 4,
                      color: '#60a5fa',
                      fontSize: 11
                    }}>
                      {extractedFile.layer_type}
                    </span>
                    <span style={{
                      fontSize: 11,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: extractedFile.status.toLowerCase() === 'uploaded' 
                        ? 'rgba(16, 185, 129, 0.2)' 
                        : 'rgba(249, 115, 22, 0.2)',
                      color: extractedFile.status.toLowerCase() === 'uploaded' 
                        ? '#34d399' 
                        : '#fdba74'
                    }}>
                      {capitalizeStatus(extractedFile.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Firefly Assets - Only show if there are firefly assets */}
      {file.firefly_assets && Object.keys(file.firefly_assets).length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12
          }}>
            <h4 style={{
              color: '#34d399',
              fontSize: 16,
              fontWeight: 600,
              margin: 0
            }}>
              🎨 Firefly Assets ({Object.keys(file.firefly_assets).length})
            </h4>
            {(() => {
              // Check if all firefly assets have "succeeded" status (case insensitive)
              const allSucceeded = Object.values(file.firefly_assets || {}).every(
                asset => asset.status.toLowerCase() === 'succeeded'
              );
              
              return allSucceeded ? (
                <button
                  onClick={() => {
                    // Use the actual file paths from firefly assets
                    const assetUrls = Object.values(file.firefly_assets || {}).map(asset => 
                      asset.file_path
                    ).filter(url => url);
                    
                    console.log('🔥 Firefly preview - Asset URLs:', assetUrls);
                    
                    const baseName = file.filename.replace('.pdf', '').replace('.PDF', '');
                    const jobPath = jobData?.job_id || '';
                    
                    // Pass the asset URLs as a query parameter
                    const assetUrlsParam = encodeURIComponent(JSON.stringify(assetUrls));
                    router.push(`/job/preview?jobPath=${encodeURIComponent(jobPath)}&fileName=${encodeURIComponent(baseName)}&type=firefly&assetUrls=${assetUrlsParam}`);
                  }}
                  style={{
                    background: 'rgba(52, 211, 153, 0.2)',
                    border: '1px solid rgba(52, 211, 153, 0.4)',
                    borderRadius: 6,
                    color: '#34d399',
                    cursor: 'pointer',
                    fontSize: 12,
                    padding: '6px 12px',
                    transition: 'all 0.2s',
                    fontWeight: 500
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(52, 211, 153, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(52, 211, 153, 0.2)';
                  }}
                >
                  🎨 Preview Assets
                </button>
              ) : (
                <span style={{
                  fontSize: 12,
                  color: '#9ca3af',
                  padding: '6px 12px',
                  border: '1px solid rgba(156, 163, 175, 0.3)',
                  borderRadius: 6,
                  background: 'rgba(156, 163, 175, 0.1)'
                }}>
                  ⏳ Generating assets...
                </span>
              );
            })()}
          </div>
          <div style={{
            background: 'rgba(52, 211, 153, 0.1)',
            border: '1px solid rgba(52, 211, 153, 0.3)',
            borderRadius: 8,
            padding: 12,
            maxHeight: 200,
            overflowY: 'auto'
          }}>
            {Object.entries(file.firefly_assets).map(([assetName, asset], assetIndex) => (
              <div key={assetIndex} style={{
                marginBottom: 8,
                fontSize: 13,
                color: '#6ee7b7',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🎨</span>
                  <span>{assetName}</span>
                </span>
                <span style={{
                  fontSize: 11,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: asset.status.toLowerCase() === 'succeeded' 
                    ? 'rgba(16, 185, 129, 0.2)' 
                    : asset.status.toLowerCase() === 'failed'
                    ? 'rgba(239, 68, 68, 0.2)'
                    : 'rgba(249, 115, 22, 0.2)',
                  color: asset.status.toLowerCase() === 'succeeded' 
                    ? '#34d399' 
                    : asset.status.toLowerCase() === 'failed'
                    ? '#fca5a5'
                    : '#fdba74'
                }}>
                  {capitalizeStatus(asset.status)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FileCard; 