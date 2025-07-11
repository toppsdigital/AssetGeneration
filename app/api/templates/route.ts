import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  const inputsDir = path.join(process.cwd(), 'inputs');
  if (!fs.existsSync(inputsDir)) {
    return NextResponse.json({ error: 'Inputs directory not found' }, { status: 404 });
  }

  const files = fs.readdirSync(inputsDir);
  const psdFiles = files.filter(file => file.endsWith('.psd'));
  return NextResponse.json(psdFiles);
} 