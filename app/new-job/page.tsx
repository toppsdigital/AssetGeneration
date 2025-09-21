'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from '../../styles/Home.module.css';
import PageTitle from '../../components/PageTitle';
import Spinner from '../../components/Spinner';
import { useAppDataStore } from '../../hooks/useAppDataStore';
import { getAppIcon } from '../../utils/fileOperations';
import { getEnvironmentConfig } from '../../utils/environment';

interface NewJobFormData {
  appName: string;
  filenamePrefix: string;
  description: string;
  uploadFolder: string;
  selectedFiles: FileList | null;
  edrPdfFilename?: string;
  skipManualConfiguration?: boolean;
}

function NewJobPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isDevelopment } = getEnvironmentConfig();
  
  // Use centralized data store for job mutations
  const { mutate: createJobMutation, forceRefreshJobsList } = useAppDataStore('jobs');
  
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
  
  // Rerun operations work exactly like new jobs - no file extraction needed
  // User will select the same folder again, ensuring identical file processing

  // Initialize form data - pre-fill if this is a re-run
  const [formData, setFormData] = useState<NewJobFormData>({
    appName: isRerun ? (searchParams.get('appName') || '') : '',
    filenamePrefix: isRerun ? (searchParams.get('filenamePrefix') || '') : '',
    description: isRerun ? (searchParams.get('description') || '') : '',
    uploadFolder: '',
    selectedFiles: null,
    edrPdfFilename: '',
    skipManualConfiguration: false
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
      
      // Filter only PDF files with _FR.pdf or _BK.pdf endings
      const pdfFiles = Array.from(files).filter(file => {
        const isCorrectType = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const hasCorrectNaming = file.name.match(/_(FR|BK)\.pdf$/i);
        return isCorrectType && hasCorrectNaming;
      });
      
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

  // Handle EDR file selection (single PDF)
  const handleEdrFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const fileName = file.name;
    const isPdf = file.type === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setErrors(prev => ({ ...prev, edrPdfFilename: 'Please select a PDF file' }));
      return;
    }
    // Clear any previous error and set value
    setErrors(prev => ({ ...prev, edrPdfFilename: '' }));
    setFormData(prev => ({ ...prev, edrPdfFilename: fileName }));
    // Store the actual File object in memory for upload page
    try {
      (window as any).pendingEdrFile = file;
      console.log('✅ Stored pending EDR file for upload:', fileName);
    } catch (err) {
      console.warn('⚠️ Failed to store pending EDR file:', err);
    }
  };

  // Check if all required fields are valid
  const isFormValid = (): boolean => {
    const basicFieldsValid = !!(
      formData.appName.trim() &&
      formData.filenamePrefix.trim() &&
      formData.description.trim()
    );
    
    // Both new jobs and reruns require file selection before submission
    const filesValid = !!(
      formData.uploadFolder.trim() &&
      formData.selectedFiles &&
      formData.selectedFiles.length > 0
    );
    
    return basicFieldsValid && filesValid;
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

    // Require upload folder for both new jobs and reruns
    if (!formData.uploadFolder.trim()) {
      newErrors.uploadFolder = 'Upload folder is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Create or rerun job using centralized data store
  const createJob = async (jobData: {
    appName: string;
    filenamePrefix: string;
    sourceFolder: string;
    pdf_files?: string[];
    edr_pdf_filename?: string;
    description?: string;
    skip_manual_configuration?: boolean;
  }) => {
    try {
      const jobPayload = {
        app_name: jobData.appName,
        filename_prefix: jobData.filenamePrefix,
        source_folder: jobData.sourceFolder,
        pdf_files: jobData.pdf_files,
        edr_pdf_filename: jobData.edr_pdf_filename,
        description: jobData.description,
        ...(jobData.skip_manual_configuration ? { skip_manual_configuration: true } : {})
      };

      let response;
      
      if (isRerun && sourceJobId) {
        // Use rerun mutation via centralized data store
        console.log('🔄 Re-running job via useAppDataStore:', sourceJobId);
        response = await createJobMutation({
          type: 'rerunJob',
          jobId: sourceJobId,
          data: jobPayload
        });
        console.log('✅ Job re-run successfully via useAppDataStore:', response.job.job_id);
      } else {
        // Use create mutation via centralized data store
        console.log('🔄 Creating job via useAppDataStore');
        response = await createJobMutation({
          type: 'createJob',
          data: jobPayload
        });
        console.log('✅ Job created successfully via useAppDataStore:', response.job.job_id);
      }
      
      // Force refresh jobs list to show the new job immediately
      await forceRefreshJobsList();
      
      return response.job;
    } catch (error) {
      console.error(`❌ Error ${isRerun ? 're-running' : 'creating'} job via useAppDataStore:`, error);
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
        throw new Error('Please select a folder containing PDF files');
      }

      // Derive pdf_files from selected files (_FR/_BK only, deduped by name)
      const pdfFilesSet = new Set<string>();
      Array.from(formData.selectedFiles).forEach(file => {
        const name = file.name;
        if (/_FR\.pdf$/i.test(name) || /_BK\.pdf$/i.test(name)) {
          pdfFilesSet.add(name);
        }
      });
      const pdfFiles = Array.from(pdfFilesSet);

      if (pdfFiles.length === 0) {
        throw new Error('No valid _FR/_BK PDF files found in the selected folder');
      }

      // Prepare minimal job data for API call
      const jobPayload = {
        appName: formData.appName,
        filenamePrefix: formData.filenamePrefix,
        sourceFolder: generateFilePath(formData.appName),
        pdf_files: pdfFiles,
        edr_pdf_filename: formData.edrPdfFilename || undefined,
        description: formData.description,
        skip_manual_configuration: formData.skipManualConfiguration ? true : undefined
      };

      console.log('🚀 Creating job with payload:', {
        ...jobPayload,
        operation: isRerun ? 'rerun' : 'create',
        stats: {
          totalFilesSelected: formData.selectedFiles.length
        }
      });
      
      // Create job using Content Pipeline API
      const createdJob = await createJob(jobPayload);

      setJobCreated(createdJob);
      console.log(`${isRerun ? 'Job re-run' : 'Job created'} successfully, navigating to job details page...`);
      
      // Both new jobs and reruns now work the same way - store file data and start upload
      const uploadSession = {
        jobId: createdJob.job_id,
        appName: formData.appName,
        filenamePrefix: formData.filenamePrefix,
        description: formData.description,
        edrPdfFilename: formData.edrPdfFilename || undefined,
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
      console.log('Operation type:', isRerun ? 'rerun' : 'new job');
      
      // Navigate to job uploading page for both new jobs and reruns
      const queryParams = new URLSearchParams({
        jobId: createdJob.job_id!
      });
      
      router.push(`/job/uploading?${queryParams.toString()}`);
      console.log(`🔗 Navigating to job uploading page: ${queryParams.toString()}`);
      
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
                    <option value="STARWARS" style={{ background: '#1f2937', color: '#f8f8f8' }}>
                      ⭐ STARWARS
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
                    Select PDF Folder to Upload
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
                        'Click to select folder containing PDF files ending with _FR.pdf or _BK.pdf'
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
                      No valid PDF files found. Please ensure files end with _FR.pdf or _BK.pdf
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

              {/* EDR PDF selector (single PDF picker) */}
              <div style={{ marginTop: 24 }}>
                <label style={{
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#f3f4f6',
                  marginBottom: 8
                }}>
                  Select EDR File (used for asset configuration)
                </label>
                {/* Hidden input for single PDF selection */}
                <input
                  type="file"
                  id="edr-file-input"
                  accept=".pdf"
                  style={{ display: 'none' }}
                  onChange={handleEdrFileSelect}
                />
                <button
                  type="button"
                  onClick={() => {
                    const input = document.getElementById('edr-file-input') as HTMLInputElement;
                    if (input) {
                      // Clear value so selecting the same file again still triggers onChange
                      input.value = '';
                      input.click();
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: `1px solid ${errors.edrPdfFilename ? '#ef4444' : 'rgba(255, 255, 255, 0.2)'}`,
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
                    justifyContent: 'space-between',
                    opacity: 1
                  }}
                >
                  <span>
                    {formData.edrPdfFilename ? (
                      <span title={formData.edrPdfFilename}>📄 {formData.edrPdfFilename}</span>
                    ) : (
                      'Click to select EDR PDF file'
                    )}
                  </span>
                  <span style={{ color: '#9ca3af' }}>📄</span>
                </button>
                {errors.edrPdfFilename && (
                  <p style={{ color: '#ef4444', fontSize: 12, margin: '4px 0 0 0' }}>{errors.edrPdfFilename}</p>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            {isDevelopment && (
              <div style={{ 
                marginTop: 12,
                marginBottom: 12,
                padding: 12,
                borderRadius: 12,
                border: '1px dashed rgba(59, 130, 246, 0.4)',
                background: 'rgba(59, 130, 246, 0.08)'
              }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#c7d2fe', fontSize: 13 }}>
                  <input 
                    type="checkbox" 
                    checked={!!formData.skipManualConfiguration}
                    onChange={(e) => setFormData(prev => ({ ...prev, skipManualConfiguration: e.target.checked }))}
                    style={{ width: 16, height: 16 }}
                  />
                  <span>
                    Dev: skip manual configuration
                  </span>
                </label>
              </div>
            )}

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