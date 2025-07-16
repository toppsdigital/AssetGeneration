// Web Worker for base64 conversion
// This runs in a background thread to avoid blocking the main UI thread

self.onmessage = async function(e) {
  const { id, file, fileName } = e.data;
  
  try {
    console.log(`[Worker] Converting ${fileName} to base64...`);
    
    // Convert File to base64
    const reader = new FileReader();
    
    reader.onload = function() {
      const result = reader.result;
      if (typeof result === 'string') {
        // Remove the data:mime/type;base64, prefix
        const base64 = result.split(',')[1];
        
        // Send result back to main thread
        self.postMessage({
          id,
          fileName,
          success: true,
          base64Content: base64
        });
        
        console.log(`[Worker] ✅ Converted ${fileName} successfully`);
      } else {
        throw new Error('FileReader result is not a string');
      }
    };
    
    reader.onerror = function() {
      self.postMessage({
        id,
        fileName,
        success: false,
        error: 'FileReader error'
      });
      console.error(`[Worker] ❌ Failed to read ${fileName}`);
    };
    
    // Start reading the file
    reader.readAsDataURL(file);
    
  } catch (error) {
    self.postMessage({
      id,
      fileName,
      success: false,
      error: error.message || 'Unknown error'
    });
    console.error(`[Worker] ❌ Error converting ${fileName}:`, error);
  }
};

console.log('[Worker] Base64 conversion worker initialized'); 