const fetch = require('node-fetch');

async function simulateBrowserEditPageLoad() {
  console.log('🌐 Simulating browser edit page load...\n');
  
  try {
    // Simulate the URL: /bunt25_ArticleHeaders_1080x1080/edit
    // In the browser, psdfile would be 'bunt25_ArticleHeaders_1080x1080'
    // Then edit.tsx adds '.json' to make 'bunt25_ArticleHeaders_1080x1080.json'
    
    const psdfile = 'bunt25_ArticleHeaders_1080x1080'; // This is what router.query.psdfile gives
    let templateStr = psdfile;
    
    // This is the logic from edit.tsx lines 40-42
    if (templateStr && !templateStr.endsWith('.json')) {
      templateStr = `${templateStr}.json`;
    }
    
    console.log('📝 Browser simulation:');
    console.log(`   URL: /bunt25_ArticleHeaders_1080x1080/edit`);
    console.log(`   psdfile param: ${psdfile}`);
    console.log(`   templateStr after .json logic: ${templateStr}`);
    
    // Now simulate the API call that edit.tsx makes
    console.log('\n📡 Making API call (as edit.tsx would)...');
    const response = await fetch('http://localhost:3002/api/s3-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_method: 'get', filename: templateStr }),
    });
    
    if (!response.ok) {
      throw new Error(`API call failed: ${response.status}`);
    }
    
    const { url } = await response.json();
    console.log('✅ Got presigned URL');
    
    // Test downloading the JSON
    console.log('📥 Testing JSON download...');
    const jsonResponse = await fetch(url);
    
    if (!jsonResponse.ok) {
      throw new Error(`JSON download failed: ${jsonResponse.status}`);
    }
    
    const jsonData = await jsonResponse.json();
    console.log('✅ JSON downloaded successfully');
    console.log(`📊 Contains ${jsonData.layers?.length || 0} layers`);
    
    console.log('\n🎉 Browser simulation SUCCESSFUL!');
    console.log('✨ The edit page should work correctly in the browser.');
    
  } catch (error) {
    console.error('\n❌ Browser simulation FAILED:', error.message);
    console.log('\n🔍 This means there is still an issue with the edit page.');
  }
}

simulateBrowserEditPageLoad(); 