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

// Error object types
interface ExtractedFileError {
  error_type: string; // 'extraction_error' | 'upload_error' | etc.
  error_message: string;
  error_timestamp?: string;
  // Additional fields may exist depending on error_type
  [key: string]: any;
}

interface FireflyAssetError {
  error_type: string; // 'firefly_top_level_error' or specific job error types
  error_message: string;
  error_timestamp?: string;
  // Additional fields may exist
  [key: string]: any;
}

interface FileData {
  filename: string;
  last_updated?: string;
  original_files?: Record<string, FileInfo>;
  extracted_files?: Record<string, ExtractedFile>;
  firefly_assets?: Record<string, FireflyAsset>;
  // New error maps
  extracted_files_errors?: Record<string, ExtractedFileError>;
  firefly_assets_errors?: Record<string, FireflyAssetError>;
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

  // Determine if this file has any errors to adjust styling and surface details
  const hasErrors = (
    !!file.extracted_files_errors && Object.keys(file.extracted_files_errors).length > 0
  ) || (
    !!file.firefly_assets_errors && Object.keys(file.firefly_assets_errors).length > 0
  );

  return (
    <div style={{
      border: hasErrors ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: 12,
      padding: 20,
      minHeight: 280,
      transition: 'all 0.3s ease',
      opacity: 1,
      animationDelay: `${index * 0.1}s`,
      animation: 'fadeIn 0.3s ease-in-out forwards',
      background: hasErrors ? 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(239,68,68,0.05))' : undefined
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
        gridTemplateColumns: (() => {
          // Check if firefly assets exist and have content
          const hasFireflyAssets = file.firefly_assets && Object.keys(file.firefly_assets).length > 0;
          // Check if extracted files exist (after filtering)
          const allExtractedFiles = file.extracted_files || {};
          const hasExtractedFiles = Object.keys(allExtractedFiles).filter((filename) => {
            const lowerFilename = filename.toLowerCase();
            return !lowerFilename.includes('_seq') && !lowerFilename.includes('_seq_bb');
          }).length > 0;
          
          if (hasFireflyAssets && hasExtractedFiles) {
            // When all three sections exist: 2 columns (left for PDF+Layers stacked, right for Firefly)
            return '1fr 1.2fr';
          } else {
            // Original layout when firefly assets don't exist
            return '1fr 1fr 1.5fr';
          }
        })(),
        gap: 16, // Reduced from 20
        marginBottom: 20 // Reduced from 24
      }}>
        {/* Errors (if any) - spans across all columns */}
        {(hasErrors) && (
          <div style={{ gridColumn: '1 / -1' }}>
            <h4 style={{
              color: '#fca5a5',
              fontSize: 15,
              fontWeight: 600,
              margin: '0 0 10px 0'
            }}>
              ❗ Errors Detected
            </h4>
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 8,
              padding: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              {/* Extraction/Upload errors */}
              {file.extracted_files_errors && Object.keys(file.extracted_files_errors).length > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ color: '#fecaca', fontSize: 13, fontWeight: 600 }}>
                      PDF Extraction/Upload Errors ({Object.keys(file.extracted_files_errors).length})
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {Object.entries(file.extracted_files_errors)
                      .sort(([a],[b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
                      .map(([name, err], i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#fecaca' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 600 }}>{name}</span>
                            <span style={{
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: 'rgba(239,68,68,0.25)',
                              color: '#fecaca'
                            }}>{err.error_type}</span>
                          </span>
                          <span style={{ color: '#fca5a5', marginLeft: 8, flex: 1, textAlign: 'right', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }} title={err.error_message}>
                            {err.error_message}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Firefly processing errors */}
              {file.firefly_assets_errors && Object.keys(file.firefly_assets_errors).length > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0' }}>
                    <span style={{ color: '#fecaca', fontSize: 13, fontWeight: 600 }}>
                      Firefly Errors ({Object.keys(file.firefly_assets_errors).length})
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {Object.entries(file.firefly_assets_errors)
                      .sort(([a],[b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
                      .map(([name, err], i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#fecaca' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 600 }}>{name}</span>
                            <span style={{
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: 'rgba(239,68,68,0.25)',
                              color: '#fecaca'
                            }}>{err.error_type}</span>
                          </span>
                          <span style={{ color: '#fca5a5', marginLeft: 8, flex: 1, textAlign: 'right', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }} title={err.error_message}>
                            {err.error_message}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Original PDF Files and Extracted Layers Container */}
        {(() => {
          // Check if we need to stack PDF and Layers vertically
          const hasFireflyAssets = file.firefly_assets && Object.keys(file.firefly_assets).length > 0;
          const allExtractedFiles = file.extracted_files || {};
          const hasExtractedFiles = Object.keys(allExtractedFiles).filter((filename) => {
            const lowerFilename = filename.toLowerCase();
            return !lowerFilename.includes('_seq') && !lowerFilename.includes('_seq_bb');
          }).length > 0;
          
          const shouldStack = hasFireflyAssets && hasExtractedFiles;
          
          if (shouldStack) {
            // Stack PDF and Layers vertically in first column
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Original PDF Files */}
                <div>
                  <h4 style={{
                    color: '#f59e0b',
                    fontSize: 15,
                    fontWeight: 600,
                    margin: '0 0 10px 0'
                  }}>
                    📄 Original PDF Files ({file.original_files ? Object.keys(file.original_files).length : 0})
                  </h4>
                  <div style={{
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    borderRadius: 8,
                    padding: 10,
                    maxHeight: 140, // Reduced for stacking
                    overflowY: 'auto'
                  }}>
                    {file.original_files && Object.keys(file.original_files).length > 0 ? (
                      Object.entries(file.original_files)
                        .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
                        .map(([filename, fileInfo], origIndex) => {
                        const showStatus = uploadingFiles.has(filename) || !hasFireflyAssets;
                        
                        return (
                          <div key={origIndex} style={{
                            marginBottom: 6,
                            fontSize: 12,
                            color: '#fbbf24',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                              <span>📋</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span>{filename}</span>
                                {uploadingFiles.has(filename) && (
                                  <div style={{
                                    width: 10,
                                    height: 10,
                                    border: '1.5px solid rgba(245, 158, 11, 0.3)',
                                    borderTop: '1.5px solid #f59e0b',
                                    borderRadius: '50%',
                                    animation: 'spin 1s linear infinite',
                                    marginLeft: 3
                                  }} />
                                )}
                              </span>
                              {uploadingFiles.has(filename) && (
                                <span style={{
                                  fontSize: 10,
                                  color: '#f59e0b',
                                  animation: 'pulse 2s infinite',
                                  marginLeft: 3
                                }}>
                                  Uploading...
                                </span>
                              )}
                            </span>
                            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                              <span style={{
                                fontSize: 10,
                                padding: '1px 4px',
                                borderRadius: 3,
                                background: 'rgba(245, 158, 11, 0.2)',
                                color: '#f59e0b'
                              }}>
                                {fileInfo.card_type}
                              </span>
                              {showStatus && (
                                <span style={{
                                  fontSize: 10,
                                  padding: '1px 4px',
                                  borderRadius: 3,
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
                      <p style={{ color: '#9ca3af', fontSize: 12, margin: 0 }}>
                        No original PDF files found
                      </p>
                    )}
                  </div>
                </div>

                {/* Extracted Layers */}
                {(() => {
                  const extractedFiles = Object.fromEntries(
                    Object.entries(allExtractedFiles).filter(([filename]) => {
                      const lowerFilename = filename.toLowerCase();
                      return !lowerFilename.includes('_seq') && !lowerFilename.includes('_seq_bb');
                    })
                  );
                  
                  if (Object.keys(extractedFiles).length === 0) return null;
                  
                  const allUploaded = Object.values(allExtractedFiles).every(
                    extractedFile => extractedFile.status.toLowerCase() === 'uploaded'
                  );
                  
                  return (
                    <div>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 10
                      }}>
                        <h4 style={{
                          color: '#60a5fa',
                          fontSize: 15,
                          fontWeight: 600,
                          margin: 0
                        }}>
                          🖼️ Extracted Layers ({Object.keys(extractedFiles).length})
                        </h4>
                        {allUploaded ? (
                          <button
                            onClick={() => {
                              const jobId = jobData?.job_id || '';
                              const fileId = file.filename;
                              const mode = 'extracted-assets';
                              
                              console.log(`🔍 [FileCard] Navigating to extracted assets preview:`, {
                                jobId,
                                fileId,
                                mode
                              });
                              
                              router.push(`/job/preview?jobId=${encodeURIComponent(jobId)}&fileId=${encodeURIComponent(fileId)}&mode=${mode}`);
                            }}
                            style={{
                              background: 'rgba(59, 130, 246, 0.2)',
                              border: '1px solid rgba(59, 130, 246, 0.4)',
                              borderRadius: 4,
                              color: '#60a5fa',
                              cursor: 'pointer',
                              fontSize: 11,
                              padding: '4px 8px',
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
                            fontSize: 11,
                            color: '#9ca3af',
                            padding: '4px 8px',
                            border: '1px solid rgba(156, 163, 175, 0.3)',
                            borderRadius: 4,
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
                        padding: 10,
                        // Removed maxHeight to use available space dynamically
                        overflowY: 'visible'
                      }}>
                        {Object.entries(extractedFiles)
                          .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
                          .map(([filename, extractedFile], extIndex) => {
                          const showStatus = uploadingFiles.has(filename) || !hasFireflyAssets;
                          
                          return (
                            <div key={extIndex} style={{
                              marginBottom: 6,
                              fontSize: 12,
                              color: '#bfdbfe',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                                <span>🖼️</span>
                                <span>{filename}</span>
                              </span>
                              <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                                <span style={{ 
                                  background: 'rgba(59, 130, 246, 0.2)', 
                                  padding: '1px 4px',
                                  borderRadius: 3,
                                  color: '#60a5fa',
                                  fontSize: 10
                                }}>
                                  {extractedFile.layer_type}
                                </span>
                                {showStatus && (
                                  <span style={{
                                    fontSize: 10,
                                    padding: '1px 4px',
                                    borderRadius: 3,
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
              </div>
            );
          } else {
            // Original layout when firefly assets don't exist
            return (
              <>
                {/* Original PDF Files */}
                <div>
                  <h4 style={{
                    color: '#f59e0b',
                    fontSize: 15,
                    fontWeight: 600,
                    margin: '0 0 10px 0'
                  }}>
                    📄 Original PDF Files ({file.original_files ? Object.keys(file.original_files).length : 0})
                  </h4>
                  <div style={{
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    borderRadius: 8,
                    padding: 10,
                    maxHeight: 180,
                    overflowY: 'auto'
                  }}>
                    {file.original_files && Object.keys(file.original_files).length > 0 ? (
                      Object.entries(file.original_files)
                        .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
                        .map(([filename, fileInfo], origIndex) => {
                        const showStatus = uploadingFiles.has(filename) || !hasFireflyAssets;
                        
                        return (
                          <div key={origIndex} style={{
                            marginBottom: 6,
                            fontSize: 12,
                            color: '#fbbf24',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                              <span>📋</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span>{filename}</span>
                                {uploadingFiles.has(filename) && (
                                  <div style={{
                                    width: 10,
                                    height: 10,
                                    border: '1.5px solid rgba(245, 158, 11, 0.3)',
                                    borderTop: '1.5px solid #f59e0b',
                                    borderRadius: '50%',
                                    animation: 'spin 1s linear infinite',
                                    marginLeft: 3
                                  }} />
                                )}
                              </span>
                              {uploadingFiles.has(filename) && (
                                <span style={{
                                  fontSize: 10,
                                  color: '#f59e0b',
                                  animation: 'pulse 2s infinite',
                                  marginLeft: 3
                                }}>
                                  Uploading...
                                </span>
                              )}
                            </span>
                            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                              <span style={{
                                fontSize: 10,
                                padding: '1px 4px',
                                borderRadius: 3,
                                background: 'rgba(245, 158, 11, 0.2)',
                                color: '#f59e0b'
                              }}>
                                {fileInfo.card_type}
                              </span>
                              {showStatus && (
                                <span style={{
                                  fontSize: 10,
                                  padding: '1px 4px',
                                  borderRadius: 3,
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
                      <p style={{ color: '#9ca3af', fontSize: 12, margin: 0 }}>
                        No original PDF files found
                      </p>
                    )}
                  </div>
                </div>
                
                {/* Extracted Layers - Only show if there are extracted files */}
                {(() => {
                  const extractedFiles = Object.fromEntries(
                    Object.entries(allExtractedFiles).filter(([filename]) => {
                      const lowerFilename = filename.toLowerCase();
                      return !lowerFilename.includes('_seq') && !lowerFilename.includes('_seq_bb');
                    })
                  );
                  
                  if (Object.keys(extractedFiles).length === 0) return null;
                  
                  const allUploaded = Object.values(allExtractedFiles).every(
                    extractedFile => extractedFile.status.toLowerCase() === 'uploaded'
                  );
                  
                  return (
                    <div>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 10
                      }}>
                        <h4 style={{
                          color: '#60a5fa',
                          fontSize: 15,
                          fontWeight: 600,
                          margin: 0
                        }}>
                          🖼️ Extracted Layers ({Object.keys(extractedFiles).length})
                        </h4>
                        {allUploaded ? (
                          <button
                            onClick={() => {
                              const jobId = jobData?.job_id || '';
                              const fileId = file.filename;
                              const mode = 'extracted-assets';
                              
                              console.log(`🔍 [FileCard] Navigating to extracted assets preview:`, {
                                jobId,
                                fileId,
                                mode
                              });
                              
                              router.push(`/job/preview?jobId=${encodeURIComponent(jobId)}&fileId=${encodeURIComponent(fileId)}&mode=${mode}`);
                            }}
                            style={{
                              background: 'rgba(59, 130, 246, 0.2)',
                              border: '1px solid rgba(59, 130, 246, 0.4)',
                              borderRadius: 4,
                              color: '#60a5fa',
                              cursor: 'pointer',
                              fontSize: 11,
                              padding: '4px 8px',
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
                            fontSize: 11,
                            color: '#9ca3af',
                            padding: '4px 8px',
                            border: '1px solid rgba(156, 163, 175, 0.3)',
                            borderRadius: 4,
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
                        padding: 10,
                        // Removed maxHeight to use available space dynamically
                        overflowY: 'visible'
                      }}>
                        {Object.entries(extractedFiles)
                          .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
                          .map(([filename, extractedFile], extIndex) => {
                          const showStatus = uploadingFiles.has(filename) || !hasFireflyAssets;
                          
                          return (
                            <div key={extIndex} style={{
                              marginBottom: 6,
                              fontSize: 12,
                              color: '#bfdbfe',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                                <span>🖼️</span>
                                <span>{filename}</span>
                              </span>
                              <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                                <span style={{ 
                                  background: 'rgba(59, 130, 246, 0.2)', 
                                  padding: '1px 4px',
                                  borderRadius: 3,
                                  color: '#60a5fa',
                                  fontSize: 10
                                }}>
                                  {extractedFile.layer_type}
                                </span>
                                {showStatus && (
                                  <span style={{
                                    fontSize: 10,
                                    padding: '1px 4px',
                                    borderRadius: 3,
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
              </>
            );
          }
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
                      // Navigate to preview with simplified parameters
                      const jobId = jobData?.job_id || '';
                      const fileId = file.filename;
                      const mode = 'digital-assets';
                      
                      console.log(`🎨 [FileCard] Navigating to digital assets preview:`, {
                        jobId,
                        fileId,
                        mode
                      });
                      
                      router.push(`/job/preview?jobId=${encodeURIComponent(jobId)}&fileId=${encodeURIComponent(fileId)}&mode=${mode}`);
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
              // Removed maxHeight to show all firefly assets without scrolling
              overflowY: 'visible'
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