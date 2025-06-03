import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const tmpDir = '/tmp';
  let files: string[] = [];
  try {
    files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.psd'));
  } catch (e) {
    // Directory may not exist yet
    files = [];
  }
  res.status(200).json({ files });
} 