'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../styles/Home.module.css';
import NavBar from '../components/NavBar';
import { usePsdStore } from '../web/store/psdStore';

export default function Home() {
  const [singleAssetTemplates, setSingleAssetTemplates] = useState<(string | { 
    file_name: string; 
    display_name: string; 
    json_url: string; 
  })[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const router = useRouter();
  const { setPsdFile, reset } = usePsdStore();

  // Refactor file list fetch into a function
  const fetchFiles = async () => {
    setLoadingFiles(true);
    try {
      const res = await fetch('/api/s3-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          client_method: 'fetch_public_files',
          public_url: 'https://topps-nexus-powertools.s3.us-east-1.amazonaws.com/asset_generator/dev/public/one_off_psd_files.json',
          file_type: 'psd'
        }),
      });
      if (!res.ok) throw new Error('Failed to fetch templates');
      const data = await res.json();
      
      // The new API returns files in the format:
      // { files: [{ file_name: "...", display_name: "...", json_url: "..." }], total_count: ... }
      const psdFiles = data.files || [];
      
      setSingleAssetTemplates(psdFiles);
    } catch (err) {
      alert('Error fetching templates: ' + (err as Error).message);
    } finally {
      setLoadingFiles(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleTemplateClick = async (template: any) => {
    // Handle both old string format and new object format
    const psdfile = typeof template === 'string' 
      ? template.split('/').pop()?.replace(/\.json$/i, '') || ''
      : template.display_name || template.file_name?.replace(/\.psd$/i, '') || '';
    
    // Get the JSON URL from the template data
    const jsonUrl = typeof template === 'string' 
      ? template // For backward compatibility with old string format
      : template.json_url;
    
    reset();
    
    // Check if the edit page exists before navigating
    try {
      const res = await fetch(`/${psdfile}/edit`, { method: 'HEAD' });
      if (res.ok) {
        // Pass the JSON URL as a query parameter
        const editUrl = jsonUrl 
          ? `/${psdfile}/edit?jsonUrl=${encodeURIComponent(jsonUrl)}`
          : `/${psdfile}/edit`;
        router.push(editUrl);
      } else {
        alert('Edit page not found for this template.');
      }
    } catch {
      alert('Error checking edit page.');
    }
  };

  const handleNewJob = () => {
    router.push('/new-job');
  };

  const handleViewJobs = () => {
    router.push('/jobs');
  };

  return (
    <div className={styles.container}>
      <NavBar 
        title="Content Production Hub" 
      />
      <div className={styles.content}>
        <div className={styles.mainSections}>
          {/* Physical to Digital Pipeline Section */}
          <div className={styles.prominentSection}>
            <div className={styles.sectionHeader}>
              <h2>Physical to Digital Pipeline</h2>
              <p>Upload physical PDFs, and convert them into layered, production-ready assets.</p>
            </div>
            <div className={styles.buttonGroup}>
              <button
                onClick={handleNewJob}
                className={styles.primaryButton}
              >
                <span className={styles.buttonIcon}>+</span>
                New Job
              </button>
              <button
                onClick={handleViewJobs}
                className={styles.secondaryButton}
              >
                <span className={styles.buttonIcon}>📋</span>
                View Jobs
              </button>
            </div>
          </div>

          {/* Create New Digital Assets Section */}
          <div className={styles.prominentSection}>
            <div className={styles.sectionHeader}>
              <h2>Create New Digital Assets</h2>
              <p>Select a PSD template to generate an image for in-app use.</p>
            </div>
            <div className={styles.templatesList}>
              {loadingFiles ? (
                <div style={{ textAlign: 'center', margin: '24px 0' }}>
                  <div className={styles.spinner}></div>
                  <p style={{ marginTop: '16px', color: '#b0b0b0' }}>Fetching available PSDs...</p>
                </div>
              ) : (
                <>
                  {singleAssetTemplates.length > 0 ? (
                    <ul className={styles.templateGrid}>
                      {singleAssetTemplates.map((template, index) => {
                        // Handle both old string format and new object format
                        const displayName = typeof template === 'string' 
                          ? template.split('/').pop()?.replace(/\.json$/i, '') || ''
                          : template.display_name || template.file_name?.replace(/\.psd$/i, '') || '';
                        
                        return (
                          <li
                            key={`single-${index}`}
                            className={styles.templateCard}
                            onClick={() => handleTemplateClick(template)}
                          >
                            <span className={styles.templateIcon}>🎨</span>
                            <span className={styles.templateName}>{displayName}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p style={{ color: '#b0b0b0', fontStyle: 'italic', textAlign: 'center', margin: '24px 0' }}>
                      No PSD template files found.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 