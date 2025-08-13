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
    status?: string; // Add job status to determine when to show file status
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
        gridTemplateColumns: '1fr 1fr 1.5fr', // Narrower for PDF/Layers, wider for Digital Collectibles
        gap: 16, // Reduced from 20
        marginBottom: 20 // Reduced from 24
      }}>
        {/* Original PDF Files */}
        <div>
          <h4 style={{
            color: '#f59e0b',
            fontSize: 15, // Slightly smaller
            fontWeight: 600,
            margin: '0 0 10px 0' // Reduced margin
          }}>
            📄 Original PDF Files ({file.original_files ? Object.keys(file.original_files).length : 0})
          </h4>
          <div style={{
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 8,
            padding: 10, // Reduced from 12
            maxHeight: 180, // Reduced from 200
            overflowY: 'auto'
          }}>
            {file.original_files && Object.keys(file.original_files).length > 0 ? (
              Object.entries(file.original_files)
                .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
                .map(([filename, fileInfo], origIndex) => {
                // Show status when there are NO firefly assets (job hasn't reached generating/complete), or file is actively uploading
                const hasFireflyAssets = file.firefly_assets && Object.keys(file.firefly_assets).length > 0;
                const showStatus = uploadingFiles.has(filename) || !hasFireflyAssets;
                
                return (
                  <div key={origIndex} style={{
                    marginBottom: 6, // Reduced from 8
                    fontSize: 12, // Reduced from 13
                    color: '#fbbf24',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}> {/* Reduced gap */}
                      <span>📋</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}> {/* Reduced gap */}
                        <span>{filename}</span>
                        {/* Show loading spinner when upload is actively happening */}
                        {uploadingFiles.has(filename) && (
                          <div style={{
                            width: 10, // Reduced from 12
                            height: 10, // Reduced from 12
                            border: '1.5px solid rgba(245, 158, 11, 0.3)',
                            borderTop: '1.5px solid #f59e0b',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                            marginLeft: 3 // Reduced from 4
                          }} />
                        )}
                      </span>
                      {/* Show animated uploading text for files being uploaded */}
                      {uploadingFiles.has(filename) && (
                        <span style={{
                          fontSize: 10, // Reduced from 11
                          color: '#f59e0b',
                          animation: 'pulse 2s infinite',
                          marginLeft: 3 // Reduced from 4
                        }}>
                          Uploading...
                        </span>
                      )}
                    </span>
                    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}> {/* Reduced gap, always show */}
                      {/* Always show file type */}
                      <span style={{
                        fontSize: 10, // Reduced from 11
                        padding: '1px 4px', // Reduced padding
                        borderRadius: 3, // Reduced border radius
                        background: 'rgba(245, 158, 11, 0.2)',
                        color: '#f59e0b'
                      }}>
                        {fileInfo.card_type}
                      </span>
                      {/* Only show status if needed */}
                      {showStatus && (
                        <span style={{
                          fontSize: 10, // Reduced from 11
                          padding: '1px 4px', // Reduced padding
                          borderRadius: 3, // Reduced border radius
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
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <p style={{ color: '#9ca3af', fontSize: 12, margin: 0 }}> {/* Reduced font size */}
                No original PDF files found
              </p>
            )}
          </div>
        </div>

        {/* Extracted Layers - Only show if there are extracted files */}
        {(() => {
          // Use all extracted files and filter out _seq and _seq_bb layers
          const allExtractedFiles = file.extracted_files || {};
          const extractedFiles = Object.fromEntries(
            Object.entries(allExtractedFiles).filter(([filename]) => {
              const lowerFilename = filename.toLowerCase();
              return !lowerFilename.includes('_seq') && !lowerFilename.includes('_seq_bb');
            })
          );
          
          // Only render if there are extracted files after filtering
          if (Object.keys(extractedFiles).length === 0) return null;
          
          // Check if all extracted files (including _seq) have "uploaded" status for preview functionality
          const allUploaded = Object.values(allExtractedFiles).every(
            extractedFile => extractedFile.status.toLowerCase() === 'uploaded'
          );
          
          return (
            <div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10 // Reduced from 12
              }}>
                <h4 style={{
                  color: '#60a5fa',
                  fontSize: 15, // Slightly smaller
                  fontWeight: 600,
                  margin: 0
                }}>
                  🖼️ Extracted Layers ({Object.keys(extractedFiles).length})
                </h4>
                {allUploaded ? (
                  <button
                    onClick={() => {
                      // Collect file paths from ALL extracted files (including _seq) for preview
                      const filePaths = Object.values(allExtractedFiles).map(extractedFile => 
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
                      borderRadius: 4, // Reduced from 6
                      color: '#60a5fa',
                      cursor: 'pointer',
                      fontSize: 11, // Reduced from 12
                      padding: '4px 8px', // Reduced padding
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
                    👁️ Preview
                  </button>
                ) : (
                  <span style={{
                    fontSize: 11, // Reduced from 12
                    color: '#9ca3af',
                    padding: '4px 8px', // Reduced padding
                    border: '1px solid rgba(156, 163, 175, 0.3)',
                    borderRadius: 4, // Reduced from 6
                    background: 'rgba(156, 163, 175, 0.1)'
                  }}>
                    ⏳ Processing...
                  </span>
                )}
              </div>
              <div style={{
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: 8,
                padding: 10, // Reduced from 12
                maxHeight: 180, // Reduced from 200
                overflowY: 'auto'
              }}>
                {Object.entries(extractedFiles)
                  .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
                  .map(([filename, extractedFile], extIndex) => {
                  // Show status when there are NO firefly assets (job hasn't reached generating/complete), or file is actively uploading
                  const hasFireflyAssets = file.firefly_assets && Object.keys(file.firefly_assets).length > 0;
                  const showStatus = uploadingFiles.has(filename) || !hasFireflyAssets;
                  
                  return (
                    <div key={extIndex} style={{
                      marginBottom: 6, // Reduced from 8
                      fontSize: 12, // Reduced from 13
                      color: '#bfdbfe',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}> {/* Reduced gap */}
                        <span>🖼️</span>
                        <span>{filename}</span>
                      </span>
                      <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}> {/* Reduced gap, always show */}
                        {/* Always show layer type */}
                        <span style={{ 
                          background: 'rgba(59, 130, 246, 0.2)', 
                          padding: '1px 4px', // Reduced padding
                          borderRadius: 3, // Reduced border radius
                          color: '#60a5fa',
                          fontSize: 10 // Reduced from 11
                        }}>
                          {extractedFile.layer_type}
                        </span>
                        {/* Only show status if needed */}
                        {showStatus && (
                          <span style={{
                            fontSize: 10, // Reduced from 11
                            padding: '1px 4px', // Reduced padding
                            borderRadius: 3, // Reduced border radius
                            background: extractedFile.status.toLowerCase() === 'uploaded' 
                              ? 'rgba(16, 185, 129, 0.2)' 
                              : 'rgba(249, 115, 22, 0.2)',
                            color: extractedFile.status.toLowerCase() === 'uploaded' 
                              ? '#34d399' 
                              : '#fdba74'
                          }}>
                            {capitalizeStatus(extractedFile.status)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Digital Collectibles - Only show if there are firefly assets */}
        {file.firefly_assets && Object.keys(file.firefly_assets).length > 0 && (
          <div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10 // Reduced from 12
            }}>
              <h4 style={{
                color: '#34d399',
                fontSize: 15, // Slightly smaller
                fontWeight: 600,
                margin: 0
              }}>
                🎨 Digital Collectibles ({Object.keys(file.firefly_assets).length})
              </h4>
              {(() => {
                // Check if all digital collectibles have "succeeded" or "completed" status (case insensitive)
                const allSucceeded = Object.values(file.firefly_assets || {}).every(
                  asset => ['succeeded', 'completed'].includes(asset.status.toLowerCase())
                );
                
                return allSucceeded ? (
                  <button
                    onClick={() => {
                      // Use the actual file paths from digital collectibles
                      const assetUrls = Object.values(file.firefly_assets || {}).map(asset => 
                        asset.file_path
                      ).filter(url => url);
                      
                      console.log('🎨 Digital collectibles preview - Asset URLs:', assetUrls);
                      
                      const baseName = file.filename.replace('.pdf', '').replace('.PDF', '');
                      const jobPath = jobData?.job_id || '';
                      
                      // Pass the asset URLs as a query parameter
                      const assetUrlsParam = encodeURIComponent(JSON.stringify(assetUrls));
                      router.push(`/job/preview?jobPath=${encodeURIComponent(jobPath)}&fileName=${encodeURIComponent(baseName)}&type=firefly&assetUrls=${assetUrlsParam}`);
                    }}
                    style={{
                      background: 'rgba(52, 211, 153, 0.2)',
                      border: '1px solid rgba(52, 211, 153, 0.4)',
                      borderRadius: 4, // Reduced from 6
                      color: '#34d399',
                      cursor: 'pointer',
                      fontSize: 11, // Reduced from 12
                      padding: '4px 8px', // Reduced padding
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
                    🎨 Preview
                  </button>
                ) : (
                  <span style={{
                    fontSize: 11, // Reduced from 12
                    color: '#9ca3af',
                    padding: '4px 8px', // Reduced padding
                    border: '1px solid rgba(156, 163, 175, 0.3)',
                    borderRadius: 4, // Reduced from 6
                    background: 'rgba(156, 163, 175, 0.1)'
                  }}>
                    ⏳ Generating...
                  </span>
                );
              })()}
            </div>
            <div style={{
              background: 'rgba(52, 211, 153, 0.1)',
              border: '1px solid rgba(52, 211, 153, 0.3)',
              borderRadius: 8,
              padding: 10, // Reduced from 12
              maxHeight: 180, // Reduced from 200
              overflowY: 'auto'
            }}>
              {Object.entries(file.firefly_assets)
                .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
                .map(([assetName, asset], assetIndex) => (
                <div key={assetIndex} style={{
                  marginBottom: 6, // Reduced from 8
                  fontSize: 12, // Reduced from 13
                  color: '#6ee7b7',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}> {/* Reduced gap */}
                    <span>🎨</span>
                    <span>{assetName}</span>
                  </span>
                  <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}> {/* Reduced gap, always show */}
                    {/* Always show card type */}
                    {asset.card_type && (
                      <span style={{
                        fontSize: 10, // Reduced from 11
                        padding: '1px 4px', // Reduced padding
                        borderRadius: 3, // Reduced border radius
                        background: 'rgba(52, 211, 153, 0.2)',
                        color: '#34d399'
                      }}>
                        {asset.card_type}
                      </span>
                    )}
                    {/* Only show status if NOT succeeded or completed */}
                    {!['succeeded', 'completed'].includes(asset.status.toLowerCase()) && (
                      <span style={{
                        fontSize: 10, // Reduced from 11
                        padding: '1px 4px', // Reduced padding
                        borderRadius: 3, // Reduced border radius
                        background: asset.status.toLowerCase() === 'failed'
                          ? 'rgba(239, 68, 68, 0.2)'
                          : 'rgba(249, 115, 22, 0.2)',
                        color: asset.status.toLowerCase() === 'failed'
                          ? '#fca5a5'
                          : '#fdba74'
                      }}>
                        {capitalizeStatus(asset.status)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileCard; 