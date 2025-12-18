
window.addEventListener('rovalra-extract-serverid-request', function(event) {
    const { extractionId } = event.detail;
    
    try {
        const element = document.querySelector(`[data-rovalra-extraction-id="${extractionId}"]`);
        if (!element) {
            window.dispatchEvent(new CustomEvent('rovalra-serverid-extracted', {
                detail: { extractionId, serverId: null, error: "Element not found" }
            }));
            return;
        }
        
        if (typeof angular === 'undefined' || !angular.element) {
            window.dispatchEvent(new CustomEvent('rovalra-serverid-extracted', {
                detail: { extractionId, serverId: null, error: "Angular not available" }
            }));
            return;
        }
        
        const angularElement = angular.element(element);
        const context = angularElement.context;
        
        if (!context) {
            window.dispatchEvent(new CustomEvent('rovalra-serverid-extracted', {
                detail: { extractionId, serverId: null, error: "No context" }
            }));
            return;
        }
        
        const contextKeys = Object.keys(context);
        if (contextKeys.length === 0) {
            window.dispatchEvent(new CustomEvent('rovalra-serverid-extracted', {
                detail: { extractionId, serverId: null, error: "Context has no keys" }
            }));
            return;
        }
        
        const AngularInfo = context[contextKeys[0]];
        
        if (!AngularInfo) {
            window.dispatchEvent(new CustomEvent('rovalra-serverid-extracted', {
                detail: { extractionId, serverId: null, error: "No AngularInfo" }
            }));
            return;
        }
        
        if (!AngularInfo.return || !AngularInfo.return.memoizedProps) {
            window.dispatchEvent(new CustomEvent('rovalra-serverid-extracted', {
                detail: { extractionId, serverId: null, error: "No memoizedProps" }
            }));
            return;
        }
        
        const serverProps = AngularInfo.return.memoizedProps;
        const serverId = serverProps.id;
        
        if (!serverId) {
            window.dispatchEvent(new CustomEvent('rovalra-serverid-extracted', {
                detail: { extractionId, serverId: null, error: "No id in props" }
            }));
            return;
        }
        
        window.dispatchEvent(new CustomEvent('rovalra-serverid-extracted', {
            detail: { extractionId, serverId }
        }));
        
    } catch (e) {
        window.dispatchEvent(new CustomEvent('rovalra-serverid-extracted', {
            detail: { extractionId, serverId: null, error: e.message }
        }));
    }
});
