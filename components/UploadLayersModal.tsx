'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { contentPipelineApi } from '../web/utils/contentPipelineApi';
import { buildS3UploadsPath } from '../utils/environment';

type LayerType = 'overlay1' | 'back' | 'cmyk' | 'spot' | 'wp' | 'wp_inv' | 'foil' | 'coldfoil';

interface UploadLayersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    files: File[],
    layerType: LayerType,
    results: Array<{
      file: File;
      matchStatus: 'matched' | 'unmatched';
      matchedCardId?: string;
      newFilename?: string;
    }>
  ) => void;
  fileObjects: Array<{ card_id?: string; release?: string } & Record<string, any>>; // pass in full file objects; we'll read card_id/release
  jobId?: string;
  appName?: string;
}

export const UploadLayersModal = ({
  isOpen,
  onClose,
  onConfirm,
  fileObjects,
  jobId,
  appName
}: UploadLayersModalProps) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedLayerType, setSelectedLayerType] = useState<LayerType | ''>('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [totalToUpload, setTotalToUpload] = useState(0);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);

  const layerTypes: LayerType[] = useMemo(
    () => ['overlay1', 'back', 'cmyk', 'spot', 'wp', 'wp_inv', 'foil', 'coldfoil'],
    []
  );

  const getBaseName = (name: string) => {
    const justName = name.replace(/^.*[\\/]/, '');
    const idx = justName.lastIndexOf('.');
    return idx > 0 ? justName.substring(0, idx) : justName;
  };
  const getExtension = (name: string) => {
    const justName = name.replace(/^.*[\\/]/, '');
    const idx = justName.lastIndexOf('.');
    return idx > 0 ? justName.substring(idx + 1) : '';
  };

  const handleFilesChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const filesList = Array.from(e.target.files || []);
    setSelectedFiles(filesList);
  };

  const canConfirm = selectedFiles.length > 0 && !!selectedLayerType;

  const previewResults = useMemo(() => {
    const normalizedFileObjects = (fileObjects || []).map((fo) => ({
      card_id: (fo.card_id || '').toLowerCase(),
      release: (fo.release || '').trim()
    })).filter(fo => !!fo.card_id);
    return selectedFiles.map((file) => {
      const fileNameLower = file.name.toLowerCase();
      const matches = normalizedFileObjects.filter((fo) => fileNameLower.includes(fo.card_id));
      if (matches.length === 1) {
        const matched = matches[0];
        const matchedCardId = matched.card_id;
        const ext = getExtension(file.name);
        // Build strictly from file object values:
        // {file_release}_{file_card_id}_{selected_type}.{ext}
        const release = matched.release;
        const newFilename =
          selectedLayerType && release
            ? `${release}_${matchedCardId}_${selectedLayerType}.${ext}`
            : selectedLayerType
              ? `${matchedCardId}_${selectedLayerType}.${ext}`
              : '';
        return {
          file,
          matchStatus: 'matched' as const,
          matchedCardId,
          newFilename
        };
      } else if (matches.length === 0) {
        return {
          file,
          matchStatus: 'unmatched' as const
        };
      } else {
        // Treat ambiguous (>1 match) as unmatched per requirement
        return {
          file,
          matchStatus: 'unmatched' as const
        };
      }
    });
  }, [selectedFiles, selectedLayerType, fileObjects]);

  // Important: guard comes AFTER all hooks to preserve hook order across renders
  if (!isOpen) return null;

  const matchedResults = previewResults.filter(r => r.matchStatus === 'matched' && r.newFilename);

  const handleUpload = async () => {
    if (!selectedLayerType || matchedResults.length === 0) return;
    const safeJobId = (jobId || '').trim();
    const safeAppName = (appName || '').trim();
    const extractedFolder = buildS3UploadsPath(`${safeAppName || 'UnknownApp'}/${safeJobId || 'UnknownJob'}/Extracted_new`);

    setIsUploading(true);
    setUploadedCount(0);
    setTotalToUpload(matchedResults.length);
    setUploadErrors([]);
    
    for (const result of matchedResults) {
      try {
        const filenameKey = `${extractedFolder}/${result.newFilename}`;
        const presigned = await contentPipelineApi.getPresignedUrl({
          client_method: 'put',
          filename: filenameKey,
          size: result.file.size,
          content_type: result.file.type || 'application/octet-stream'
        });
        
        let resp;
        if (presigned.fields && presigned.method === 'POST') {
          const formData = new FormData();
          Object.entries(presigned.fields).forEach(([k, v]) => {
            if (k.toLowerCase().startsWith('x-amz-meta-')) return; // avoid extra meta fields not in policy
            formData.append(k, v as string);
          });
          formData.append('file', result.file);
          resp = await fetch(presigned.url, { method: 'POST', body: formData });
        } else {
          resp = await fetch(presigned.url, {
            method: 'PUT',
            headers: { 'Content-Type': result.file.type || 'application/octet-stream' },
            body: result.file
          });
        }
        if (!resp.ok) {
          const errText = await resp.text().catch(() => '');
          throw new Error(`S3 upload failed: ${resp.status} ${errText}`);
        }
        setUploadedCount(prev => prev + 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setUploadErrors(prev => [...prev, `${result.newFilename}: ${msg}`]);
      }
    }
    setIsUploading(false);
  };

  const modalContent = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1500,
        padding: 16
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#1f2937',
          borderRadius: 16,
          padding: 24,
          maxWidth: 560,
          width: '90%',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          position: 'relative',
          color: '#e5e7eb'
        }}
      >
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f3f4f6' }}>
            Upload layers
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              color: '#9ca3af',
              border: 'none',
              cursor: 'pointer',
              fontSize: 18
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 14, color: '#d1d5db', fontWeight: 600 }}>
              Layer type
            </label>
            <select
              value={selectedLayerType}
              onChange={(e) => setSelectedLayerType(e.target.value as LayerType)}
              style={{
                background: '#0b1220',
                color: '#e5e7eb',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                padding: '10px 12px',
                appearance: 'none'
              }}
            >
              <option value="" style={{ color: '#9ca3af' }}>
                Select layer type...
              </option>
              {layerTypes.map((lt) => (
                <option key={lt} value={lt}>
                  {lt}
                </option>
              ))}
            </select>
          </div>

          {selectedLayerType && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 14, color: '#d1d5db', fontWeight: 600 }}>
                Select folder with layer image files
              </label>
              <input
                type="file"
                multiple
                accept="image/*"
                {...({ webkitdirectory: '' } as any)}
                onChange={handleFilesChange}
                style={{
                  background: '#0b1220',
                  color: '#e5e7eb',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8,
                  padding: 10
                }}
              />
              <div style={{ fontSize: 12, color: '#9ca3af' }}>
                {selectedFiles.length > 0
                  ? `${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'} selected`
                  : 'No files selected'}
              </div>
            </div>
          )}

          {/* Preview: matched and unmatched */}
          {selectedFiles.length > 0 && (
            <div style={{ marginTop: 4, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 260px', minWidth: 260 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e5e7eb', marginBottom: 8 }}>
                  Matched ({previewResults.filter(r => r.matchStatus === 'matched').length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                  {previewResults.filter(r => r.matchStatus === 'matched').length === 0 ? (
                    <div style={{ color: '#9ca3af', fontSize: 13 }}>No matches yet.</div>
                  ) : (
                    previewResults.filter(r => r.matchStatus === 'matched').map((r, idx) => (
                      <div key={idx} style={{
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 8,
                        padding: 8,
                        background: '#0b1220'
                      }}>
                        <div style={{ fontSize: 13, color: '#d1d5db' }}>
                          <span style={{ color: '#9ca3af' }}>File:</span> {r.file.name}
                        </div>
                        <div style={{ fontSize: 13, color: '#d1d5db' }}>
                          <span style={{ color: '#9ca3af' }}>card_id:</span> {r.matchedCardId}
                        </div>
                        <div style={{ fontSize: 13, color: '#10b981' }}>
                          <span style={{ color: '#9ca3af' }}>upload as:</span> {r.newFilename || '—'}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={{ flex: '1 1 260px', minWidth: 260 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e5e7eb', marginBottom: 8 }}>
                  Unmatched ({previewResults.filter(r => r.matchStatus !== 'matched').length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                  {previewResults.filter(r => r.matchStatus !== 'matched').length === 0 ? (
                    <div style={{ color: '#9ca3af', fontSize: 13 }}>All files matched.</div>
                  ) : (
                    previewResults.filter(r => r.matchStatus !== 'matched').map((r, idx) => (
                      <div key={idx} style={{
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 8,
                        padding: 8,
                        background: '#0b1220'
                      }}>
                        <div style={{ fontSize: 13, color: '#d1d5db' }}>
                          <span style={{ color: '#9ca3af' }}>File:</span> {r.file.name}
                        </div>
                        <div style={{ fontSize: 12, color: '#ef4444' }}>
                          No matching card_id found
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
          
          {isUploading && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 16,
                height: 16,
                border: '2px solid rgba(255,255,255,0.3)',
                borderTop: '2px solid #fff',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
              <div style={{ fontSize: 13, color: '#d1d5db' }}>
                Uploading {uploadedCount}/{totalToUpload}...
              </div>
            </div>
          )}
          {uploadErrors.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#fca5a5' }}>
              {uploadErrors.length} failed:
              <ul style={{ margin: '6px 0 0 16px' }}>
                {uploadErrors.slice(0, 3).map((e, i) => (<li key={i}>{e}</li>))}
              </ul>
              {uploadErrors.length > 3 && <div>…and {uploadErrors.length - 3} more</div>}
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: 16,
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end'
          }}
        >
          <button
            onClick={onClose}
            disabled={isUploading}
            style={{
              background: 'transparent',
              color: '#e5e7eb',
              border: '1px solid rgba(255,255,255,0.12)',
              padding: '10px 14px',
              borderRadius: 8,
              cursor: isUploading ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 600
            }}
          >
            Cancel
          </button>
          {(() => {
            const isCompleted = uploadedCount > 0 && uploadedCount === totalToUpload && uploadErrors.length === 0;
            const isDisabled = isUploading || (!canConfirm && !isCompleted);
            return (
              <button
                disabled={isDisabled}
                onClick={() => {
                  if (isDisabled) return;
                  if (isCompleted) {
                    onClose();
                    return;
                  }
                  handleUpload();
                }}
                style={{
                  background: (!isDisabled && !isCompleted) ? '#2563eb' : (isCompleted ? '#10b981' : '#1f2a44'),
                  color: (!isDisabled || isCompleted) ? 'white' : '#94a3b8',
                  border: 'none',
                  padding: '10px 14px',
                  borderRadius: 8,
                  cursor: (!isDisabled) ? 'pointer' : 'not-allowed',
                  fontSize: 14,
                  fontWeight: 700
                }}
              >
                {isCompleted ? 'Done' : 'Upload'}
              </button>
            );
          })()}
        </div>
        
        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};


