'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../styles/Home.module.css';
import NavBar from '../components/NavBar';
import { usePsdStore } from '../web/store/psdStore';

export default function Home() {
  const [singleAssetTemplates, setSingleAssetTemplates] = useState<(string | { name: string })[]>([]);
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
        body: JSON.stringify({ client_method: 'list' }),
      });
      if (!res.ok) throw new Error('Failed to fetch templates');
      const data = await res.json();
      
      // Filter for only .json files in uploads/ directory (no subdirectories)
      // Exclude files with "physical" in their name
      const jsonFiles = data.files.filter((file: any) => {
        const fileName = typeof file === 'string' ? file : file.name;
        const isJsonFile = fileName.toLowerCase().endsWith('.json');
        const isInUploads = fileName.startsWith('asset_generator/dev/uploads/');
        const pathParts = fileName.split('/');
        const isDirectlyInUploads = pathParts.length === 4; // asset_generator/dev/uploads/filename.json (4 parts)
        const hasPhysical = fileName.toLowerCase().includes('physical');
        return isJsonFile && isInUploads && isDirectlyInUploads && !hasPhysical;
      });
      
      setSingleAssetTemplates(jsonFiles);
    } catch (err) {
      alert('Error fetching templates: ' + (err as Error).message);
    } finally {
      setLoadingFiles(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleTemplateClick = async (template: string) => {
    const fileName = template.split('/').pop();
    const psdfile = fileName.replace(/\.json$/i, '');
    reset();
    
    // Check if the edit page exists before navigating
    try {
      const res = await fetch(`/${psdfile}/edit`, { method: 'HEAD' });
      if (res.ok) {
        router.push(`/${psdfile}/edit`);
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
        title="Digital Content Production" 
      />
      <div className={styles.content}>
        <div className={styles.mainSections}>
          {/* Physical to Digital Pipeline Section */}
          <div className={styles.prominentSection}>
            <div className={styles.sectionHeader}>
              <h2>Physical to Digital Pipeline</h2>
              <p>Transform physical PDF assets into digital collectibles</p>
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

          {/* In App Content Creation Section */}
          <div className={styles.prominentSection}>
            <div className={styles.sectionHeader}>
              <h2>In App Content Creation</h2>
              <p>Select a PSD to start creating a new asset</p>
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
                        const templateName = typeof template === 'string' ? template : template.name;
                        const fileName = templateName.split('/').pop()!;
                        const displayName = fileName.replace(/\.json$/i, '');
                        return (
                          <li
                            key={`single-${index}`}
                            className={styles.templateCard}
                            onClick={() => handleTemplateClick(templateName)}
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