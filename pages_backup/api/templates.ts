import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const inputsDir = path.join(process.cwd(), 'inputs');
  if (!fs.existsSync(inputsDir)) {
    return res.status(404).json({ error: 'Inputs directory not found' });
  }

  const files = fs.readdirSync(inputsDir);
  const psdFiles = files.filter(file => file.endsWith('.psd'));
  res.status(200).json(psdFiles);
} 