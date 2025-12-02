'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

type LayerType = 'overlay1' | 'back' | 'cmyk' | 'spot' | 'wp' | 'wp_inv' | 'foil' | 'coldfoil';

interface UploadLayersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    files: File[],
    layerType: LayerType,
    results: Array<{
      file: File;
      matchStatus: 'matched' | 'unmatched' | 'ambiguous';
      matchedCardId?: string;
      newFilename?: string;
    }>
  ) => void;
  cardIds: string[]; // expected card identifiers to match against (derived from job files)
  fileRelease?: string; // optional release prefix to use in upload naming
}

export const UploadLayersModal = ({
  isOpen,
  onClose,
  onConfirm,
  cardIds,
  fileRelease
}: UploadLayersModalProps) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedLayerType, setSelectedLayerType] = useState<LayerType | ''>('');

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
    const normalizedCardIds = (cardIds || []).map((id) => id.toLowerCase());
    return selectedFiles.map((file) => {
      const fileNameLower = file.name.toLowerCase();
      const matches = normalizedCardIds.filter((id) => fileNameLower.includes(id));
      if (matches.length === 1) {
        const matchedCardId = matches[0];
        const ext = getExtension(file.name);
        // Build: {file_release}_{file_card_id}_{selected_type}.{ext}
        // Derive file_release from the selected file's base name by stripping trailing _<digits>
        const base = getBaseName(file.name);
        const derivedRelease = base.replace(/(?:[_-])?\d+$/, ''); // remove trailing id with optional sep
        // Extract release as the 2nd segment (underscore or hyphen separated). Fallbacks applied if unavailable.
        const releaseFromName = (() => {
          const cleaned = (derivedRelease || '').replace(/(^[_-]+|[_-]+$)/g, '');
          const segments = cleaned.split(/[_-]+/).filter(Boolean);
          if (segments.length >= 2) return segments[1];
          if (segments.length === 1) return segments[0];
          return '';
        })();
        // Prefer extracted token; then prop; otherwise empty
        const release = (releaseFromName || (fileRelease || '')).trim();
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
        return {
          file,
          matchStatus: 'ambiguous' as const
        };
      }
    });
  }, [selectedFiles, selectedLayerType, cardIds, fileRelease]);

  // Important: guard comes AFTER all hooks to preserve hook order across renders
  if (!isOpen) return null;

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
                        <div style={{ fontSize: 12, color: r.matchStatus === 'ambiguous' ? '#f59e0b' : '#ef4444' }}>
                          {r.matchStatus === 'ambiguous' ? 'Multiple possible card_id matches' : 'No matching card_id found'}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
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
            style={{
              background: 'transparent',
              color: '#e5e7eb',
              border: '1px solid rgba(255,255,255,0.12)',
              padding: '10px 14px',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600
            }}
          >
            Cancel
          </button>
          <button
            disabled={!canConfirm}
            onClick={() => {
              if (!canConfirm) return;
              onConfirm(selectedFiles, selectedLayerType as LayerType, previewResults);
            }}
            style={{
              background: canConfirm ? '#2563eb' : '#1f2a44',
              color: canConfirm ? 'white' : '#94a3b8',
              border: 'none',
              padding: '10px 14px',
              borderRadius: 8,
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              fontSize: 14,
              fontWeight: 700
            }}
          >
            Upload
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};


