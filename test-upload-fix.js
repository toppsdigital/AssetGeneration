const FormData = require('form-data');
const fs = require('fs');
const fetch = require('node-fetch');

async function testUploadFlow() {
  console.log('Testing upload proxy flow...');
  
  try {
    // Step 1: Get upload URL from proxy
    console.log('1. Getting upload URL from proxy...');
    const proxyResponse = await fetch('http://localhost:3000/api/s3-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_method: 'put',
        filename: 'test-uploads/test-image.jpg',
        upload: true
      })
    });
    
    if (!proxyResponse.ok) {
      throw new Error(`Proxy request failed: ${proxyResponse.status}`);
    }
    
    const { uploadUrl, presignedUrl } = await proxyResponse.json();
    console.log('✅ Got upload URL:', uploadUrl);
    console.log('✅ Got presigned URL:', presignedUrl);
    
    // Step 2: Create a test file (we'll create a small text file for testing)
    const testContent = Buffer.from('This is a test file for upload');
    const testFile = {
      buffer: testContent,
      originalname: 'test-image.jpg',
      mimetype: 'image/jpeg'
    };
    
    // Step 3: Upload via our proxy
    console.log('2. Uploading file via proxy...');
    const formData = new FormData();
    formData.append('file', testContent, {
      filename: 'test-image.jpg',
      contentType: 'image/jpeg'
    });
    formData.append('presignedUrl', presignedUrl);
    
    const uploadResponse = await fetch(`http://localhost:3000${uploadUrl}`, {
      method: 'POST',
      body: formData
    });
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Upload failed: ${uploadResponse.status} ${errorText}`);
    }
    
    const result = await uploadResponse.json();
    console.log('✅ Upload successful:', result);
    
    console.log('\n🎉 Upload proxy flow working correctly!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Wait a moment for server to start, then run test
setTimeout(testUploadFlow, 2000); 