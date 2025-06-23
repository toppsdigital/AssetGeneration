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
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
    currentFile: string;
  } | null>(null);

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

  // Upload files to S3 using existing infrastructure
  const uploadFilesToS3 = async (files: FileList): Promise<string[]> => {
    const uploadedPaths: string[] = [];
    const totalFiles = files.length;

    setUploadProgress({ current: 0, total: totalFiles, currentFile: '' });

    // Upload files sequentially to show progress
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      setUploadProgress({ current: i, total: totalFiles, currentFile: file.name });
      
      // Generate S3 path: temp/{appName}/{releaseName}/{subsetName}/{filename}
      const s3Path = `temp/${formData.appName}/${formData.releaseName}/${formData.subsetName}/${file.name}`;
      
      console.log(`Getting presigned URL for: ${s3Path}`);
      
      // Step 1: Get presigned URL for this file
      const presignedResponse = await fetch('/api/s3-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          client_method: 'put',
          filename: s3Path,
          upload: true
        }),
      });

      if (!presignedResponse.ok) {
        throw new Error(`Failed to get presigned URL for ${file.name}`);
      }

      const { presignedUrl } = await presignedResponse.json();
      
      console.log(`Uploading ${file.name} to S3...`);
      
      // Step 2: Upload file using the existing s3-upload endpoint
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);
      uploadFormData.append('presignedUrl', presignedUrl);

      const uploadResponse = await fetch('/api/s3-upload', {
        method: 'POST',
        body: uploadFormData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(`Failed to upload ${file.name}: ${errorData.error}`);
      }

      console.log(`Successfully uploaded: ${file.name}`);
      uploadedPaths.push(s3Path);
    }

    setUploadProgress({ current: totalFiles, total: totalFiles, currentFile: 'Complete!' });
    
    return uploadedPaths;
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

      // Step 1: Upload all PDF files to S3
      console.log(`Uploading ${formData.selectedFiles.length} PDF files to S3...`);
      const uploadedPaths = await uploadFilesToS3(formData.selectedFiles);
      console.log('All files uploaded successfully:', uploadedPaths);

      // Step 2: Create job data with uploaded file paths
      const jobData = {
        appName: formData.appName,
        releaseName: formData.releaseName,
        subsetName: formData.subsetName,
        uploadFolder: formData.uploadFolder,
        fileCount: uploadedPaths.length,
        uploadedFiles: uploadedPaths,
        sourceFolder: `temp/${formData.appName}/${formData.releaseName}/${formData.subsetName}`,
        createdAt: new Date().toISOString()
      };

      console.log('Creating job with data:', jobData);

      // Step 3: Save job metadata (you can implement this API endpoint)
      // For now, we'll just log the job data
      console.log('Job created successfully with uploaded files');
      
      // Navigate back to jobs page
      router.push('/jobs');
    } catch (error) {
      console.error('Error creating job:', error);
      alert('Failed to create job: ' + (error as Error).message);
    } finally {
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
                {isSubmitting 
                  ? (uploadProgress 
                      ? `Uploading ${uploadProgress.current}/${uploadProgress.total}...` 
                      : 'Creating Job...'
                    )
                  : '✨ Create Job'
                }
              </button>
            </div>
            
            {/* Upload Progress Indicator */}
            {uploadProgress && (
              <div style={{ 
                marginTop: 16,
                padding: 16,
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: 8
              }}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: 8
                }}>
                  <span style={{ color: '#60a5fa', fontSize: 14, fontWeight: 500 }}>
                    Upload Progress
                  </span>
                  <span style={{ color: '#60a5fa', fontSize: 12 }}>
                    {uploadProgress.current}/{uploadProgress.total}
                  </span>
                </div>
                
                {/* Progress Bar */}
                <div style={{
                  width: '100%',
                  height: 8,
                  background: 'rgba(59, 130, 246, 0.2)',
                  borderRadius: 4,
                  overflow: 'hidden',
                  marginBottom: 8
                }}>
                  <div style={{
                    width: `${(uploadProgress.current / uploadProgress.total) * 100}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                    borderRadius: 4,
                    transition: 'width 0.3s ease'
                  }} />
                </div>
                
                {/* Current File */}
                {uploadProgress.currentFile && (
                  <div style={{ 
                    color: '#9ca3af', 
                    fontSize: 12,
                    fontStyle: 'italic'
                  }}>
                    {uploadProgress.current < uploadProgress.total 
                      ? `Uploading: ${uploadProgress.currentFile}`
                      : `✅ Upload complete!`
                    }
                  </div>
                )}
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