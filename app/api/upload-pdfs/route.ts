import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { folderPath, template, layerEdits } = await request.json();

    if (!folderPath) {
      return NextResponse.json({ error: 'Missing required field: folderPath' }, { status: 400 });
    }

    console.log('Starting PDF upload process for folder:', folderPath);

    // Path to the PDF scripts directory
    const scriptsDir = path.resolve(process.cwd(), '..', 'Content-Scripts', 'PDF');
    const venvPath = path.join(scriptsDir, 'venv', 'bin', 'python');
    const scriptPath = path.join(scriptsDir, 'pdf_uploader.py');

    // Check if the script and venv exist
    const fs = require('fs');
    if (!fs.existsSync(venvPath)) {
      throw new Error(`Virtual environment not found at: ${venvPath}`);
    }
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`PDF uploader script not found at: ${scriptPath}`);
    }

    // Check if the folder path exists
    if (!fs.existsSync(folderPath)) {
      throw new Error(`Folder path does not exist: ${folderPath}`);
    }

    // Check if the folder path is actually a directory
    const stats = fs.statSync(folderPath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${folderPath}`);
    }

    // Prepare arguments for the Python script
    // The script expects: python pdf_uploader.py upload <path> [options]
    const args = [
      scriptPath,
      'upload',
      folderPath,
      '--enable-job-tracking'
    ];

    console.log('Executing:', venvPath, args.join(' '));

    // Return immediately with a job started response
    // The Python script will handle the actual upload process
    const jobId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Start the Python process but don't wait for completion
    const pythonProcess = spawn(venvPath, args, {
      cwd: scriptsDir,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'] // Capture stdout and stderr for debugging
    });

    // Handle process errors
    pythonProcess.on('error', (error) => {
      console.error('Python process error:', error);
    });

    // Log stdout and stderr for debugging
    pythonProcess.stdout?.on('data', (data) => {
      console.log('Python stdout:', data.toString());
    });

    pythonProcess.stderr?.on('data', (data) => {
      console.error('Python stderr:', data.toString());
    });

    pythonProcess.on('close', (code) => {
      console.log(`Python process exited with code: ${code}`);
    });

    // Detach the process so it can run independently
    pythonProcess.unref();

    // Log process start
    console.log(`Started PDF upload process with PID: ${pythonProcess.pid}, Job ID: ${jobId}`);

    // Return success response immediately
    return NextResponse.json({
      success: true,
      jobId,
      message: 'PDF upload process started successfully',
      folderPath,
      processId: pythonProcess.pid,
      // Include template and layerEdits for potential future processing
      metadata: {
        template: template || null,
        layerEdits: layerEdits || null
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Error starting PDF upload process:', error);
    return NextResponse.json({
      error: 'Failed to start PDF upload process',
      details: (error as Error).message
    }, { status: 500 });
  }
} 