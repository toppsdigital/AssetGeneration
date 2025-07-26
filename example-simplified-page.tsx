'use client';

import React from 'react';
import {
  PsdCanvas,
  FileCard,
  Spinner,
  JobStatusBadge,
  TiffImageViewer,
  RegularImageViewer,
  ExpandedImageModal
} from './components';

// This is a simplified example page showing how to use our components
export default function ExamplePage() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>Component Examples</h1>
      
      {/* File Card Examples */}
      <section style={{ marginBottom: '40px' }}>
        <h2>File Cards</h2>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {/* Example file cards would go here */}
        </div>
      </section>

      {/* Loading Spinner */}
      <section style={{ marginBottom: '40px' }}>
        <h2>Loading States</h2>
        <Spinner />
      </section>

      {/* Job Status Badges */}
      <section style={{ marginBottom: '40px' }}>
        <h2>Status Indicators</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <JobStatusBadge status="uploading" />
          <JobStatusBadge status="processing" />
          <JobStatusBadge status="completed" />
          <JobStatusBadge status="error" />
        </div>
      </section>

      {/* Image Viewers */}
      <section style={{ marginBottom: '40px' }}>
        <h2>Image Viewers</h2>
        {/* TiffImageViewer and RegularImageViewer examples would go here */}
      </section>

      {/* PSD Canvas */}
      <section style={{ marginBottom: '40px' }}>
        <h2>PSD Canvas</h2>
        {/* PsdCanvas example would go here */}
      </section>
    </div>
  );
} 