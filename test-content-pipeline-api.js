// Quick test for Content Pipeline API - Create New Job
// This tests the API proxy we just created

const API_BASE_URL = 'http://localhost:3000/api/content-pipeline-proxy';

async function testCreateJob() {
  console.log('🧪 Testing Content Pipeline API - Create Job');
  console.log('='.repeat(50));

  const testJobData = {
    app_name: 'BUNT',
    release_name: '2025 Test Series',
    source_folder: 'BUNT/PDFs',
    files: ['test_card_001.pdf', 'test_card_002.pdf', 'test_card_003.pdf'],
    description: 'Test job created via API proxy'
  };

  try {
    console.log('📤 Sending request to create job...');
    console.log('Job data:', JSON.stringify(testJobData, null, 2));
    
    const response = await fetch(`${API_BASE_URL}?operation=create_job`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testJobData),
    });

    console.log(`\n📊 Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Error response:', errorText);
      
      // Try to parse as JSON for better error display
      try {
        const errorJson = JSON.parse(errorText);
        console.log('❌ Error details:', JSON.stringify(errorJson, null, 2));
      } catch (e) {
        console.log('❌ Raw error:', errorText);
      }
      return;
    }

    const responseData = await response.json();
    console.log('✅ Success! Job created:');
    console.log(JSON.stringify(responseData, null, 2));
    
    if (responseData.job && responseData.job.job_id) {
      console.log(`\n🎉 Job ID: ${responseData.job.job_id}`);
      console.log(`📊 Job Status: ${responseData.job.job_status}`);
      console.log(`📁 Files Count: ${responseData.job.files ? responseData.job.files.length : 0}`);
      
      // Test getting the job back
      await testGetJob(responseData.job.job_id);
    }

  } catch (error) {
    console.log('❌ Network/Parse Error:', error.message);
    console.log('🔍 Full error:', error);
  }
}

async function testGetJob(jobId) {
  console.log('\n' + '='.repeat(50));
  console.log('🔍 Testing Get Job by ID');
  
  try {
    console.log(`📤 Getting job: ${jobId}`);
    
    const response = await fetch(`${API_BASE_URL}?operation=get_job&id=${encodeURIComponent(jobId)}`);
    
    console.log(`📊 Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Error getting job:', errorText);
      return;
    }

    const responseData = await response.json();
    console.log('✅ Job retrieved successfully:');
    console.log(JSON.stringify(responseData, null, 2));
    
  } catch (error) {
    console.log('❌ Error getting job:', error.message);
  }
}

async function testListJobs() {
  console.log('\n' + '='.repeat(50));
  console.log('📋 Testing List Jobs');
  
  try {
    console.log('📤 Getting recent jobs...');
    
    const response = await fetch(`${API_BASE_URL}?operation=list_jobs&limit=5&recent_only=true`);
    
    console.log(`📊 Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Error listing jobs:', errorText);
      return;
    }

    const responseData = await response.json();
    console.log('✅ Jobs listed successfully:');
    console.log(`📊 Total jobs: ${responseData.count || 0}`);
    
    if (responseData.jobs && responseData.jobs.length > 0) {
      console.log('📋 Recent jobs:');
      responseData.jobs.forEach((job, index) => {
        console.log(`  ${index + 1}. ${job.job_id} - ${job.job_status} (${job.app_name})`);
      });
    }
    
  } catch (error) {
    console.log('❌ Error listing jobs:', error.message);
  }
}

// Run the test
async function runTests() {
  console.log('🚀 Starting Content Pipeline API Tests...\n');
  
  // Check if Next.js server is running
  try {
    const healthCheck = await fetch('http://localhost:3000/api/health');
    console.log('✅ Next.js server is running');
  } catch (error) {
    console.log('❌ Next.js server is not running on localhost:3000');
    console.log('Please start the server with: npm run dev');
    return;
  }
  
  await testCreateJob();
  await testListJobs();
  
  console.log('\n🏁 Tests completed!');
  console.log('\nNote: These tests will fail if your actual Content Pipeline API is not configured.');
  console.log('Set CONTENT_PIPELINE_API_URL in your .env.local file to test with real API.');
}

// Run if called directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testCreateJob, testGetJob, testListJobs }; 