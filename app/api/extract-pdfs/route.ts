import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { jobFilePath } = await request.json();

    if (!jobFilePath) {
      return NextResponse.json({ error: 'Missing required field: jobFilePath' }, { status: 400 });
    }

    console.log('Starting PDF extraction process for job file:', jobFilePath);

    // Path to the PDF scripts directory
    const scriptsDir = path.resolve(process.cwd(), '..', 'Content-Scripts', 'PDF');
    const venvPath = path.join(scriptsDir, 'venv', 'bin', 'python');
    const scriptPath = path.join(scriptsDir, 'pdf_extractor.py');

    // Check if the script and venv exist
    const fs = require('fs');
    if (!fs.existsSync(venvPath)) {
      throw new Error(`Virtual environment not found at: ${venvPath}`);
    }
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`PDF extractor script not found at: ${scriptPath}`);
    }

    // Prepare arguments for the Python script
    // The script expects: python pdf_extractor.py extract Jobs/filename.json
    const args = [
      scriptPath,
      'extract',
      jobFilePath
    ];

    console.log('Executing:', venvPath, args.join(' '));

    // Return immediately with a job started response
    // The Python script will handle the actual extraction process
    const extractionJobId = `extraction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Start the Python process but don't wait for completion
    const pythonProcess = spawn(venvPath, args, {
      cwd: scriptsDir,
      detached: true,
      stdio: 'ignore'
    });

    // Detach the process so it can run independently
    pythonProcess.unref();

    // Log process start
    console.log(`Started PDF extraction process with PID: ${pythonProcess.pid}, Job ID: ${extractionJobId}`);

    // Return success response immediately
    return NextResponse.json({
      success: true,
      jobId: extractionJobId,
      message: 'PDF extraction process started successfully',
      jobFilePath,
      processId: pythonProcess.pid
    }, { status: 200 });

  } catch (error) {
    console.error('Error starting PDF extraction process:', error);
    return NextResponse.json({
      error: 'Failed to start PDF extraction process',
      details: (error as Error).message
    }, { status: 500 });
  }
} 