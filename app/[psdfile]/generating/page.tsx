'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import styles from '../../../styles/Review.module.css';
import { usePsdStore } from '../../../web/store/psdStore';
import { getFireflyToken, createFireflyAsset, collectLayerParameters, buildFireflyLayersPayload } from '../../../web/utils/firefly';
import PageTitle from '../../../components/PageTitle';

const baseSteps = [
  'Uploading replaced smart objects',
  'Getting presigned URLs for inputs',
  'Getting presigned URL for output',
  'Authenticating with Firefly',
  'Creating asset with Firefly',
  'Polling job status',
  'Complete!'
];

// Recursively flatten and merge all layers (including children)
function buildLayerList(layers: any[], edits: any, smartObjectUrls: Record<string, string>) {
  let result: any[] = [];
  for (const layer of layers) {
    const id = layer.id;
    const edit = edits[id] || {};
    const out: any = {
      name: layer.name,
      visible: edit.visible !== undefined ? edit.visible : layer.visible,
      edit: {},
    };
    if (layer.type === 'type' && (edit.text || layer.text)) {
      out.text = { content: edit.text || layer.text };
    }
    if (layer.type === 'smartobject' && smartObjectUrls[id]) {
      out.input = {
        storage: 'external',
        href: smartObjectUrls[id]
      };
    }
    result.push(out);
    if (layer.children && Array.isArray(layer.children)) {
      result = result.concat(buildLayerList(layer.children, edits, smartObjectUrls));
    }
  }
  return result;
}

