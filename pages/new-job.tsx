import React, { useState } from 'react';
import { useRouter } from 'next/router';
import styles from '../styles/Home.module.css';
import NavBar from '../components/NavBar';
import Spinner from '../components/Spinner';
import contentPipelineApi from '../web/utils/contentPipelineApi';

interface NewJobFormData {
  appName: string;
  releaseName: string;
  subsetName: string;
  uploadFolder: string;
  selectedFiles: FileList | null;
}

export default function NewJobPage() {
  const router = useRouter();
  
  // Helper function to generate S3 file paths based on app and optional filename
  const generateFilePath = (appName: string, filename?: string): string => {
    // Sanitize path components to ensure they are URL-safe and consistent
    // Replace spaces and special characters with hyphens, keep alphanumeric, hyphens, and underscores
    const sanitize = (str: string) => str.trim().replace(/[^a-zA-Z0-9\-_]/g, '-').replace(/-+/g, '-');
    
    const basePath = `${sanitize(appName)}/PDFs`;
    return filename ? `${basePath}/${filename}` : basePath;
  };
  
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

  // Create job using Content Pipeline API
  const createJob = async (jobData: {
    appName: string;
    releaseName: string;
    subsetName: string;
    sourceFolder: string;
    files: string[];
    description?: string;
  }) => {
    try {
      const response = await contentPipelineApi.createJob({
        app_name: jobData.appName,
        release_name: jobData.releaseName,
        subset_name: jobData.subsetName,
        source_folder: jobData.sourceFolder,
        files: jobData.files,
        description: jobData.description
      });

      console.log('Job created successfully via Content Pipeline API:', response.job.job_id);
      return response.job;
    } catch (error) {
      console.error('Error creating job via API:', error);
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

      // Group files by prefix (removing _FR/_BK suffixes)
      const fileGroups = new Set<string>();
      
      Array.from(formData.selectedFiles).forEach(file => {
        let fileName = file.name.replace('.pdf', ''); // Remove .pdf extension
        
        // Check for _FR (front) or _BK (back) pattern and extract prefix
        if (fileName.endsWith('_FR')) {
          fileName = fileName.replace('_FR', '');
        } else if (fileName.endsWith('_BK')) {
          fileName = fileName.replace('_BK', '');
        }
        
        // Add the prefix to our set (Set automatically handles duplicates)
        fileGroups.add(fileName);
      });
      
      // Convert set to array for the API
      const filenames = Array.from(fileGroups);
      
      console.log('Original files:', Array.from(formData.selectedFiles).map(f => f.name));
      console.log('Grouped file prefixes:', filenames);
      
      // Create job using Content Pipeline API
      const createdJob = await createJob({
        appName: formData.appName,
        releaseName: formData.releaseName,
        subsetName: formData.subsetName,
        sourceFolder: generateFilePath(formData.appName),
        files: filenames,
        description: `${formData.subsetName} - Processing PDFs into digital assets`
      });

      setJobCreated(createdJob);
      console.log('Job created successfully, navigating to job details page...');
      
      // Store the form data in sessionStorage so the job details page can access it
      const uploadSession = {
        jobId: createdJob.job_id,
        appName: formData.appName,
        releaseName: formData.releaseName,
        subsetName: formData.subsetName,
        files: Array.from(formData.selectedFiles!).map(file => ({
          name: file.name,
          size: file.size,
          type: file.type
        }))
      };
      
      sessionStorage.setItem(`upload_${createdJob.job_id}`, JSON.stringify(uploadSession));
      
      // Store actual File objects in global variable (sessionStorage can't store File objects)
      (window as any).pendingUploadFiles = {
        jobId: createdJob.job_id,
        files: Array.from(formData.selectedFiles!)
      };
      
      console.log('Stored upload session data and files for job:', createdJob.job_id);
      console.log('File count:', formData.selectedFiles!.length);
      
      // Navigate to job details page with job data to avoid API call
      const queryParams = new URLSearchParams({
        jobId: createdJob.job_id!,
        appName: createdJob.app_name || formData.appName,
        releaseName: createdJob.release_name || formData.releaseName,
        subsetName: createdJob.subset_name || formData.subsetName,
        sourceFolder: createdJob.source_folder || generateFilePath(formData.appName),
        status: createdJob.job_status || 'Upload started',
        createdAt: createdJob.created_at || new Date().toISOString(),
        files: JSON.stringify(createdJob.files || filenames),
        description: createdJob.description || `${formData.subsetName} - Processing PDFs into digital assets`,
        startUpload: 'true'
      });
      
      router.push(`/job/details?${queryParams.toString()}`);
      
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
        showViewJobs
        onViewJobs={() => router.push('/jobs')}
      />
      <div className={styles.content}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px' }}>
          <div style={{ marginBottom: 32, marginTop: 16 }}>
            <p style={{ 
              color: '#9ca3af', 
              fontSize: 16,
              margin: 0,
              textAlign: 'center'
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
                {isSubmitting ? 'Creating Job...' : 'Create Job'}
              </button>
            </div>
            

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