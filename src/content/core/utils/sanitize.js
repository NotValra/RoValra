// Technically not in use but still nice to have
export function sanitizeString(str) {
    if (typeof str !== 'string') return str;
    
    str = str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    str = str.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
    str = str.replace(/on\w+\s*=\s*[^\s>]*/gi, '');
    
    str = str.replace(/javascript:/gi, '');
    
    str = str.replace(/data:text\/html[^,]*,/gi, '');
    
    str = str.replace(/style\s*=\s*["'][^"']*["']/gi, '');
    
    str = str.replace(/expression\s*\(/gi, '');
    
    str = str.replace(/vbscript:/gi, '');
    

    str = str.replace(/<[^>]*>/g, '');
    
    return str;
}


export function htmlEncode(str) {
    if (typeof str !== 'string') return str;
    
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}


export function createSafeTextNode(str) {
    return document.createTextNode(String(str));
}


export function setSafeText(element, text) {
    if (!element || !(element instanceof HTMLElement)) {
        console.warn('setSafeText: Invalid element provided');
        return element;
    }
    
    const sanitized = sanitizeString(String(text));
    
    element.textContent = sanitized;
    
    return element;
}


export function setSafeAttribute(element, attrName, attrValue) {
    if (!element || !(element instanceof HTMLElement)) {
        console.warn('setSafeAttribute: Invalid element provided');
        return element;
    }
    
    const dangerousAttrs = ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur'];
    
    if (dangerousAttrs.includes(attrName.toLowerCase())) {
        console.warn(`setSafeAttribute: Blocked dangerous attribute: ${attrName}`);
        return element;
    }
    
    const sanitized = sanitizeString(String(attrValue));
    
    if ((attrName.toLowerCase() === 'href' || attrName.toLowerCase() === 'src')) {
        if (sanitized.toLowerCase().includes('javascript:') || sanitized.toLowerCase().includes('data:text/html')) {
            console.warn(`setSafeAttribute: Blocked dangerous ${attrName} value`);
            return element;
        }
    }
    
    element.setAttribute(attrName, sanitized);
    return element;
}

export function sanitizeObject(obj) {
    if (obj === null || obj === undefined) {
        return obj;
    }
    
    if (typeof obj === 'string') {
        return sanitizeString(obj);
    }
    
    if (typeof obj === 'number' || typeof obj === 'boolean') {
        return obj;
    }
    
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
    }
    
    if (typeof obj === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            const sanitizedKey = sanitizeString(key);
            sanitized[sanitizedKey] = sanitizeObject(value);
        }
        return sanitized;
    }
    
    return obj;
}


export function sanitizeSettings(settings, SETTINGS_CONFIG = null) {
    if (!settings || typeof settings !== 'object') {
        throw new Error('Invalid settings format');
    }
    
    const sanitized = {};
    
    if (SETTINGS_CONFIG) {
        for (const [key, value] of Object.entries(settings)) {
            let settingDef = null;
            for (const category of Object.values(SETTINGS_CONFIG)) {
                for (const [settingName, def] of Object.entries(category.settings)) {
                    if (settingName === key) {
                        settingDef = def;
                        break;
                    }
                    if (def.childSettings && def.childSettings[key]) {
                        settingDef = def.childSettings[key];
                        break;
                    }
                }
                if (settingDef) break;
            }
            
            if (!settingDef) {
                console.warn(`Sanitizing: Unknown setting '${key}' - skipping`);
                continue;
            }
            
            let sanitizedValue = value;
            
            switch (settingDef.type) {
                case 'checkbox':
                    if (value !== true && value !== false && value !== null) {
                        console.warn(`Sanitizing: Invalid boolean value for '${key}' - setting to default`);
                        sanitizedValue = settingDef.default ?? false;
                    }
                    break;
                    
                case 'number':
                    if (typeof value !== 'number' || isNaN(value)) {
                        console.warn(`Sanitizing: Invalid number value for '${key}' - setting to default`);
                        sanitizedValue = settingDef.default ?? 0;
                    } else {
                        if (settingDef.min !== undefined && value < settingDef.min) {
                            sanitizedValue = settingDef.min;
                        }
                        if (settingDef.max !== undefined && value > settingDef.max) {
                            sanitizedValue = settingDef.max;
                        }
                    }
                    break;
                    
                case 'text':
                case 'select':
                    if (value === null) {
                        sanitizedValue = null;
                    } else if (typeof value !== 'string') {
                        console.warn(`Sanitizing: Invalid string value for '${key}' - setting to default`);
                        sanitizedValue = settingDef.default ?? '';
                    } else {
                        sanitizedValue = sanitizeString(value);
                        
                        if (settingDef.type === 'select' && settingDef.options && Array.isArray(settingDef.options)) {
                            const validValues = settingDef.options.map(opt => 
                                typeof opt === 'object' ? opt.value : opt
                            );
                            if (!validValues.includes(sanitizedValue)) {
                                console.warn(`Sanitizing: Invalid select value '${sanitizedValue}' for '${key}' - setting to default`);
                                sanitizedValue = settingDef.default ?? validValues[0];
                            }
                        }
                    }
                    break;
                    
                case 'file':
                    if (value === null) {
                        sanitizedValue = null;
                    } else if (typeof value !== 'string' || !value.startsWith('data:image/')) {
                        console.warn(`Sanitizing: Invalid image data for '${key}' - clearing`);
                        sanitizedValue = null;
                    }
                    break;
                    
                default:
                    sanitizedValue = sanitizeObject(value);
            }
            
            sanitized[key] = sanitizedValue;
        }
    } else {
        for (const [key, value] of Object.entries(settings)) {
            sanitized[key] = sanitizeObject(value);
        }
    }
    
    delete sanitized.__proto__;
    delete sanitized.constructor;
    delete sanitized.prototype;
    
    return sanitized;
}


export function sanitizeApiResponse(data) {
    if (data === null || data === undefined) {
        return data;
    }
    
    if (typeof data === 'object' && !Array.isArray(data)) {
        const technicalFields = ['status', 'statusText', 'ok', 'redirected', 'type', 'url'];
        const sanitized = {};
        
        for (const [key, value] of Object.entries(data)) {
            if (technicalFields.includes(key)) {
                sanitized[key] = value;
            } else {
                sanitized[key] = sanitizeObject(value);
            }
        }
        
        return sanitized;
    }
    
    return sanitizeObject(data);
}


export function validateSettingValue(value, constraints = {}) {
    if (constraints.type) {
        if (typeof value !== constraints.type) {
            return false;
        }
    }
    
    if (typeof value === 'number') {
        if (constraints.min !== undefined && value < constraints.min) {
            return false;
        }
        if (constraints.max !== undefined && value > constraints.max) {
            return false;
        }
        if (isNaN(value) || !isFinite(value)) {
            return false;
        }
    }
    
    if (typeof value === 'string') {
        if (constraints.maxLength && value.length > constraints.maxLength) {
            return false;
        }
        if (constraints.pattern && !constraints.pattern.test(value)) {
            return false;
        }
    }
    
    if (Array.isArray(value)) {
        if (constraints.maxItems && value.length > constraints.maxItems) {
            return false;
        }
    }
    
    return true;
}