export default function GeneratingPage() {
  const router = useRouter();
  const params = useParams();
  const psdfile = params.psdfile;
  const { data, edits, originals } = usePsdStore();
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stepStatus, setStepStatus] = useState<(null | 'done' | 'error')[]>(Array(baseSteps.length).fill(null));
  const [outputImageUrl, setOutputImageUrl] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>('submitted');
  const [smartObjectUploadProgress, setSmartObjectUploadProgress] = useState<Record<string, number>>({});
  const [outputFilename, setOutputFilename] = useState<string>('');
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [uploadedS3Keys, setUploadedS3Keys] = useState<Record<string, string>>({});  // Store actual S3 keys from uploads

  // Helper to get all replaced smart object files
  const getReplacedSmartObjects = () => {
    return Object.entries(edits.smartObjects)
      .filter(([id, file]) => file && file instanceof File)
      .map(([id, file]) => ({
        id,
        file: file as File
      }));
  };

  // Make smartObjects available in render scope
  const smartObjects = getReplacedSmartObjects();

  // Helper to poll Firefly job status
  const pollJobStatus = async (jobUrl: string) => {
    try {
      const response = await fetch('/api/firefly-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status', jobUrl }),
      });
      if (!response.ok) throw new Error('Failed to check job status');
      const data = await response.json();
      const status = data.status || (data.outputs && data.outputs[0]?.status);
      setJobStatus(status);
      return status;
    } catch (err: any) {
      setError('Failed to check job status: ' + (err.message || err.toString()));
      setStepStatus(s => { const arr = [...s]; arr[5] = 'error'; return arr; });
      return 'failed';
    }
  };

  // Helper to upload file with progress tracking via s3-proxy
  const uploadFileWithProgress = async (file: File, filename: string): Promise<string> => {
    return new Promise<string>(async (resolve, reject) => {
      try {
        // Get upload instructions via s3-proxy with upload=true to avoid CORS
        console.log(`🔗 Getting upload instructions via s3-proxy for: ${filename}`);
        const response = await fetch('/api/s3-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_method: 'put',
            filename: filename,
            upload: true, // Use s3-upload endpoint to avoid CORS
            expires_in: 3600
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to get upload instructions: ${response.status}`);
        }

        const { uploadUrl, presignedUrl } = await response.json();
        console.log(`📤 Using s3-upload endpoint for ${file.name}`);
        
        // Upload via our s3-upload endpoint to avoid CORS issues
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl, true);
        xhr.setRequestHeader('Content-Type', file.type || 'image/jpeg');
        xhr.setRequestHeader('x-presigned-url', presignedUrl);
        
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setSmartObjectUploadProgress(prev => ({
              ...prev,
              [file.name]: percent
            }));
          }
        };
        
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setSmartObjectUploadProgress(prev => ({
              ...prev,
              [file.name]: 100
            }));
            console.log(`✅ Successfully uploaded smart object: ${file.name} to S3 key: ${filename}`);
            resolve(filename); // Return the filename as S3 key
          } else {
            const error = `Upload failed: ${xhr.status} ${xhr.statusText}`;
            console.error(`❌ ${error}`);
            reject(new Error(error));
          }
        };
        
        xhr.onerror = () => {
          const error = 'Upload failed: Network error';
          console.error(`❌ ${error}`);
          reject(new Error(error));
        };
        
        // Send the file to our upload proxy
        xhr.send(file);
        
      } catch (error) {
        console.error(`❌ Failed to get upload instructions for ${file.name}:`, error);
        reject(error);
      }
    });
  };

  useEffect(() => {
    let isMounted = true;
    let pollInterval: NodeJS.Timeout;

    async function runSteps() {
      try {
        // Pre-check for valid options/parameters
        if (!data?.layers || !Array.isArray(data.layers)) {
          setError('PSD data is missing or invalid. Please review your edits.');
          return;
        }

        // Build smartObjectUrls map for replaced smart objects
        const smartObjectUrls: Record<number, string> = {};
        let uploadedKeys: Record<string, string> = {}; // Declare here to use across steps

        // 1. Upload smart objects (using same content pipeline API as PDF uploads)
        setCurrentStep(0);
        setStepStatus(s => { const arr = [...s]; arr[0] = null; return arr; });
        try {
          // Extract base name (remove any extension like .json) for upload paths
          let baseName: string;
          if (typeof psdfile === 'string') {
            baseName = psdfile.replace(/\.[^/.]+$/, '');
          } else if (Array.isArray(psdfile) && psdfile.length > 0) {
            baseName = psdfile[0].replace(/\.[^/.]+$/, '');
          } else {
            throw new Error('Invalid psdfile parameter');
          }
          
          // Store S3 keys for later use in presigned URL generation
          for (const { id, file } of smartObjects) {
            const uploadPath = `${baseName}/inputs/${file.name}`;
            const actualS3Key = await uploadFileWithProgress(file, uploadPath);
            uploadedKeys[id] = actualS3Key; // Store actual S3 key by smart object ID
            console.log(`📝 Stored S3 key for smart object ${id}: ${actualS3Key}`);
          }
          
          // Update state with the actual S3 keys (for debugging/other uses)
          setUploadedS3Keys(uploadedKeys);
          if (!isMounted) return;
          setStepStatus(s => { const arr = [...s]; arr[0] = 'done'; return arr; });
        } catch (err: any) {
          setError('Failed to upload smart objects: ' + (err.message || err.toString()));
          setStepStatus(s => { const arr = [...s]; arr[0] = 'error'; return arr; });
          return;
        }

        // 2. Get presigned URLs for inputs
        setCurrentStep(1);
        setStepStatus(s => { const arr = [...s]; arr[1] = null; return arr; });
        let psdGetUrl: string;
        try {
          // Ensure .psd extension is present, removing any existing extension first
          let psdFilename: string;
          if (typeof psdfile === 'string') {
            // Remove any existing extension (like .json) and add .psd
            const baseName = psdfile.replace(/\.[^/.]+$/, '');
            psdFilename = `${baseName}.psd`;
          } else if (Array.isArray(psdfile) && psdfile.length > 0) {
            // Handle array case from router query
            const baseName = psdfile[0].replace(/\.[^/.]+$/, '');
            psdFilename = `${baseName}.psd`;
          } else {
            throw new Error('Invalid psdfile parameter');
          }
          const psdResponse = await fetch('/api/s3-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_method: 'get',
              filename: psdFilename
            }),
          });
          
          if (!psdResponse.ok) {
            throw new Error(`Failed to get presigned URL for PSD: ${psdResponse.status}`);
          }
          
          const psdData = await psdResponse.json();
          psdGetUrl = psdData.url;
          if (!psdGetUrl) {
            throw new Error('Failed to get presigned URL for PSD file');
          }
          console.log('PSD Get URL:', psdGetUrl);

        // Fill in the smartObjectUrls with presigned GET URLs using actual S3 keys from uploads
        const smartObjectGetUrls = await Promise.all(
          Object.entries(edits.smartObjects).map(async ([id, file]) => {
            if (!file) return null;
            
            // Use the actual S3 key that was used during upload (from local variable, not state)
            const actualS3Key = uploadedKeys[id];
            if (!actualS3Key) {
              console.error(`Available uploaded keys:`, Object.keys(uploadedKeys));
              console.error(`Looking for key:`, id);
              throw new Error(`No S3 key found for smart object ${id} - upload may have failed`);
            }
            
            console.log(`🔗 Getting presigned GET URL for smart object ${id} using S3 key: ${actualS3Key}`);
            const smartObjectResponse = await fetch('/api/s3-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                client_method: 'get',
                filename: actualS3Key
              }),
            });
            
            if (!smartObjectResponse.ok) {
              throw new Error(`Failed to get presigned URL for smart object: ${smartObjectResponse.status}`);
            }
            
            const smartObjectData = await smartObjectResponse.json();
            const url = smartObjectData.url;
            if (!url) {
              throw new Error(`Failed to get presigned URL for smart object ${file.name} with S3 key: ${actualS3Key}`);
            }
            return {
              id: Number(id),
              url
            };
          })
        );
        smartObjectGetUrls.forEach(obj => {
          if (obj) smartObjectUrls[obj.id] = obj.url;
        });
        if (!isMounted) return;
          setStepStatus(s => { const arr = [...s]; arr[1] = 'done'; return arr; });
        } catch (err: any) {
          setError('Failed to get presigned URLs: ' + (err.message || err.toString()));
          setStepStatus(s => { const arr = [...s]; arr[1] = 'error'; return arr; });
          return;
        }

        // 3. Get presigned URL for output
        setCurrentStep(2);
        setStepStatus(s => { const arr = [...s]; arr[2] = null; return arr; });
        // Extract base name (remove any extension like .json, .psd, etc.)
        let baseName: string;
        if (typeof psdfile === 'string') {
          baseName = psdfile.replace(/\.[^/.]+$/, '');
        } else if (Array.isArray(psdfile) && psdfile.length > 0) {
          baseName = psdfile[0].replace(/\.[^/.]+$/, '');
        } else {
          throw new Error('Invalid psdfile parameter');
        }
        // Format date as mm:dd:yy_HH:mm
        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const mm = pad(now.getMonth() + 1);
        const dd = pad(now.getDate());
        const yy = now.getFullYear().toString().slice(-2);
        const HH = pad(now.getHours());
        const min = pad(now.getMinutes());
        const dateStr = `${mm}:${dd}:${yy}_${HH}:${min}`;
        // Build output path using base name without extension
        const outputFilename = `${baseName}/output/output_${dateStr}.jpg`;

        const outputPutResponse = await fetch('/api/s3-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_method: 'put',
            filename: outputFilename
          }),
        });
        
        if (!outputPutResponse.ok) {
          throw new Error(`Failed to get presigned PUT URL for output: ${outputPutResponse.status}`);
        }
        
        const outputPutData = await outputPutResponse.json();
        const outputPutUrl = outputPutData.url;
        if (!isMounted) return;
        setStepStatus(s => { const arr = [...s]; arr[2] = 'done'; return arr; });

        // 4. Authenticate with Firefly
        setCurrentStep(3);
        setStepStatus(s => { const arr = [...s]; arr[3] = null; return arr; });
        let fireflyToken;
        try {
          fireflyToken = await getFireflyToken();
        } catch (err: any) {
          setError('Firefly authentication failed: ' + (err.message || err.toString()));
          setStepStatus(s => { const arr = [...s]; arr[3] = 'error'; return arr; });
          return;
        }
        if (!isMounted) return;
        setStepStatus(s => { const arr = [...s]; arr[3] = 'done'; return arr; });

        // 5. Create asset with Firefly
        setCurrentStep(4);
        setStepStatus(s => { const arr = [...s]; arr[4] = null; return arr; });
        try {
          // Use the canonical buildFireflyLayersPayload to only include changed layers
          const layersPayload = buildFireflyLayersPayload(data.layers, edits, originals, smartObjectUrls);
          const optionsLayers = { layers: layersPayload };
          console.log('Firefly Options Layers Preview:', JSON.stringify({ options: optionsLayers }, null, 2));
          console.log('Total changed layers in payload:', layersPayload.length);

          const fireflyPayload: any = {
            inputs: [
              {
                storage: 'external',
                href: psdGetUrl
              }
            ],
            outputs: [
              {
                href: outputPutUrl,
                storage: 'external',
                type: 'image/jpeg'
              }
            ],
            options: optionsLayers
          };

          console.log('Firefly Payload:', JSON.stringify(fireflyPayload, null, 2));

          const result = await createFireflyAsset({ body: fireflyPayload });
          if (!isMounted) return;
          setStepStatus(s => { const arr = [...s]; arr[4] = 'done'; return arr; });

          // 6. Poll job status
          setCurrentStep(5);
          setStepStatus(s => { const arr = [...s]; arr[5] = null; return arr; });
          
          const jobUrl = result._links?.self?.href;
          if (!jobUrl) {
            throw new Error('No job URL returned from Firefly');
          }

          // Start polling
          pollInterval = setInterval(async () => {
            const status = await pollJobStatus(jobUrl);
            if (status === 'succeeded' || status === 'failed') {
              clearInterval(pollInterval);
              if (status === 'succeeded') {
                setStepStatus(s => { const arr = [...s]; arr[5] = 'done'; return arr; });
                setCurrentStep(6);
                setStepStatus(s => { const arr = [...s]; arr[6] = 'done'; return arr; });
                // Get the output image URL
                const outputGetResponse = await fetch('/api/s3-proxy', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    client_method: 'get',
                    filename: outputFilename
                  }),
                });
                
                if (!outputGetResponse.ok) {
                  throw new Error(`Failed to get presigned GET URL for output: ${outputGetResponse.status}`);
                }
                
                const outputGetData = await outputGetResponse.json();
                const outputUrl = outputGetData.url;
                setOutputImageUrl(outputUrl);
                setOutputFilename(outputFilename);
              } else {
                setError('Asset generation failed');
                setStepStatus(s => { const arr = [...s]; arr[5] = 'error'; return arr; });
              }
            }
          }, 1000); // Poll every second

        } catch (err: any) {
          setError('Asset creation failed: ' + (err.message || err.toString()));
          setStepStatus(s => { const arr = [...s]; arr[4] = 'error'; return arr; });
        }
      } catch (err: any) {
        setError(err.message || err.toString());
      }
    }

    if (psdfile) {
      runSteps();
    }

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [psdfile, data, edits, originals, router]);

  return (
    <div className={styles.pageContainer}>
      <PageTitle 
        title={currentStep >= 6 ? "Generated" : "Generating"} 
        leftButton={currentStep >= 6 ? 'home' : 'none'}
      />
      <div className={styles.reviewContainer} style={{ justifyContent: 'flex-start' }}>
        {/* Show generated asset image between title and steps only when ready, with larger size and tighter spacing */}
        {currentStep >= 6 && outputImageUrl && (
          <div style={{ margin: '8px 0 12px 0', textAlign: 'center' }}>
            <img 
              src={outputImageUrl} 
              alt="Generated asset" 
              style={{ 
                maxWidth: '80%', 
                maxHeight: '45vh', 
                borderRadius: 8,
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
              }} 
              onLoad={e => {
                const img = e.currentTarget;
                setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
              }}
            />
            {outputFilename && imageSize && (
              <div style={{
                margin: '24px auto 0 auto',
                padding: '20px 32px',
                background: 'transparent',
                borderRadius: 12,
                boxShadow: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                minWidth: 320,
                maxWidth: 420,
                width: '100%',
                fontFamily: 'inherit',
              }}>
                <div style={{ marginBottom: 10, width: '100%' }}>
                  <span style={{ fontWeight: 700, color: '#fff', fontSize: 16 }}>Image Name:</span>
                  <span style={{ marginLeft: 8, color: '#fff', fontWeight: 500, fontSize: 16 }}>
                    {outputFilename.split('/').pop()}
                  </span>
                </div>
                <div style={{ marginBottom: 18, width: '100%' }}>
                  <span style={{ fontWeight: 700, color: '#fff', fontSize: 16 }}>Size:</span>
                  <span style={{ marginLeft: 8, color: '#fff', fontWeight: 500, fontSize: 16 }}>
                    {imageSize.width} x {imageSize.height}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 14, width: '100%', justifyContent: 'center', marginBottom: 0 }}>
                  <button
                    onClick={async () => {
                      try {
                        const response = await fetch(outputImageUrl);
                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = outputFilename.split('/').pop() || 'generated-asset.png';
                        document.body.appendChild(a);
                        a.click();
                        setTimeout(() => {
                          window.URL.revokeObjectURL(url);
                          document.body.removeChild(a);
                        }, 100);
                      } catch (err) {
                        alert('Failed to download image.');
                      }
                    }}
                    style={{
                      padding: '10px 22px',
                      background: 'linear-gradient(90deg, #6366f1 0%, #a855f7 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 8,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 15,
                      fontWeight: 600,
                      boxShadow: '0 2px 8px rgba(168, 85, 247, 0.10)',
                      transition: 'background 0.2s',
                      textDecoration: 'none',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(outputImageUrl);
                      alert('Image URL copied to clipboard!');
                    }}
                    style={{
                      padding: '10px 22px',
                      background: '#f1f5f9',
                      color: '#1e293b',
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 15,
                      fontWeight: 600,
                      transition: 'background 0.2s',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copy Link
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        <ol style={{ padding: 0, margin: (currentStep >= 6 && outputImageUrl) ? '12px 0' : '0', listStyle: 'none', maxWidth: 400 }}>
          {baseSteps.map((step, idx) => (
            <li key={step} style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: 18,
              color:
                stepStatus[idx] === 'error' ? '#dc2626' :
                idx < currentStep ? '#22c55e' : idx === currentStep ? '#3b82f6' : '#888',
              fontWeight: idx === currentStep ? 700 : 500,
              fontSize: 18,
              opacity: idx > currentStep ? 0.6 : 1,
              transition: 'color 0.2s, opacity 0.2s',
            }}>
              <span style={{
                display: 'inline-block',
                width: 22,
                height: 22,
                borderRadius: '50%',
                background:
                  stepStatus[idx] === 'error' ? '#dc2626' :
                  idx < currentStep ? '#22c55e' : idx === currentStep ? '#3b82f6' : '#444c56',
                color: '#fff',
                textAlign: 'center',
                lineHeight: '22px',
                marginRight: 16,
                fontWeight: 700,
                fontSize: 15,
                border:
                  stepStatus[idx] === 'error' ? '2px solid #dc2626' :
                  idx === currentStep ? '2px solid #3b82f6' : '2px solid #444c56',
              }}>{stepStatus[idx] === 'error' ? '!' : idx < currentStep ? '✓' : idx + 1}</span>
              {step}
              {/* Show progress for smart object upload step */}
              {idx === 0 && currentStep === 0 && smartObjects.length > 0 && (
                <ul style={{ marginLeft: 16, fontSize: 15, padding: 0, listStyle: 'none' }}>
                  {smartObjects.map(({ id, file }) => (
                    <li key={id} style={{ marginBottom: 4 }}>
                      {file.name} — <span style={{ color: smartObjectUploadProgress[file.name] === 100 ? '#22c55e' : '#3b82f6' }}>
                        {smartObjectUploadProgress[file.name] === 100 ? 'Uploaded' : 'Uploading...'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {/* Show job status for polling step */}
              {idx === 5 && currentStep === 5 && (
                <span style={{ marginLeft: 16, fontSize: 15, color: '#3b82f6' }}>
                  {jobStatus}
                </span>
              )}
            </li>
          ))}
        </ol>
        {error && <div style={{ color: '#dc2626', fontWeight: 600, marginTop: 16 }}>{error}</div>}
      </div>
    </div>
  );
} 