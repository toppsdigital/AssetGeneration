import type { NextApiRequest, NextApiResponse } from 'next';
import { spawn } from 'child_process';
import path from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { folderPath, template, layerEdits } = req.body;

  if (!folderPath) {
    return res.status(400).json({ error: 'Missing required field: folderPath' });
  }

  try {
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
      stdio: 'ignore'
    });

    // Detach the process so it can run independently
    pythonProcess.unref();

    // Log process start
    console.log(`Started PDF upload process with PID: ${pythonProcess.pid}, Job ID: ${jobId}`);

    // Return success response immediately
    return res.status(200).json({
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
    });

  } catch (error) {
    console.error('Error starting PDF upload process:', error);
    return res.status(500).json({
      error: 'Failed to start PDF upload process',
      details: (error as Error).message
    });
  }
} 