// This script technically isn't in use anymore but is kept cuz it might be useful in the future

const DEBUG_MODE = false;
const HUE_TOLERANCE = 75; 
const SATURATION_THRESHOLD = 0.05; 

function log(msg, ...args) {
    if (DEBUG_MODE) console.log(`%c[ColorLogic] ${msg}`, 'color: #00ffff', ...args);
}


function hexToHsl(hex) {
    if (!hex || typeof hex !== 'string') return { h:0, s:0, l:0, valid: false };
    
    hex = hex.replace('#', '').trim();
    
    if (hex.length === 3) {
        hex = hex[0]+hex[0] + hex[1]+hex[1] + hex[2]+hex[2];
    }
    
    if (hex.length !== 6) return { h:0, s:0, l:0, valid: false };

    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; 
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return { h: h * 360, s: s, l: l, valid: true };
}


const quantize = (pixels, maxColors) => {
    const pixelArray = [];
    for (let i = 0; i < pixels.length; i += 16) { 
        const r = pixels[i], g = pixels[i+1], b = pixels[i+2], a = pixels[i+3];
        if (a > 200) { 
            pixelArray.push({ r, g, b });
        }
    }

    if (pixelArray.length === 0) return [];

    const buckets = [pixelArray];

    
    let rT=0, gT=0, bT=0, count=0;
    for(let p of pixelArray) {
        if (p.r > 240 && p.g > 240 && p.b > 240) continue;
        rT+=p.r; gT+=p.g; bT+=p.b;
        count++;
    }
    
    if (count === 0) {
        return [{ hex: "#ffffff" }];
    }

    const avgR = Math.round(rT/count);
    const avgG = Math.round(gT/count);
    const avgB = Math.round(bT/count);
    
    const hex = `#${avgR.toString(16).padStart(2,'0')}${avgG.toString(16).padStart(2,'0')}${avgB.toString(16).padStart(2,'0')}`;
    return [{ hex: hex }];
};

export function getDominantColors(imageData, imageUrl) {
    try {
        const p = quantize(imageData.data, 1);
        const hex = p[0] ? p[0].hex : null;
        return { primary: hex, secondary: null, palette: [hex] };
    } catch (e) {
        return { primary: null, secondary: null, palette: [] };
    }
}


function calculateMatch(itemHex, targetHex) {
    const item = hexToHsl(itemHex);
    const target = hexToHsl(targetHex);

    if (!item.valid || !target.valid) {
        log(`Invalid Color Data. Item:${itemHex} Target:${targetHex}`);
        return false;
    }

    
    if (target.s < 0.15) {
        const diffL = Math.abs(item.l - target.l);
        const isItemLowSat = item.s < 0.35; 
        
        const match = isItemLowSat && diffL < 0.45;
        
        log(`[Compare-Grey] Item(${itemHex}) vs Target(${targetHex}) | Diff L: ${diffL.toFixed(2)} | Match? ${match}`);
        return match;
    }

    
    let diffH = Math.abs(item.h - target.h);
    if (diffH > 180) diffH = 360 - diffH;

    const matchHue = diffH <= HUE_TOLERANCE;
    const hasColor = item.s > SATURATION_THRESHOLD; 

    const match = matchHue && hasColor;

    const h1 = Math.round(item.h), s1 = item.s.toFixed(2);
    const h2 = Math.round(target.h);
    
    log(`[Compare-Color] Item(${itemHex} H:${h1} S:${s1}) vs Target(${targetHex} H:${h2})`);
    log(`... Hue Diff: ${Math.round(diffH)} (Limit ${HUE_TOLERANCE}) | HasColor? ${hasColor} | >> MATCH: ${match}`);

    return match;
}


export function checkColorMatch(itemColors, targets) {
    if (!itemColors || !itemColors.primary) {
        return { match: false, reason: "No Data" };
    }

    for (const target of targets) {
        const val = target.value; 
        

        const isMatch = calculateMatch(itemColors.primary, val);
        
        if (!isMatch) {
            return { match: false, reason: `Failed comparison against ${val}` };
        }
    }

    return { match: true, reason: "Passed" };
}