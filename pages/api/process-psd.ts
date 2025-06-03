import { NextApiRequest, NextApiResponse } from 'next';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import fetch from 'node-fetch';

function copyDirSync(src: string, dest: string) {
  console.log(`[API] Copying directory from ${src} to ${dest}`);
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const file of fs.readdirSync(src)) {
    const srcPath = path.join(src, file);
    const destPath = path.join(dest, file);
    if (fs.lstatSync(srcPath).isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { file } = req.query;
  if (!file || typeof file !== 'string') {
    console.log('[API] Error: Missing PSD file parameter');
    return res.status(400).json({ error: 'Missing PSD file parameter' });
  }

  console.log(`[API] Processing request for file: ${file}`);

  const scriptPath = path.join(process.cwd(), 'generate_preview_and_json.py');
  const psdFile = file.endsWith('.psd') ? file : `${file}.psd`;
  const localPsdPath = path.join('/tmp', psdFile);

  // Download the PSD from S3 if not already present
  if (!fs.existsSync(localPsdPath)) {
    try {
      // Get presigned URL from s3-proxy
      const s3Res = await fetch('http://localhost:3000/api/s3-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_method: 'get', filename: psdFile }),
      });
      if (!s3Res.ok) {
        console.error('[API] Failed to get presigned S3 URL');
        return res.status(500).json({ error: 'Failed to get presigned S3 URL' });
      }
      const { url } = await s3Res.json();
      // Download the PSD file to /tmp
      const fileRes = await fetch(url);
      if (!fileRes.ok) {
        console.error('[API] Failed to download PSD from S3');
        return res.status(500).json({ error: 'Failed to download PSD from S3' });
      }
      const arrayBuffer = await fileRes.arrayBuffer();
      fs.writeFileSync(localPsdPath, Buffer.from(arrayBuffer));
      console.log(`[API] Downloaded PSD to ${localPsdPath}`);
    } catch (err) {
      console.error('[API] Error downloading PSD from S3:', err);
      return res.status(500).json({ error: 'Error downloading PSD from S3' });
    }
  }

  // Run the Python script using the virtual environment
  const startTime = Date.now();
  const pythonPath = path.join(process.cwd(), 'venv', 'bin', 'python');
  const pythonProcess = spawn(pythonPath, [scriptPath, localPsdPath]);
  console.log(`[API] Spawned Python process at ${new Date(startTime).toISOString()}`);

  let stdout = '';
  let stderr = '';

  pythonProcess.stdout.on('data', (data) => {
    stdout += data.toString();
    console.log(`[PYTHON STDOUT]: ${data.toString()}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    stderr += data.toString();
    console.error(`[PYTHON STDERR]: ${data.toString()}`);
  });

  pythonProcess.on('close', (code) => {
    const endTime = Date.now();
    console.log(`[API] Python process exited with code ${code} after ${(endTime - startTime) / 1000}s`);
    
    if (code !== 0) {
      console.error(`[API] Python process failed with stderr:`, stderr);
      return res.status(500).json({ error: stderr || 'Failed to process PSD (Python error)' });
    }

    // Read output from public/temp/<psdfile>
    const baseName = psdFile.replace(/\.psd$/i, '');
    const publicTempDir = path.join(process.cwd(), 'public', 'temp', baseName);
    const jsonPath = path.join(publicTempDir, 'layer_structure.json');
    const previewsPath = path.join(publicTempDir, 'previews');

    console.log(`[API] Checking output files:`);
    console.log(`[API] - JSON path: ${jsonPath}`);
    console.log(`[API] - Previews path: ${previewsPath}`);

    if (!fs.existsSync(jsonPath)) {
      console.error(`[API] Output JSON not found: ${jsonPath}`);
      return res.status(500).json({ error: 'PSD processing failed: output file not created.' });
    }

    if (!fs.existsSync(previewsPath)) {
      console.error(`[API] Output previews not found: ${previewsPath}`);
      return res.status(500).json({ error: 'PSD processing failed: previews not created.' });
    }

    try {
      // Read and return the JSON
      console.log(`[API] Reading layer_structure.json...`);
      const json = fs.readFileSync(jsonPath, 'utf-8');
      console.log(`[API] Successfully processed and returned PSD data for ${file}`);
      res.status(200).json({ ...JSON.parse(json), tempDir: `/temp/${baseName}` });
    } catch (error) {
      console.error(`[API] Error reading files:`, error);
      res.status(500).json({ error: 'Failed to read processed files' });
    }
  });
} 