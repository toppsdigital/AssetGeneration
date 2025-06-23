import React, { useState } from 'react';
import { useRouter } from 'next/router';
import styles from '../styles/Home.module.css';
import NavBar from '../components/NavBar';
import Spinner from '../components/Spinner';

interface NewJobFormData {
  appName: string;
  releaseName: string;
  subsetName: string;
  uploadFolder: string;
  selectedFiles: FileList | null;
}

export default function NewJobPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<NewJobFormData>({
    appName: '',
    releaseName: '',
    subsetName: '',
    uploadFolder: '',
    selectedFiles: null
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<NewJobFormData>>({});
  const [jobCreated, setJobCreated] = useState<any>(null);

  // Handle input changes
  const handleInputChange = (field: keyof NewJobFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  // Handle folder selection
  const handleFolderSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      // Get the folder name from the first file's path
      const firstFile = files[0];
      const folderPath = firstFile.webkitRelativePath.split('/')[0];
      
      // Filter only PDF files
      const pdfFiles = Array.from(files).filter(file => 
        file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      );
      
      // Create a new FileList-like object with only PDF files
      const dataTransfer = new DataTransfer();
      pdfFiles.forEach(file => dataTransfer.items.add(file));
      
      setFormData(prev => ({
        ...prev,
        uploadFolder: folderPath,
        selectedFiles: dataTransfer.files
      }));


      
      // Clear error when folder is selected
      if (errors.uploadFolder) {
        setErrors(prev => ({
          ...prev,
          uploadFolder: ''
        }));
      }
    }
  };

  // Check if all required fields are valid
  const isFormValid = (): boolean => {
    return !!(
      formData.appName.trim() &&
      formData.releaseName.trim() &&
      formData.subsetName.trim() &&
      formData.uploadFolder.trim() &&
      formData.selectedFiles &&
      formData.selectedFiles.length > 0
    );
  };

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: Partial<NewJobFormData> = {};

    if (!formData.appName.trim()) {
      newErrors.appName = 'App name is required';
    }

    if (!formData.releaseName.trim()) {
      newErrors.releaseName = 'Release name is required';
    }

    if (!formData.subsetName.trim()) {
      newErrors.subsetName = 'Subset name is required';
    }

    if (!formData.uploadFolder.trim()) {
      newErrors.uploadFolder = 'Upload folder is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Create job JSON with initial status
  const createJobJSON = async (jobData: any): Promise<void> => {
    try {
      // Get presigned URL for job JSON
      const presignedResponse = await fetch('/api/s3-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          client_method: 'put',
          filename: jobData.job_path,
          upload: true
        }),
      });

      if (!presignedResponse.ok) {
        throw new Error('Failed to get presigned URL for job JSON');
      }

      const { presignedUrl } = await presignedResponse.json();
      
      // Create and upload job JSON
      const jobJsonBlob = new Blob([JSON.stringify(jobData, null, 2)], { type: 'application/json' });
      const jobFormData = new FormData();
      jobFormData.append('file', jobJsonBlob, `${jobData.job_id}.json`);
      jobFormData.append('presignedUrl', presignedUrl);

      const uploadResponse = await fetch('/api/s3-upload', {
        method: 'POST',
        body: jobFormData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload job JSON');
      }

      console.log('Job JSON created successfully at:', jobData.job_path);
    } catch (error) {
      console.error('Error creating job JSON:', error);
      throw error;
    }
  };



  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      console.log('Starting job creation process...');
      
      if (!formData.selectedFiles || formData.selectedFiles.length === 0) {
        throw new Error('No files selected for upload');
      }

      // Step 1: Create job data structure and job JSON
      const now = new Date().toISOString();
      const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Group PDF files by base name (assuming _FR/_BK pattern)
      const fileGroups = new Map<string, { front?: string, back?: string }>();
      
      Array.from(formData.selectedFiles!).forEach(file => {
        const fileName = file.name.replace('.pdf', '');
        let baseName = fileName;
        let cardType: 'front' | 'back' = 'front';
        
        // Check for _FR (front) or _BK (back) pattern
        if (fileName.endsWith('_FR')) {
          baseName = fileName.replace('_FR', '');
          cardType = 'front';
        } else if (fileName.endsWith('_BK')) {
          baseName = fileName.replace('_BK', '');
          cardType = 'back';
        }
        
        if (!fileGroups.has(baseName)) {
          fileGroups.set(baseName, {});
        }
        
        fileGroups.get(baseName)![cardType] = file.name;
      });
      
      // Create files array in the expected format
      const files = Array.from(fileGroups.entries()).map(([baseName, files]) => {
        const originalFiles = [];
        
        if (files.front) {
          originalFiles.push({
            filename: files.front,
            card_type: "front"
          });
        }
        
        if (files.back) {
          originalFiles.push({
            filename: files.back,
            card_type: "back"
          });
        }
        
        // If no _FR/_BK pattern, treat as single file
        if (originalFiles.length === 0) {
          originalFiles.push({
            filename: baseName + '.pdf',
            card_type: "front"
          });
        }
        
        return {
          filename: baseName,
          extracted: "PENDING" as const,
          digital_assets: "PENDING" as const,
          last_updated: now,
          original_files: originalFiles
        };
      });

      const initialJobData = {
        job_id: jobId,
        created_at: now,
        last_updated: now,
        app_name: formData.appName,
        release_name: formData.releaseName,
        Subset_name: formData.subsetName, // Note: Capital S to match schema
        job_status: "Upload started" as const,
        files: files,
        job_path: `temp/jobs/${jobId}.json`,
        source_folder: `temp/${formData.appName}/${formData.releaseName}/${formData.subsetName}`,
        total_files: files.length
      };

      console.log('Creating job with initial status:', initialJobData);

      // Create job JSON with "Upload started" status
      await createJobJSON(initialJobData);
      setJobCreated(initialJobData);

      console.log('Job created successfully, navigating to job details page...');
      
      // Step 2: Navigate to job details page and start upload there
      const jobPath = initialJobData.job_path;
      
      // Store the form data in sessionStorage so the job details page can access it
      const uploadSession = {
        jobId: initialJobData.job_id,
        appName: formData.appName,
        releaseName: formData.releaseName,
        subsetName: formData.subsetName,
        files: Array.from(formData.selectedFiles!).map(file => ({
          name: file.name,
          size: file.size,
          type: file.type
        }))
      };
      
      sessionStorage.setItem(`upload_${initialJobData.job_id}`, JSON.stringify(uploadSession));
      
      // Navigate to job details page
      router.push(`/job/details?jobPath=${encodeURIComponent(jobPath)}&startUpload=true`);
      
    } catch (error) {
      console.error('Error creating job:', error);
      alert('Failed to create job: ' + (error as Error).message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <NavBar 
        showHome
        onHome={() => router.push('/')}
        title="Create New Job"
      />
      <div className={styles.content}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px' }}>
          <div style={{ marginBottom: 32 }}>
            <button
              onClick={() => router.push('/jobs')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'none',
                border: 'none',
                color: '#60a5fa',
                cursor: 'pointer',
                fontSize: 14,
                marginBottom: 16,
                padding: '8px 0',
                transition: 'color 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#93c5fd';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#60a5fa';
              }}
            >
              ← Back to Jobs
            </button>
            <h1 style={{ 
              fontSize: '2.5rem', 
              fontWeight: 700, 
              color: '#f8f8f8',
              margin: 0,
              marginBottom: 8
            }}>
              Create New Job
            </h1>
            <p style={{ 
              color: '#9ca3af', 
              fontSize: 16,
              margin: 0
            }}>
              Set up a new job for processing PDFs into digital assets
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 16,
              padding: 32,
              marginBottom: 24
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* App */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#f3f4f6',
                    marginBottom: 8
                  }}>
                    App *
                  </label>
                  <select
                    value={formData.appName}
                    onChange={(e) => handleInputChange('appName', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: `1px solid ${errors.appName ? '#ef4444' : 'rgba(255, 255, 255, 0.2)'}`,
                      borderRadius: 8,
                      color: '#f8f8f8',
                      fontSize: 14,
                      outline: 'none',
                      transition: 'border-color 0.2s',
                      boxSizing: 'border-box'
                    }}
                    onFocus={(e) => {
                      if (!errors.appName) {
                        e.target.style.borderColor = '#60a5fa';
                      }
                    }}
                    onBlur={(e) => {
                      if (!errors.appName) {
                        e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                      }
                    }}
                  >
                    <option value="" style={{ background: '#1f2937', color: '#f8f8f8' }}>
                      Select an app...
                    </option>
                    <option value="BUNT" style={{ background: '#1f2937', color: '#f8f8f8' }}>
                      BUNT
                    </option>
                    <option value="DISNEY" style={{ background: '#1f2937', color: '#f8f8f8' }}>
                      DISNEY
                    </option>
                    <option value="MARVEL" style={{ background: '#1f2937', color: '#f8f8f8' }}>
                      MARVEL
                    </option>
                    <option value="SLAM" style={{ background: '#1f2937', color: '#f8f8f8' }}>
                      SLAM
                    </option>
                    <option value="STAR WARS" style={{ background: '#1f2937', color: '#f8f8f8' }}>
                      STAR WARS
                    </option>
                    <option value="NBA" style={{ background: '#1f2937', color: '#f8f8f8' }}>
                      NBA
                    </option>
                    <option value="NFL" style={{ background: '#1f2937', color: '#f8f8f8' }}>
                      NFL
                    </option>
                  </select>
                  {errors.appName && (
                    <p style={{ 
                      color: '#ef4444', 
                      fontSize: 12, 
                      margin: '4px 0 0 0' 
                    }}>
                      {errors.appName}
                    </p>
                  )}
                </div>

                {/* Release Name */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#f3f4f6',
                    marginBottom: 8
                  }}>
                    Release Name *
                  </label>
                  <input
                    type="text"
                    value={formData.releaseName}
                    onChange={(e) => handleInputChange('releaseName', e.target.value)}
                    placeholder="e.g., 2024 Spring Release, Season 1, Wave 3"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: `1px solid ${errors.releaseName ? '#ef4444' : 'rgba(255, 255, 255, 0.2)'}`,
                      borderRadius: 8,
                      color: '#f8f8f8',
                      fontSize: 14,
                      outline: 'none',
                      transition: 'border-color 0.2s',
                      boxSizing: 'border-box'
                    }}
                    onFocus={(e) => {
                      if (!errors.releaseName) {
                        e.target.style.borderColor = '#60a5fa';
                      }
                    }}
                    onBlur={(e) => {
                      if (!errors.releaseName) {
                        e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                      }
                    }}
                  />
                  {errors.releaseName && (
                    <p style={{ 
                      color: '#ef4444', 
                      fontSize: 12, 
                      margin: '4px 0 0 0' 
                    }}>
                      {errors.releaseName}
                    </p>
                  )}
                </div>

                {/* Subset Name */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#f3f4f6',
                    marginBottom: 8
                  }}>
                    Subset Name *
                  </label>
                  <input
                    type="text"
                    value={formData.subsetName}
                    onChange={(e) => handleInputChange('subsetName', e.target.value)}
                    placeholder="e.g., Base Cards, Inserts, Parallels"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: `1px solid ${errors.subsetName ? '#ef4444' : 'rgba(255, 255, 255, 0.2)'}`,
                      borderRadius: 8,
                      color: '#f8f8f8',
                      fontSize: 14,
                      outline: 'none',
                      transition: 'border-color 0.2s',
                      boxSizing: 'border-box'
                    }}
                    onFocus={(e) => {
                      if (!errors.subsetName) {
                        e.target.style.borderColor = '#60a5fa';
                      }
                    }}
                    onBlur={(e) => {
                      if (!errors.subsetName) {
                        e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                      }
                    }}
                  />
                  {errors.subsetName && (
                    <p style={{ 
                      color: '#ef4444', 
                      fontSize: 12, 
                      margin: '4px 0 0 0' 
                    }}>
                      {errors.subsetName}
                    </p>
                  )}
                </div>

                {/* Select PDF Folder to Upload */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#f3f4f6',
                    marginBottom: 8
                  }}>
                    Select PDF Folder to Upload *
                  </label>
                  
                  {/* Hidden file input for folder selection */}
                  <input
                    type="file"
                    ref={(input) => {
                      if (input) {
                        (input as any).webkitdirectory = true;
                        (input as any).directory = true;
                      }
                    }}
                    onChange={handleFolderSelect}
                    style={{ display: 'none' }}
                    id="folder-input"
                    accept=".pdf"
                    multiple
                  />
                  
                  {/* Folder selection button */}
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.getElementById('folder-input') as HTMLInputElement;
                      input?.click();
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: `1px solid ${errors.uploadFolder ? '#ef4444' : 'rgba(255, 255, 255, 0.2)'}`,
                      borderRadius: 8,
                      color: '#f8f8f8',
                      fontSize: 14,
                      outline: 'none',
                      transition: 'all 0.2s',
                      boxSizing: 'border-box',
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                    onMouseEnter={(e) => {
                      if (!errors.uploadFolder) {
                        e.currentTarget.style.borderColor = '#60a5fa';
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!errors.uploadFolder) {
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                      }
                    }}
                  >
                    <span>
                      {formData.uploadFolder ? (
                        <>
                          📁 {formData.uploadFolder}
                          {formData.selectedFiles && (
                            <span style={{ color: '#10b981', marginLeft: 8 }}>
                              ({formData.selectedFiles.length} PDF files)
                            </span>
                          )}
                        </>
                      ) : (
                        'Click to select folder containing PDF files'
                      )}
                    </span>
                    <span style={{ color: '#9ca3af' }}>📂</span>
                  </button>
                  
                  {formData.selectedFiles && formData.selectedFiles.length === 0 && (
                    <p style={{ 
                      color: '#f59e0b', 
                      fontSize: 12, 
                      margin: '4px 0 0 0' 
                    }}>
                      No PDF files found in the selected folder
                    </p>
                  )}
                  
                  {errors.uploadFolder && (
                    <p style={{ 
                      color: '#ef4444', 
                      fontSize: 12, 
                      margin: '4px 0 0 0' 
                    }}>
                      {errors.uploadFolder}
                    </p>
                  )}
                </div>

                {/* File List with Upload Status */}
                {formData.selectedFiles && formData.selectedFiles.length > 0 && (
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: 14,
                      fontWeight: 600,
                      color: '#f3f4f6',
                      marginBottom: 12
                    }}>
                      Selected Files ({formData.selectedFiles.length})
                    </label>
                    <div style={{
                      maxHeight: '300px',
                      overflowY: 'auto',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: 8,
                      padding: 12
                    }}>
                      {Array.from(formData.selectedFiles).map((file, index) => (
                        <div
                          key={index}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            marginBottom: index < formData.selectedFiles!.length - 1 ? 4 : 0,
                            background: 'rgba(255, 255, 255, 0.03)',
                            borderRadius: 4,
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            transition: 'all 0.2s'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 16 }}>📄</span>
                            <span style={{
                              color: '#f8f8f8',
                              fontSize: 14,
                              fontFamily: 'monospace'
                            }}>
                              {file.name}
                            </span>
                          </div>
                          <span style={{
                            color: '#9ca3af',
                            fontSize: 12
                          }}>
                            {(file.size / 1024).toFixed(1)} KB
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ 
              display: 'flex', 
              gap: 16, 
              justifyContent: 'flex-end',
              alignItems: 'center'
            }}>
              <button
                type="button"
                onClick={() => router.push('/jobs')}
                disabled={isSubmitting}
                style={{
                  padding: '12px 24px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 8,
                  color: '#e5e7eb',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  fontWeight: 500,
                  transition: 'all 0.2s',
                  opacity: isSubmitting ? 0.5 : 1
                }}
                onMouseEnter={(e) => {
                  if (!isSubmitting) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSubmitting) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  }
                }}
              >
                Cancel
              </button>
              
              <button
                type="submit"
                disabled={isSubmitting || !isFormValid()}
                style={{
                  padding: '12px 32px',
                  background: isSubmitting || !isFormValid()
                    ? 'rgba(156, 163, 175, 0.5)' 
                    : 'linear-gradient(135deg, #10b981, #059669)',
                  border: 'none',
                  borderRadius: 8,
                  color: isSubmitting || !isFormValid() ? 'rgba(255, 255, 255, 0.5)' : 'white',
                  cursor: isSubmitting || !isFormValid() ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  opacity: isSubmitting || !isFormValid() ? 0.6 : 1
                }}
                onMouseEnter={(e) => {
                  if (!isSubmitting && isFormValid()) {
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSubmitting && isFormValid()) {
                    e.currentTarget.style.transform = 'scale(1)';
                  }
                }}
              >
                {isSubmitting && (
                  <div style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    borderTop: '2px solid white',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
                )}
                {isSubmitting ? 'Creating Job...' : '✨ Create Job'}
              </button>
            </div>
            
            {/* Job Creation Status */}
            {isSubmitting && (
              <div style={{ 
                marginTop: 16,
                padding: 16,
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: 8,
                display: 'flex', 
                alignItems: 'center',
                gap: 8
              }}>
                <div style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid rgba(96, 165, 250, 0.3)',
                  borderTop: '2px solid #60a5fa',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                <span style={{ color: '#60a5fa', fontSize: 14, fontWeight: 500 }}>
                  Creating job...
                </span>
              </div>
            )}
          </form>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
} 