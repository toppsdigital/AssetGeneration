import { useState, useCallback, useMemo } from 'react';
import { contentPipelineApi, FileData } from '../web/utils/contentPipelineApi';
import { UIJobData } from '../web/hooks/useJobData';

interface UseFileManagerProps {
  jobData: UIJobData | null;
  setLocalJobData: (data: any) => void;
  queryClient: any;
  jobKeys: any;
}

export const useFileManager = ({ 
  jobData, 
  setLocalJobData, 
  queryClient, 
  jobKeys 
}: UseFileManagerProps) => {
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // Load existing file objects using batch read
  const loadExistingFiles = useCallback(async () => {
    if (!jobData || !jobData.api_files || jobData.api_files.length === 0) return;
    
    try {
      setLoadingFiles(true);
      console.log('Fetching existing file objects for:', jobData.api_files);
      
      // Batch read existing files
      const batchResponse = await contentPipelineApi.batchGetFiles(jobData.api_files);
      console.log('Batch read response:', batchResponse);
      
      // Validate response before processing
      if (!batchResponse.files || !Array.isArray(batchResponse.files)) {
        console.error('Invalid response format from batchGetFiles:', batchResponse);
        throw new Error('Invalid response format from API');
      }
      
      // Map API response to our ContentPipelineFile format
      const fileObjects: FileData[] = batchResponse.files.map(apiFile => ({
        filename: apiFile.filename,
        job_id: apiFile.job_id,
        last_updated: apiFile.last_updated || new Date().toISOString(),
        original_files: apiFile.original_files || {},
        extracted_files: apiFile.extracted_files || {},
        firefly_assets: apiFile.firefly_assets || {}
      }));
      
      // Only update if we actually got files back
      if (fileObjects.length > 0) {
        // Update job data with fetched files
        const updatedJobData = {
          ...jobData,
          content_pipeline_files: fileObjects
        };
        
        console.log('✅ Loaded existing files successfully');
        console.log('🔄 setJobData called from: loadExistingFiles at', new Date().toISOString());
        setLocalJobData(updatedJobData);
        setFilesLoaded(true);
      } else {
        console.warn('⚠️ No files returned from API, keeping existing state');
        setFilesLoaded(true); // Still mark as loaded to prevent retries
      }
      
    } catch (error) {
      console.error('Error fetching file objects:', error);
      throw error;
    } finally {
      setLoadingFiles(false);
    }
  }, [jobData, setLocalJobData]);

  // Create new file objects using batch create
  const createNewFiles = useCallback(async () => {
    if (!jobData || !jobData.api_files || jobData.api_files.length === 0) {
      console.log('createNewFiles: No job data or api_files found');
      return;
    }
    
    try {
      setLoadingFiles(true);
      console.log('Creating file objects for:', jobData.api_files);
      
      // Sanitize app name to ensure it's URL-safe and consistent with S3 paths
      const sanitizeAppName = (str: string) => str.trim().replace(/[^a-zA-Z0-9\-_]/g, '-').replace(/-+/g, '-');
      const sanitizedAppName = sanitizeAppName(jobData.app_name || '');
      
      // Get actual pending files to determine what files need to be created
      const pendingFiles = (window as any).pendingUploadFiles;
      const actualFiles = pendingFiles?.files || [];
      
      console.log('Actual files to be uploaded:', actualFiles.map((f: File) => f.name));
      
      // Create a mapping of actual file names to their base names (for grouping)
      const fileNameToBaseMap = new Map<string, string>();
      actualFiles.forEach((file: File) => {
        const fileName = file.name;
        // Only accept files ending with _FR.pdf or _BK.pdf (strict naming)
        if (fileName.match(/_(FR|BK)\.pdf$/i)) {
          const baseName = fileName.replace(/_(FR|BK)\.pdf$/i, '');
          fileNameToBaseMap.set(fileName, baseName);
        } else {
          console.warn(`⚠️ Skipping file with invalid naming: ${fileName} (must end with _FR.pdf or _BK.pdf)`);
        }
      });
      
      // Group files by their base names (only for valid files)
      const fileGroups = new Map<string, {name: string, type: 'front' | 'back'}[]>();
      actualFiles.forEach((file: File) => {
        const fileName = file.name;
        const baseName = fileNameToBaseMap.get(fileName);
        if (!baseName) return; // Skip files that don't match our naming convention
        
        // Determine card type based on strict filename convention
        let cardType: 'front' | 'back' = 'front';
        if (fileName.match(/_BK\.pdf$/i)) {
          cardType = 'back';
        } else if (fileName.match(/_FR\.pdf$/i)) {
          cardType = 'front';
        } else {
          console.warn(`⚠️ Unexpected filename pattern: ${fileName}`);
          return;
        }
        
        if (!fileGroups.has(baseName)) {
          fileGroups.set(baseName, []);
        }
        fileGroups.get(baseName)!.push({name: fileName, type: cardType});
      });
      
      console.log('File groups created:', Array.from(fileGroups.entries()));
      
      // Create file objects based on the actual files being uploaded
      const fileObjects: FileData[] = Array.from(fileGroups.entries()).map(([baseName, files]) => {
        const originalFiles: Record<string, {
          card_type: 'front' | 'back';
          file_path: string;
          status: 'uploading' | 'uploaded' | 'upload-failed';
        }> = {};
        
        // Add each actual file to the original_files object
        files.forEach(file => {
          originalFiles[file.name] = {
            card_type: file.type,
            file_path: `${sanitizedAppName}/PDFs/${file.name}`,
            status: 'uploading'
          };
        });
        
        return {
          filename: baseName,
          last_updated: new Date().toISOString(),
          original_files: originalFiles
        };
      });
      
      // Create FileData objects for the API with flattened structure
      const apiFileData: FileData[] = fileObjects.map(fileObj => ({
        filename: fileObj.filename,
        job_id: jobData.job_id,
        original_files: fileObj.original_files
      }));
      
      // Batch create files
      const batchResponse = await contentPipelineApi.batchCreateFiles(apiFileData);
      console.log('Batch create response:', batchResponse);
      
      // Handle the response - some files may already exist
      let finalFileObjects: FileData[] = [];
      
      // Add successfully created files
      if (batchResponse.created_files && batchResponse.created_files.length > 0) {
        console.log('✅ Successfully created files:', batchResponse.created_files.length);
        const createdFiles = batchResponse.created_files.map((apiFile: any) => ({
          filename: apiFile.filename,
          last_updated: apiFile.last_updated || new Date().toISOString(),
          original_files: apiFile.original_files || apiFile.metadata?.original_files || {},
          extracted_files: apiFile.extracted_files || apiFile.metadata?.extracted_files || {},
          firefly_assets: apiFile.firefly_assets || apiFile.metadata?.firefly_assets || {}
        }));
        finalFileObjects = [...finalFileObjects, ...createdFiles];
      }
      
      // Handle existing files returned by the API
      if (batchResponse.existing_files && batchResponse.existing_files.length > 0) {
        console.log('📁 Found existing files:', batchResponse.existing_files.length);
        const existingFiles = batchResponse.existing_files.map((apiFile: any) => ({
          filename: apiFile.filename,
          job_id: apiFile.job_id,
          last_updated: apiFile.last_updated || new Date().toISOString(),
          original_files: apiFile.original_files || apiFile.metadata?.original_files || {},
          extracted_files: apiFile.extracted_files || apiFile.metadata?.extracted_files || {},
          firefly_assets: apiFile.firefly_assets || apiFile.metadata?.firefly_assets || {}
        }));
        finalFileObjects = [...finalFileObjects, ...existingFiles];
      }
      
      // Handle any failed files (log for debugging)
      if (batchResponse.failed_files && batchResponse.failed_files.length > 0) {
        console.warn('⚠️ Some files failed to create:', batchResponse.failed_files.length);
        console.warn('Failed files details:', batchResponse.failed_files);
      }
      
      console.log('📁 Final file objects count:', finalFileObjects.length);
      
      // Only update if we actually got files back
      if (finalFileObjects.length > 0) {
        // Update React Query cache with all files (created + existing)
        const updatedJobData = {
          ...jobData,
          content_pipeline_files: finalFileObjects
        };
        
        console.log('Setting job data with file objects:', updatedJobData);
        console.log('🔄 Updating React Query cache from: createNewFiles at', new Date().toISOString());
        
        // Update React Query cache and local UI state for immediate render
        queryClient.setQueryData(jobKeys.detail(jobData.job_id), updatedJobData);
        setLocalJobData(updatedJobData);
        setFilesLoaded(true);
        
        console.log('createNewFiles completed successfully, filesLoaded set to true');
      } else {
        console.warn('⚠️ No files created, keeping existing state');
        setFilesLoaded(true); // Still mark as loaded to prevent retries
      }
      
    } catch (error) {
      console.error('Error creating file objects:', error);
      throw error;
    } finally {
      setLoadingFiles(false);
    }
  }, [jobData, queryClient, jobKeys, setLocalJobData]);

  return useMemo(() => ({
    // State
    filesLoaded,
    loadingFiles,
    setFilesLoaded,
    setLoadingFiles,
    
    // Functions
    loadExistingFiles,
    createNewFiles
  }), [filesLoaded, loadingFiles, loadExistingFiles, createNewFiles]);
};
