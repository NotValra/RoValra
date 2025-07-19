// Firefox compatibility test script
// This can be used to test if the browser polyfill is working correctly

console.log('Firefox compatibility test starting...');

// Test if chrome API is available
if (typeof chrome !== 'undefined') {
    console.log('✅ Chrome API is available');
    
    // Test runtime.getURL
    try {
        const url = chrome.runtime.getURL('browser-polyfill.js');
        console.log('✅ chrome.runtime.getURL works:', url);
    } catch (error) {
        console.error('❌ chrome.runtime.getURL failed:', error);
    }
    
    // Test storage API
    try {
        chrome.storage.local.get(['test'], (result) => {
            console.log('✅ chrome.storage.local.get works:', result);
        });
    } catch (error) {
        console.error('❌ chrome.storage.local.get failed:', error);
    }
    
    // Test runtime.sendMessage
    try {
        chrome.runtime.sendMessage({ action: 'test' }, (response) => {
            console.log('✅ chrome.runtime.sendMessage works:', response);
        });
    } catch (error) {
        console.error('❌ chrome.runtime.sendMessage failed:', error);
    }
    
} else {
    console.error('❌ Chrome API is not available');
}

// Test if we're in Firefox
if (typeof browser !== 'undefined') {
    console.log('✅ Browser API is available (Firefox detected)');
} else {
    console.log('ℹ️ Browser API not available (likely Chrome)');
}

// Test unifiedAPI if available
if (typeof unifiedAPI !== 'undefined') {
    console.log('✅ Unified API is available');
} else {
    console.log('ℹ️ Unified API not available');
}

console.log('Firefox compatibility test completed'); 