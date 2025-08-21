import { useState, useEffect } from 'react';
import { buildS3PublicUrl } from '../utils/environment';

interface PSDFile {
  name: string;
  lastModified: string | null;
  json_url?: string;
}

export const usePSDTemplateManager = (jobStatus?: string) => {
  const [physicalJsonFiles, setPhysicalJsonFiles] = useState<PSDFile[]>([]);
  const [loadingPhysicalFiles, setLoadingPhysicalFiles] = useState(false);
  const [selectedPhysicalFile, setSelectedPhysicalFile] = useState<string>('');
  const [jsonData, setJsonData] = useState<any>(null);
  const [loadingJsonData, setLoadingJsonData] = useState(false);
  const [selectedLayers, setSelectedLayers] = useState<Set<string>>(new Set());
  const [selectedExtractedLayers, setSelectedExtractedLayers] = useState<Set<string>>(new Set());

  // Function to fetch physical JSON files from S3 proxy
  const fetchPhysicalJsonFiles = async () => {
    try {
      setLoadingPhysicalFiles(true);
      console.log('🔍 Fetching physical JSON files from public endpoint...');
      
      const response = await fetch('/api/s3-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          client_method: 'fetch_public_files',
          public_url: buildS3PublicUrl('digital_to_physical_psd_files.json'),
          file_type: 'psd'
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch JSON files: ${response.status}`);
      }

      const data = await response.json();
      console.log('📁 Physical PSD files response:', data);
      
      // The new API returns files in the format:
      // { files: [{ file_name: "...", display_name: "...", json_url: "..." }], total_count: ... }
      const physicalFiles = (data.files || []).map((file: any) => ({
        name: file.file_name || file.name || '',
        lastModified: null, // Not available in the new format
        json_url: file.json_url // Store the json_url for later use
      }));
      
      console.log('🎯 Formatted physical JSON files:', physicalFiles);
      setPhysicalJsonFiles(physicalFiles);
      
    } catch (error) {
      console.error('❌ Error fetching physical JSON files:', error);
    } finally {
      setLoadingPhysicalFiles(false);
    }
  };

  // Function to download and parse JSON file via S3 proxy (to avoid CORS)
  const downloadJsonFile = async (selectedFile: string) => {
    try {
      setLoadingJsonData(true);
      setJsonData(null);
      
      console.log('🔍 Downloading JSON via S3 proxy for selected file:', selectedFile);
      
      // Find the selected file in physicalJsonFiles to get its json_url
      const selectedFileData = physicalJsonFiles.find(file => file.name === selectedFile);
      
      if (!selectedFileData || !selectedFileData.json_url) {
        throw new Error(`JSON URL not found for file: ${selectedFile}`);
      }
      
      console.log('🔗 Using JSON URL:', selectedFileData.json_url);
      
      const jsonUrl = selectedFileData.json_url;
      
      // Always use S3 proxy to avoid CORS issues
      const requestBody = { 
        client_method: 'get',
        filename: jsonUrl,
        download: true,
        direct_url: jsonUrl.startsWith('http://') || jsonUrl.startsWith('https://')
      };
      
      console.log('📤 S3 proxy request body:', requestBody);
      
      const response = await fetch('/api/s3-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      console.log('📥 S3 proxy response status:', response.status);
      
      if (!response.ok) {
        let errorDetails = `Status: ${response.status}`;
        try {
          const errorBody = await response.text();
          console.log('❌ S3 proxy error response body:', errorBody);
          errorDetails += ` - ${errorBody}`;
        } catch (e) {
          console.log('❌ Could not read error response body:', e);
        }
        throw new Error(`Failed to download JSON via proxy: ${errorDetails}`);
      }
      
      const jsonData = await response.json();
      console.log('📋 JSON data loaded successfully via proxy, keys:', Object.keys(jsonData || {}));
      
      if (jsonData && typeof jsonData === 'object') {
        setJsonData(jsonData);
      } else {
        throw new Error('Invalid JSON content received from proxy');
      }
      
    } catch (error) {
      console.error('❌ Error downloading JSON via proxy:', error);
      setJsonData(null);
    } finally {
      setLoadingJsonData(false);
    }
  };

  // Fetch physical JSON files when status is "extracted"
  useEffect(() => {
    if (jobStatus?.toLowerCase() === 'extracted') {
      fetchPhysicalJsonFiles();
    }
  }, [jobStatus]);

  // Download JSON when file is selected
  useEffect(() => {
    if (selectedPhysicalFile) {
      downloadJsonFile(selectedPhysicalFile);
    } else {
      setJsonData(null);
    }
    // Clear selected layers when changing files
    setSelectedLayers(new Set());
    setSelectedExtractedLayers(new Set());
  }, [selectedPhysicalFile, physicalJsonFiles]);

  return {
    // State
    physicalJsonFiles,
    loadingPhysicalFiles,
    selectedPhysicalFile,
    jsonData,
    loadingJsonData,
    selectedLayers,
    selectedExtractedLayers,
    
    // Setters
    setPhysicalJsonFiles,
    setSelectedPhysicalFile,
    setJsonData,
    setSelectedLayers,
    setSelectedExtractedLayers,
    
    // Functions
    fetchPhysicalJsonFiles,
    downloadJsonFile
  };
};
