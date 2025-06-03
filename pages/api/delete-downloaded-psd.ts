import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { file } = req.body;
  if (!file || typeof file !== 'string' || !file.endsWith('.psd')) {
    return res.status(400).json({ error: 'Invalid file parameter' });
  }
  const filePath = path.join('/tmp', file);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return res.status(200).json({ deleted: true });
    } else {
      return res.status(404).json({ error: 'File not found' });
    }
  } catch (e) {
    return res.status(500).json({ error: 'Failed to delete file' });
  }
} 