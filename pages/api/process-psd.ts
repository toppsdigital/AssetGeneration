import { NextApiRequest, NextApiResponse } from 'next';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

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

  console.log(`[API] Extracting PSD layers for file: ${file}`);

  const scriptPath = path.join(process.cwd(), 'generate_preview_and_json.py');
  const psdFile = file.endsWith('.psd') ? file : `${file}.psd`;
  const localPsdPath = path.join('/tmp', psdFile);

  if (!fs.existsSync(localPsdPath)) {
    return res.status(404).json({ error: 'PSD file not found in /tmp. Please download it first.' });
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