import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Create inputs directory if it doesn't exist
    const inputsDir = path.join(process.cwd(), 'inputs');
    if (!fs.existsSync(inputsDir)) {
      fs.mkdirSync(inputsDir, { recursive: true });
    }

    // Generate a unique filename
    const timestamp = Date.now();
    const filename = `${timestamp}-${file.name}`;
    const filepath = path.join(inputsDir, filename);

    // Convert file to buffer and save
    const fileBuffer = await file.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(fileBuffer));

    console.log('File uploaded successfully:', filepath);
    
    return NextResponse.json({ 
      success: true, 
      filename,
      filepath 
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ 
      error: 'Upload failed', 
      details: (error as Error).message 
    }, { status: 500 });
  }
} 