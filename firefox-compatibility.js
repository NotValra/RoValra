// Firefox Compatibility Checker for RoValra
// This script can be injected to test Firefox compatibility

(function() {
    'use strict';
    
    console.log('🔍 RoValra Firefox Compatibility Check Starting...');
    
    const tests = {
        chromeAPI: false,
        browserAPI: false,
        storage: false,
        runtime: false,
        messaging: false,
        scripting: false
    };
    
    // Test 1: Chrome API availability
    if (typeof chrome !== 'undefined' && chrome.runtime) {
        tests.chromeAPI = true;
        console.log('✅ Chrome API is available');
    } else {
        console.log('❌ Chrome API not available');
    }
    
    // Test 2: Browser API availability
    if (typeof browser !== 'undefined' && browser.runtime) {
        tests.browserAPI = true;
        console.log('✅ Browser API is available (Firefox detected)');
    } else {
        console.log('ℹ️ Browser API not available (likely Chrome)');
    }
    
    // Test 3: Storage API
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        tests.storage = true;
        console.log('✅ Storage API is available');
        
        // Test storage functionality
        chrome.storage.local.get(['test'], (result) => {
            console.log('✅ Storage read test successful:', result);
        });
    } else {
        console.log('❌ Storage API not available');
    }
    
    // Test 4: Runtime API
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        tests.runtime = true;
        console.log('✅ Runtime API is available');
        
        try {
            const url = chrome.runtime.getURL('browser-polyfill.js');
            console.log('✅ Runtime.getURL test successful:', url);
        } catch (error) {
            console.log('❌ Runtime.getURL test failed:', error);
        }
    } else {
        console.log('❌ Runtime API not available');
    }
    
    // Test 5: Messaging API
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        tests.messaging = true;
        console.log('✅ Messaging API is available');
        
        // Test messaging (non-blocking)
        setTimeout(() => {
            chrome.runtime.sendMessage({ action: 'test' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.log('⚠️ Messaging test had error (expected):', chrome.runtime.lastError);
                } else {
                    console.log('✅ Messaging test successful:', response);
                }
            });
        }, 100);
    } else {
        console.log('❌ Messaging API not available');
    }
    
    // Test 6: Scripting API (background only)
    if (typeof chrome !== 'undefined' && chrome.scripting) {
        tests.scripting = true;
        console.log('✅ Scripting API is available');
    } else {
        console.log('ℹ️ Scripting API not available (content script context)');
    }
    
    // Summary
    setTimeout(() => {
        console.log('\n📊 Firefox Compatibility Summary:');
        console.log('================================');
        Object.entries(tests).forEach(([test, passed]) => {
            console.log(`${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASS' : 'FAIL'}`);
        });
        
        const passedTests = Object.values(tests).filter(Boolean).length;
        const totalTests = Object.keys(tests).length;
        
        console.log(`\n🎯 Overall: ${passedTests}/${totalTests} tests passed`);
        
        if (passedTests >= 4) {
            console.log('🎉 RoValra should work correctly in this browser!');
        } else {
            console.log('⚠️ Some compatibility issues detected. Check console for details.');
        }
        
        console.log('\n🔍 Firefox Compatibility Check Complete');
    }, 500);
    
})(); 