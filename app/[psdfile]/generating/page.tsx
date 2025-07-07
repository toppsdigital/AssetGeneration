'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import styles from '../../../styles/Review.module.css';
import NavBar from '../../../components/NavBar';
import { usePsdStore } from '../../../web/store/psdStore';
import { getPresignedUrl, uploadFileToPresignedUrl } from '../../../web/utils/s3Presigned';
import { getFireflyToken, createFireflyAsset, collectLayerParameters, buildFireflyLayersPayload } from '../../../web/utils/firefly';

const baseSteps = [
  'Uploading replaced smart objects',
  'Getting presigned URLs for inputs',
  'Getting presigned URL for output',
  'Authenticating with Firefly',
  'Creating asset with Firefly',
  'Polling job status',
  'Complete!'
];

export default function GeneratingPage() {
  const router = useRouter();
  const params = useParams();
  const psdfile = params.psdfile as string;
  
  const { data, edits, originals } = usePsdStore();
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stepStatus, setStepStatus] = useState<(null | 'done' | 'error')[]>(Array(baseSteps.length).fill(null));
  const [outputImageUrl, setOutputImageUrl] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>('submitted');
  const [smartObjectUploadProgress, setSmartObjectUploadProgress] = useState<Record<string, number>>({});
  const [outputFilename, setOutputFilename] = useState<string>('');
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);

  // Helper to get all replaced smart object files
  const getReplacedSmartObjects = () => {
    return Object.entries(edits.smartObjects || {})
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

  // Helper to upload file with progress tracking via proxy to avoid CORS
  const uploadFileWithProgress = async (file: File, filename: string): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      // First get the upload URL from our proxy
      fetch('/api/s3-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          client_method: 'put', 
          filename,
          upload: true 
        }),
      })
      .then(res => res.json())
      .then(({ uploadUrl, presignedUrl }) => {
        // Now upload via our proxy endpoint
        const formData = new FormData();
        formData.append('file', file);
        formData.append('presignedUrl', presignedUrl);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', uploadUrl, true);
        
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
            resolve();
          } else {
            reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
          }
        };
        
        xhr.onerror = () => reject(new Error('Upload failed: Network error'));
        xhr.send(formData);
      })
      .catch(reject);
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
        Object.entries(edits.smartObjects || {}).forEach(([id, file]) => {
          if (file && file instanceof File) {
            // We'll get the presigned URL for this below, but for now, just mark as needing upload
            smartObjectUrls[Number(id)] = '';
          }
        });

        // 1. Upload smart objects
        setCurrentStep(0);
        setStepStatus(s => { const arr = [...s]; arr[0] = null; return arr; });
        try {
          // Extract base name (remove any extension like .json) for upload paths
          const baseName = psdfile.replace(/\.[^/.]+$/, '');
          
          for (const { id, file } of smartObjects) {
            const uploadPath = `${baseName}/inputs/${file.name}`;
            await uploadFileWithProgress(file, uploadPath);
          }
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
          // Ensure .psd extension is present
          const psdFilename = psdfile.replace(/\.[^/.]+$/, '') + '.psd';
          
          const psdResponse = await fetch('/api/s3-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_method: 'get', filename: psdFilename }),
          });
          if (!psdResponse.ok) throw new Error('Failed to get PSD presigned URL');
          const psdData = await psdResponse.json();
          psdGetUrl = psdData.url;
          
          // Get presigned URLs for uploaded smart objects
          for (const { id, file } of smartObjects) {
            const baseName = psdfile.replace(/\.[^/.]+$/, '');
            const uploadPath = `${baseName}/inputs/${file.name}`;
            const smartObjResponse = await fetch('/api/s3-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ client_method: 'get', filename: uploadPath }),
            });
            if (!smartObjResponse.ok) throw new Error(`Failed to get smart object presigned URL for ${file.name}`);
            const smartObjData = await smartObjResponse.json();
            smartObjectUrls[Number(id)] = smartObjData.url;
          }
          
          if (!isMounted) return;
          setStepStatus(s => { const arr = [...s]; arr[1] = 'done'; return arr; });
        } catch (err: any) {
          setError('Failed to get input presigned URLs: ' + (err.message || err.toString()));
          setStepStatus(s => { const arr = [...s]; arr[1] = 'error'; return arr; });
          return;
        }

        // 3. Get presigned URL for output
        setCurrentStep(2);
        setStepStatus(s => { const arr = [...s]; arr[2] = null; return arr; });
        let outputPutUrl: string;
        try {
          const now = new Date();
          const timestamp = now.toISOString().replace(/[:.]/g, '-');
          const outputName = `${psdfile.replace(/\.[^/.]+$/, '')}_generated_${timestamp}.png`;
          setOutputFilename(outputName);
          
          const outputResponse = await fetch('/api/s3-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_method: 'put', filename: outputName }),
          });
          if (!outputResponse.ok) throw new Error('Failed to get output presigned URL');
          const outputData = await outputResponse.json();
          outputPutUrl = outputData.url;
          
          if (!isMounted) return;
          setStepStatus(s => { const arr = [...s]; arr[2] = 'done'; return arr; });
        } catch (err: any) {
          setError('Failed to get output presigned URL: ' + (err.message || err.toString()));
          setStepStatus(s => { const arr = [...s]; arr[2] = 'error'; return arr; });
          return;
        }

        // 4. Authenticate with Firefly
        setCurrentStep(3);
        setStepStatus(s => { const arr = [...s]; arr[3] = null; return arr; });
        try {
          const token = await getFireflyToken();
          if (!token) throw new Error('Failed to get Firefly token');
          
          if (!isMounted) return;
          setStepStatus(s => { const arr = [...s]; arr[3] = 'done'; return arr; });
        } catch (err: any) {
          setError('Failed to authenticate with Firefly: ' + (err.message || err.toString()));
          setStepStatus(s => { const arr = [...s]; arr[3] = 'error'; return arr; });
          return;
        }

        // 5. Create asset with Firefly
        setCurrentStep(4);
        setStepStatus(s => { const arr = [...s]; arr[4] = null; return arr; });
        let jobUrl: string;
        try {
          const layersPayload = buildFireflyLayersPayload(data.layers, edits, originals, smartObjectUrls);
          const response = await fetch('/api/firefly-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'create',
              input: { storage: 'external', href: psdGetUrl },
              output: { storage: 'external', href: outputPutUrl },
              layers: layersPayload
            }),
          });
          
          if (!response.ok) throw new Error('Failed to create Firefly asset');
          const result = await response.json();
          jobUrl = result.job_url || result.jobUrl;
          
          if (!jobUrl) throw new Error('No job URL returned from Firefly');
          
          if (!isMounted) return;
          setStepStatus(s => { const arr = [...s]; arr[4] = 'done'; return arr; });
        } catch (err: any) {
          setError('Failed to create Firefly asset: ' + (err.message || err.toString()));
          setStepStatus(s => { const arr = [...s]; arr[4] = 'error'; return arr; });
          return;
        }

        // 6. Poll job status
        setCurrentStep(5);
        setStepStatus(s => { const arr = [...s]; arr[5] = null; return arr; });
        
        pollInterval = setInterval(async () => {
          if (!isMounted) return;
          const status = await pollJobStatus(jobUrl);
          
          if (status === 'succeeded') {
            clearInterval(pollInterval);
            setStepStatus(s => { const arr = [...s]; arr[5] = 'done'; return arr; });
            setCurrentStep(6);
            setStepStatus(s => { const arr = [...s]; arr[6] = 'done'; return arr; });
            
            // Get the output image URL
            const outputResponse = await fetch('/api/s3-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ client_method: 'get', filename: outputFilename }),
            });
            if (outputResponse.ok) {
              const outputData = await outputResponse.json();
              setOutputImageUrl(outputData.url);
            }
          } else if (status === 'failed') {
            clearInterval(pollInterval);
            setStepStatus(s => { const arr = [...s]; arr[5] = 'error'; return arr; });
            setError('Firefly job failed');
          }
        }, 3000);
        
      } catch (err: any) {
        setError('Unexpected error: ' + (err.message || err.toString()));
      }
    }

    runSteps();

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [data, edits, originals, psdfile, smartObjects]);

  const displayName = psdfile ? psdfile.replace(/\.json$/i, '') : 'Unknown';

  return (
    <div className={styles.pageContainer}>
      <NavBar
        showHome
        onHome={() => router.push('/')}
        title={`Generating: ${displayName}`}
      />
      <div className={styles.reviewContainer}>
        <main className={styles.mainContent}>
          <div className={styles.generatingContent}>
            <h2>Generating Digital Asset</h2>
            
            {error && (
              <div className={styles.error}>
                <h3>Error</h3>
                <p>{error}</p>
                <button onClick={() => router.push(`/${psdfile}/review`)}>
                  Back to Review
                </button>
              </div>
            )}

            {!error && (
              <div className={styles.steps}>
                {baseSteps.map((step, index) => (
                  <div
                    key={index}
                    className={`${styles.step} ${
                      index === currentStep ? styles.current :
                      stepStatus[index] === 'done' ? styles.done :
                      stepStatus[index] === 'error' ? styles.error : ''
                    }`}
                  >
                    <div className={styles.stepNumber}>{index + 1}</div>
                    <div className={styles.stepContent}>
                      <h3>{step}</h3>
                      {index === 0 && smartObjects.length > 0 && (
                        <div className={styles.uploadProgress}>
                          {smartObjects.map(({ file }) => (
                            <div key={file.name} className={styles.fileProgress}>
                              <span>{file.name}</span>
                              <div className={styles.progressBar}>
                                <div 
                                  className={styles.progressFill}
                                  style={{ width: `${smartObjectUploadProgress[file.name] || 0}%` }}
                                />
                              </div>
                              <span>{smartObjectUploadProgress[file.name] || 0}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {index === 5 && jobStatus && (
                        <p>Status: {jobStatus}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {outputImageUrl && (
              <div className={styles.result}>
                <h3>Generated Asset</h3>
                <img src={outputImageUrl} alt="Generated asset" className={styles.outputImage} />
                <div className={styles.actions}>
                  <button onClick={() => window.open(outputImageUrl, '_blank')}>
                    Download
                  </button>
                  <button onClick={() => router.push('/')}>
                    Back to Home
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
} 