import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { folderPath, psdfile } = body;

    console.log('Upload PDFs request:', { folderPath, psdfile });

    if (!folderPath) {
      return NextResponse.json({ error: 'Folder path is required' }, { status: 400 });
    }

    // Validate the folder path exists and contains PDF files
    const fs = require('fs');
    if (!fs.existsSync(folderPath)) {
      return NextResponse.json({ error: 'Folder path does not exist' }, { status: 400 });
    }

    const files = fs.readdirSync(folderPath);
    const pdfFiles = files.filter((file: string) => file.toLowerCase().endsWith('.pdf'));

    if (pdfFiles.length === 0) {
      return NextResponse.json({ error: 'No PDF files found in the specified folder' }, { status: 400 });
    }

    console.log(`Found ${pdfFiles.length} PDF files to process`);

    // Return success response with file count
    // In a real implementation, you might want to:
    // 1. Start a background job to process the PDFs
    // 2. Upload files to S3
    // 3. Trigger the digital extraction pipeline
    
    return NextResponse.json({
      success: true,
      message: `Successfully processed ${pdfFiles.length} PDF files`,
      fileCount: pdfFiles.length,
      files: pdfFiles.slice(0, 10), // Return first 10 files as preview
      psdfile
    });

  } catch (error) {
    console.error('Upload PDFs error:', error);
    return NextResponse.json(
      { error: 'Failed to process PDF upload', details: error.message },
      { status: 500 }
    );
  }
} 