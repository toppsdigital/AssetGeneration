'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import styles from '../../styles/Home.module.css';
import PageTitle from '../../components/PageTitle';
import Spinner from '../../components/Spinner';
import contentPipelineApi from '../../web/utils/contentPipelineApi';
import { createCacheClearingCallback } from '../../web/hooks/useJobData';
import { getAppIcon } from '../../utils/fileOperations';

interface NewJobFormData {
  appName: string;
  filenamePrefix: string;
  description: string;
  uploadFolder: string;
  selectedFiles: FileList | null;
}

function NewJobPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  
  // Check if this is a re-run operation
  const isRerun = searchParams.get('rerun') === 'true';
  const sourceJobId = searchParams.get('sourceJobId');
  
  // Helper function to generate S3 file paths based on app and optional filename
  const generateFilePath = (appName: string, filename?: string): string => {
    // Sanitize path components to ensure they are URL-safe and consistent
    // Replace spaces and special characters with hyphens, keep alphanumeric, hyphens, and underscores
    const sanitize = (str: string) => str.trim().replace(/[^a-zA-Z0-9\-_]/g, '-').replace(/-+/g, '-');
    
    const basePath = `${sanitize(appName)}/PDFs`;
    return filename ? `${basePath}/${filename}` : basePath;
  };
  
  // Initialize form data - pre-fill if this is a re-run
  const [formData, setFormData] = useState<NewJobFormData>({
    appName: isRerun ? (searchParams.get('appName') || '') : '',
    filenamePrefix: isRerun ? (searchParams.get('filenamePrefix') || '') : '',
    description: isRerun ? (searchParams.get('description') || '') : '',
    uploadFolder: '',
    selectedFiles: null
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<NewJobFormData>>({});
  const [jobCreated, setJobCreated] = useState<any>(null);
  const [isFileListExpanded, setIsFileListExpanded] = useState(false);

  // Handle input changes
  const handleInputChange = (field: keyof NewJobFormData, value: string) => {
    // Convert filename prefix to lowercase automatically
    const processedValue = field === 'filenamePrefix' ? value.toLowerCase() : value;
    
    setFormData(prev => ({
      ...prev,
      [field]: processedValue
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

      // Collapse file list when new files are selected
      setIsFileListExpanded(false);
      
      // Clear error when folder is selected
      if (errors.uploadFolder) {
        setErrors(prev => ({
          ...prev,
          uploadFolder: ''
        }));
      }
    } else {
      // If no files selected, collapse the file list
      setIsFileListExpanded(false);
    }
  };

  // Check if all required fields are valid
  const isFormValid = (): boolean => {
    return !!(
      formData.appName.trim() &&
      formData.filenamePrefix.trim() &&
      formData.description.trim() &&
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

    if (!formData.filenamePrefix.trim()) {
      newErrors.filenamePrefix = 'Filename prefix is required';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }

    if (!formData.uploadFolder.trim()) {
      newErrors.uploadFolder = 'Upload folder is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Create or rerun job using Content Pipeline API
  const createJob = async (jobData: {
    appName: string;
    filenamePrefix: string;
    sourceFolder: string;
    files: string[];
    description?: string;
  }) => {
    try {
      let response;
      
      if (isRerun && sourceJobId) {
        // Use rerun API for re-run operations with cache clearing
        const cacheClearingCallback = createCacheClearingCallback(queryClient);
        response = await contentPipelineApi.rerunJob(sourceJobId, {
        app_name: jobData.appName,
          filename_prefix: jobData.filenamePrefix,
          source_folder: jobData.sourceFolder,
          files: jobData.files,
          description: jobData.description
        }, cacheClearingCallback);
        console.log('Job re-run successfully via Content Pipeline API:', response.job.job_id);
      } else {
        // Use create API for new jobs
        response = await contentPipelineApi.createJob({
          app_name: jobData.appName,
          filename_prefix: jobData.filenamePrefix,
        source_folder: jobData.sourceFolder,
        files: jobData.files,
        description: jobData.description
      });
      console.log('Job created successfully via Content Pipeline API:', response.job.job_id);
      }
      
      return response.job;
    } catch (error) {
      console.error(`Error ${isRerun ? 're-running' : 'creating'} job via API:`, error);
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
        filenamePrefix: formData.filenamePrefix,
        sourceFolder: generateFilePath(formData.appName),
        files: filenames,
        description: formData.description
      });

      setJobCreated(createdJob);
      console.log('Job created successfully, navigating to job details page...');
      
      // Store the form data in sessionStorage so the job details page can access it
      const uploadSession = {
        jobId: createdJob.job_id,
        appName: formData.appName,
        filenamePrefix: formData.filenamePrefix,
        description: formData.description,
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
      
      // Navigate to job details page - React Query will handle data fetching
      const queryParams = new URLSearchParams({
        jobId: createdJob.job_id!,
        startUpload: 'true',
        createFiles: 'true'
      });
      
      router.push(`/job/details?${queryParams.toString()}`);
      
    } catch (error) {
      console.error(`Error ${isRerun ? 're-running' : 'creating'} job:`, error);
      alert(`Failed to ${isRerun ? 're-run' : 'create'} job: ` + (error as Error).message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <PageTitle 
        title="Create New Job"
        subtitle="Upload physical PDFs and convert them into layered, production-ready digital assets."
      />
      <div className={styles.content}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px' }}>
          {isRerun && (
            <div style={{
              marginBottom: 32,
              marginTop: 16,
              padding: 12,
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: 8,
              textAlign: 'center'
            }}>
              <p style={{
                color: '#60a5fa',
                fontSize: 14,
                margin: 0,
                fontWeight: 500
              }}>
                🔄 Re-running job from: {sourceJobId}
              </p>
            </div>
          )}

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
                      ⚾ BUNT
                    </option>
                    <option value="DISNEY" style={{ background: '#1f2937', color: '#f8f8f8' }}>
                      🏰 DISNEY
                    </option>
                    <option value="MARVEL" style={{ background: '#1f2937', color: '#f8f8f8' }}>
                      🦸 MARVEL
                    </option>
                    <option value="SLAM" style={{ background: '#1f2937', color: '#f8f8f8' }}>
                      🤼 SLAM
                    </option>
                    <option value="STAR WARS" style={{ background: '#1f2937', color: '#f8f8f8' }}>
                      ⭐ STAR WARS
                    </option>
                    <option value="NBA" style={{ background: '#1f2937', color: '#f8f8f8' }}>
                      🏀 NBA
                    </option>
                    <option value="NFL" style={{ background: '#1f2937', color: '#f8f8f8' }}>
                      🏈 NFL
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

                {/* Filename Prefix */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#f3f4f6',
                    marginBottom: 8
                  }}>
                    Filename Prefix *
                  </label>
                  <input
                    type="text"
                      value={formData.filenamePrefix}
                      onChange={(e) => handleInputChange('filenamePrefix', e.target.value)}
                      placeholder="e.g., bunt25_25tcbb_chrome"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: `1px solid ${errors.filenamePrefix ? '#ef4444' : 'rgba(255, 255, 255, 0.2)'}`,
                      borderRadius: 8,
                      color: '#f8f8f8',
                      fontSize: 14,
                      outline: 'none',
                      transition: 'border-color 0.2s',
                      boxSizing: 'border-box'
                    }}
                    onFocus={(e) => {
                      if (!errors.filenamePrefix) {
                        e.target.style.borderColor = '#60a5fa';
                      }
                    }}
                    onBlur={(e) => {
                      if (!errors.filenamePrefix) {
                        e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                      }
                    }}
                  />
                  {errors.filenamePrefix && (
                    <p style={{ 
                      color: '#ef4444', 
                      fontSize: 12, 
                      margin: '4px 0 0 0' 
                    }}>
                      {errors.filenamePrefix}
                    </p>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#f3f4f6',
                    marginBottom: 8
                  }}>
                    Description *
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    placeholder="e.g., Processing NBA base cards for digital assets with enhanced backgrounds"
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: `1px solid ${errors.description ? '#ef4444' : 'rgba(255, 255, 255, 0.2)'}`,
                      borderRadius: 8,
                      color: '#f8f8f8',
                      fontSize: 14,
                      outline: 'none',
                      transition: 'border-color 0.2s',
                      boxSizing: 'border-box',
                      resize: 'vertical'
                    }}
                    onFocus={(e) => {
                      if (!errors.description) {
                        e.target.style.borderColor = '#60a5fa';
                      }
                    }}
                    onBlur={(e) => {
                      if (!errors.description) {
                        e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                      }
                    }}
                  ></textarea>
                  {errors.description && (
                    <p style={{ 
                      color: '#ef4444', 
                      fontSize: 12, 
                      margin: '4px 0 0 0' 
                    }}>
                      {errors.description}
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
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              {/* File Count and Expand/Collapse Button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {formData.selectedFiles && formData.selectedFiles.length > 0 && (
                  <>
                    <span style={{
                      color: '#9ca3af',
                      fontSize: 14,
                      fontWeight: 500
                    }}>
                      {formData.selectedFiles.length} PDF files selected
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsFileListExpanded(!isFileListExpanded)}
                      style={{
                        padding: '6px 12px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: 6,
                        color: '#60a5fa',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 500,
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                      }}
                    >
                      {isFileListExpanded ? 'Hide Files' : 'Show Files'}
                      <span style={{ 
                        transform: isFileListExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s'
                      }}>
                        ▼
                      </span>
                    </button>
                  </>
                )}
              </div>

              {/* Cancel and Create Job Buttons */}
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
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
                    ? (isRerun ? 'Re-running Job...' : 'Creating Job...')
                    : (isRerun ? 'Re-run Job' : 'Create Job')
                  }
                </button>
              </div>
            </div>
          </form>

          {/* Collapsible File List */}
          {formData.selectedFiles && formData.selectedFiles.length > 0 && isFileListExpanded && (
            <div style={{
              marginTop: 24,
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 16,
              padding: 24,
              animation: 'slideDown 0.3s ease-out'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16
              }}>
                <h3 style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: '#f3f4f6',
                  margin: 0
                }}>
                  📁 Selected PDF Files ({formData.selectedFiles.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setIsFileListExpanded(false)}
                  style={{
                    padding: '4px 8px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: 4,
                    color: '#9ca3af',
                    cursor: 'pointer',
                    fontSize: 12,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                    e.currentTarget.style.color = '#f3f4f6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                    e.currentTarget.style.color = '#9ca3af';
                  }}
                >
                  ✕
                </button>
              </div>
              
              <div style={{
                maxHeight: '400px',
                overflowY: 'auto',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 12,
                padding: 16
              }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: 8
                }}>
                  {Array.from(formData.selectedFiles).map((file, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: 8,
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 18, flexShrink: 0 }}>📄</span>
                        <span style={{
                          color: '#f8f8f8',
                          fontSize: 14,
                          fontFamily: 'monospace',
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {file.name}
                        </span>
                      </div>
                      <span style={{
                        color: '#9ca3af',
                        fontSize: 12,
                        fontWeight: 500,
                        padding: '2px 8px',
                        background: 'rgba(156, 163, 175, 0.2)',
                        borderRadius: 4,
                        flexShrink: 0,
                        marginLeft: 8
                      }}>
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        @keyframes slideDown {
          0% {
            opacity: 0;
            transform: translateY(-10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
} 

export default function NewJobPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#0f172a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center' }}>
          <Spinner />
          <p style={{ marginTop: 16, color: '#e0e0e0' }}>Loading...</p>
        </div>
      </div>
    }>
      <NewJobPageContent />
    </Suspense>
  );
}