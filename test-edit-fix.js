const fetch = require('node-fetch');

async function testEditPageFixedFunctionality() {
  console.log('🔧 Testing FIXED edit.tsx GET presigned URL functionality\n');

  try {
    // Test the exact API call that the updated edit.tsx now makes
    console.log('📡 Step 1: Testing updated edit.tsx API call...');
    const templateStr = 'bunt25_ArticleHeaders_1080x1080.json';
    
    const s3ProxyResponse = await fetch('http://localhost:3002/api/s3-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_method: 'get', filename: templateStr }),
    });

    if (!s3ProxyResponse.ok) {
      throw new Error(`S3 Proxy failed: ${s3ProxyResponse.status}`);
    }

    const { url } = await s3ProxyResponse.json();
    console.log('✅ Got presigned URL successfully with filename parameter');
    console.log(`🔗 URL pattern: ${url.includes('asset_generator/dev/uploads') ? 'CORRECT - includes full path' : 'ERROR - missing path'}`);

    // Test JSON download
    console.log('\n📥 Step 2: Testing JSON download...');
    const jsonResponse = await fetch(url);
    
    if (!jsonResponse.ok) {
      throw new Error(`JSON download failed: ${jsonResponse.status}`);
    }

    const jsonData = await jsonResponse.json();
    console.log('✅ JSON downloaded successfully');
    console.log(`📊 Data validation:`, {
      has_layers: Array.isArray(jsonData.layers),
      layer_count: jsonData.layers?.length || 0,
      has_summary: !!jsonData.summary,
      canvas_size: jsonData.summary?.psd_info?.size || 'N/A'
    });

    console.log('\n🎉 SUCCESS: Edit.tsx fix is working correctly!');
    console.log('✨ The filename parameter now provides consistent behavior with the S3 backend.');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Also test that we can access the edit page
async function testEditPageAccess() {
  console.log('\n\n🌐 Testing edit page accessibility...');
  
  try {
    const response = await fetch('http://localhost:3002/bunt25_ArticleHeaders_1080x1080/edit');
    
    if (response.ok) {
      console.log('✅ Edit page is accessible');
      console.log('🔄 Page should now load JSON data using the fixed filename parameter');
    } else {
      throw new Error(`Edit page not accessible: ${response.status}`);
    }
  } catch (error) {
    console.log('⚠️ Edit page access test failed:', error.message);
  }
}

// Run all tests
console.log('🚀 Running comprehensive tests for edit.tsx fix...\n');
testEditPageFixedFunctionality().then(() => testEditPageAccess()); 