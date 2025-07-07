import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobFilePath } = body;

    if (!jobFilePath) {
      return NextResponse.json({ error: 'Missing required field: jobFilePath' }, { status: 400 });
    }

    console.log('Starting digital asset creation process for job file:', jobFilePath);

    // Path to the Content-Scripts directory (parent of Firefly)
    const contentScriptsDir = path.resolve(process.cwd(), '..', 'Content-Scripts');
    const fireflyDir = path.join(contentScriptsDir, 'Firefly');
    const venvPath = path.join(fireflyDir, 'venv', 'bin', 'python');
    const scriptPath = path.join(fireflyDir, 'firefly_asset_generator.py');

    // Check if the script and venv exist
    const fs = require('fs');
    if (!fs.existsSync(venvPath)) {
      throw new Error(`Virtual environment not found at: ${venvPath}`);
    }
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Firefly asset generator script not found at: ${scriptPath}`);
    }

    // Prepare arguments for the Python script
    // The script expects: python firefly_asset_generator.py --job-s3-path Jobs/filename.json
    const args = [
      scriptPath,
      '--job-s3-path',
      jobFilePath
    ];

    console.log('Executing:', venvPath, args.join(' '));

    // Return immediately with a job started response
    // The Python script will handle the actual asset creation process
    const assetJobId = `asset_creation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Start the Python process but don't wait for completion
    const pythonProcess = spawn(venvPath, args, {
      cwd: contentScriptsDir,
      detached: true,
      stdio: 'ignore'
    });

    // Detach the process so it can run independently
    pythonProcess.unref();

    // Log process start
    console.log(`Started digital asset creation process with PID: ${pythonProcess.pid}, Job ID: ${assetJobId}`);

    // Return success response immediately
    return NextResponse.json({
      success: true,
      jobId: assetJobId,
      message: 'Digital asset creation process started successfully',
      jobFilePath,
      processId: pythonProcess.pid
    });

  } catch (error) {
    console.error('Error starting digital asset creation process:', error);
    return NextResponse.json({
      error: 'Failed to start digital asset creation process',
      details: (error as Error).message
    }, { status: 500 });
  }
} 