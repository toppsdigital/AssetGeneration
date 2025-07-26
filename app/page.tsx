'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../styles/Home.module.css';
import PageTitle from '../components/PageTitle';
import { usePsdStore } from '../web/store/psdStore';

export default function Home() {
  const [singleAssetTemplates, setSingleAssetTemplates] = useState<(string | { 
    id: string; 
    name: string; 
    thumbnail?: string; 
    tags?: string[]; 
  })[]>([]);
  
  const router = useRouter();
  const { setPsdFile } = usePsdStore();

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await fetch('/api/templates');
        if (response.ok) {
          const templates = await response.json();
          setSingleAssetTemplates(templates);
        } else {
          console.error('Failed to fetch templates:', response.statusText);
        }
      } catch (error) {
        console.error('Error fetching templates:', error);
      }
    };

    fetchTemplates();
  }, []);

  const handleCreateNewJob = () => {
    router.push('/new-job');
  };

  const handleViewJobs = () => {
    router.push('/jobs');
  };

  const handleTemplateSelect = (templateId: string) => {
    const templateName = typeof templateId === 'string' ? templateId : templateId;
    setPsdFile(templateName);
    router.push(`/${encodeURIComponent(templateName)}/edit`);
  };

  return (
    <div className={styles.container}>
      <PageTitle 
        title="Content Production Hub" 
        subtitle="Upload physical PDFs and convert them into layered, production-ready assets, or create new digital assets from templates."
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
              <button className={styles.primaryButton} onClick={handleCreateNewJob}>
                <span className={styles.buttonIcon}>📄</span>
                New Job
              </button>
              <button className={styles.secondaryButton} onClick={handleViewJobs}>
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
            
            {/* PSD Template Grid */}
            <div className={styles.templateGrid}>
              {singleAssetTemplates.length > 0 ? (
                singleAssetTemplates.map((template, index) => {
                  const templateName = typeof template === 'string' ? template : template.name;
                  const templateId = typeof template === 'string' ? template : template.id || template.name;
                  
                  return (
                    <div
                      key={index}
                      className={styles.templateCard}
                      onClick={() => handleTemplateSelect(templateId)}
                    >
                      <div className={styles.templateIcon}>🎨</div>
                      <h3>{templateName}</h3>
                      <p>Click to edit template</p>
                    </div>
                  );
                })
              ) : (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>📂</div>
                  <h3>No templates available</h3>
                  <p>Templates will appear here when available.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 