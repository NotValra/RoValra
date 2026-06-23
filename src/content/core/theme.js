// TODO get rid of this and replace it with better things

import { observeAttributes } from './observer.js';
let cachedTheme = null;

export const getCurrentTheme = () => cachedTheme || 'light';

export const THEME_CONFIG = {
    light: {
        content:        "var(--rovalra-theme-content)",   
        text:           "var(--rovalra-theme-text)",  
        header:         "var(--rovalra-theme-header)",  
        sliderOn:       "var(--rovalra-theme-sliderOn)",
        sliderOff:      "var(--rovalra-theme-sliderOff)",  
        sliderButton:   "var(--rovalra-theme-sliderButton)",  
        buttonText:     "var(--rovalra-theme-buttonText)",    
        buttonBg:       "var(--rovalra-theme-buttonBg)",  
        buttonHover:    "var(--rovalra-theme-buttonHover)",   
        buttonActive:   "var(--rovalra-theme-buttonActive)",  
        buttonBorder:   "var(--rovalra-theme-buttonBorder)",     
        discordLink:    "var(--rovalra-theme-discordLink)",  
        githubLink:     "var(--rovalra-theme-githubLink)",
        robloxLink:     "var(--rovalra-theme-robloxLink)",
    },
    dark: {
        content:        "var(--rovalra-theme-content)",  
        text:           "var(--rovalra-theme-text)",  
        header:         "var(--rovalra-theme-header)",
        sliderOn:       "var(--rovalra-theme-sliderOn)",
        sliderOff:      "var(--rovalra-theme-sliderOff)",  
        sliderButton:   "var(--rovalra-theme-sliderButton)", 
        buttonText:     "var(--rovalra-theme-buttonText)",  
        buttonBg:       "var(--rovalra-theme-buttonBg)",  
        buttonHover:    "var(--rovalra-theme-buttonHover)",  
        buttonActive:   "var(--rovalra-theme-buttonActive)",  
        buttonBorder:   "var(--rovalra-theme-buttonBorder)",
        discordLink:    "var(--rovalra-theme-discordLink)", 
        githubLink:     "var(--rovalra-theme-githubLink)",
        robloxLink:     "var(--rovalra-theme-robloxLink)",
    },
    nighty: {
        content:        "var(--rovalra-theme-content)",  
        text:           "var(--rovalra-theme-text)",  
        header:         "var(--rovalra-theme-header)",
        sliderOn:       "var(--rovalra-theme-sliderOn)",
        sliderOff:      "var(--rovalra-theme-sliderOff)",  
        sliderButton:   "var(--rovalra-theme-sliderButton)", 
        buttonText:     "var(--rovalra-theme-buttonText)",  
        buttonBg:       "var(--rovalra-theme-buttonBg)",  
        buttonHover:    "var(--rovalra-theme-buttonHover)",  
        buttonActive:   "var(--rovalra-theme-buttonActive)",  
        buttonBorder:   "var(--rovalra-theme-buttonBorder)",
        discordLink:    "var(--rovalra-theme-discordLink)", 
        githubLink:     "var(--rovalra-theme-githubLink)",
        robloxLink:     "var(--rovalra-theme-robloxLink)",
    },
    sunset: {
        content:        "var(--rovalra-theme-content)",  
        text:           "var(--rovalra-theme-text)",  
        header:         "var(--rovalra-theme-header)",
        sliderOn:       "var(--rovalra-theme-sliderOn)",
        sliderOff:      "var(--rovalra-theme-sliderOff)",  
        sliderButton:   "var(--rovalra-theme-sliderButton)", 
        buttonText:     "var(--rovalra-theme-buttonText)",  
        buttonBg:       "var(--rovalra-theme-buttonBg)",  
        buttonHover:    "var(--rovalra-theme-buttonHover)",  
        buttonActive:   "var(--rovalra-theme-buttonActive)",  
        buttonBorder:   "var(--rovalra-theme-buttonBorder)",
        discordLink:    "var(--rovalra-theme-discordLink)", 
        githubLink:     "var(--rovalra-theme-githubLink)",
        robloxLink:     "var(--rovalra-theme-robloxLink)",
    },
    highcontrast: {
        content:        "var(--rovalra-theme-content)",  
        text:           "var(--rovalra-theme-text)",  
        header:         "var(--rovalra-theme-header)",
        sliderOn:       "var(--rovalra-theme-sliderOn)",
        sliderOff:      "var(--rovalra-theme-sliderOff)",  
        sliderButton:   "var(--rovalra-theme-sliderButton)", 
        buttonText:     "var(--rovalra-theme-buttonText)",  
        buttonBg:       "var(--rovalra-theme-buttonBg)",  
        buttonHover:    "var(--rovalra-theme-buttonHover)",  
        buttonActive:   "var(--rovalra-theme-buttonActive)",  
        buttonBorder:   "var(--rovalra-theme-buttonBorder)",
        discordLink:    "var(--rovalra-theme-discordLink)", 
        githubLink:     "var(--rovalra-theme-githubLink)",
        robloxLink:     "var(--rovalra-theme-robloxLink)",
    },
};

export function withErrorHandling(fn, context = '') {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            console.error(`Error in ${context}:`, error);
            return null;
        }
    };
}


export function detectTheme() {
    const cacheElement = document.getElementById('rovalra-theme-cache');
    if (cacheElement?.dataset.theme) {
        return Promise.resolve(cacheElement.dataset.theme);
    }

    return new Promise((resolve) => {
        const body = document.body;

        const checkThemeClass = (targetNode) => {
            if (targetNode.classList.contains('rovalra-custom-nighty-theme')) return 'nighty';
            if (targetNode.classList.contains('rovalra-custom-sunset-theme')) return 'sunset';
            if (targetNode.classList.contains('rovalra-custom-highcontrast-theme')) return 'highcontrast';
            if (targetNode.classList.contains('dark-theme')) return 'dark';
            if (targetNode.classList.contains('light-theme')) return 'light';
            return null;
        };

        const initialTheme = checkThemeClass(body);
        if (initialTheme) {
            cachedTheme = initialTheme;
            let cacheDiv = document.getElementById('rovalra-theme-cache');
            if (!cacheDiv) {
                cacheDiv = document.createElement('div');
                cacheDiv.id = 'rovalra-theme-cache';
                cacheDiv.style.display = 'none';
                document.body.appendChild(cacheDiv);
            }
            cacheDiv.dataset.theme = initialTheme;
            resolve(initialTheme);
            return;
        }

        const observer = observeAttributes(body, (mutation) => {
            const theme = checkThemeClass(mutation.target);
            if (theme) {
                cachedTheme = theme;
                let cacheDiv = document.getElementById('rovalra-theme-cache');
                if (!cacheDiv) {
                    cacheDiv = document.createElement('div');
                    cacheDiv.id = 'rovalra-theme-cache';
                    cacheDiv.style.display = 'none';
                    document.body.appendChild(cacheDiv);
                }
                cacheDiv.dataset.theme = theme;
                observer.disconnect();
                resolve(theme);
            }
        }, ['class']);
    });
}


export function dispatchThemeEvent(theme) {
  const themeEvent = new CustomEvent("themeDetected", {
    detail: { theme: theme },
  });
  window.dispatchEvent(themeEvent);
  document.body.classList.toggle("dark-theme", theme === "dark");
  document.body.classList.toggle("light-theme", theme === "light");
}


export const isDarkMode = () => {
    return document.body.classList.contains('dark-theme');
};