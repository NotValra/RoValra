// TODO get rid of this and replace it with better things

import { observeAttributes } from './observer.js';
import getVariable from './utils/css/getVariable.js';
let cachedTheme = null;

export const getCurrentTheme = () => cachedTheme || 'light';

export const THEME_CONFIG = {
    light: {
        content:        "var(--rovalra-theme-content)",  //getVariable('style-test-element.light-theme', '--rovalra-theme-content'),              
        text:           "var(--rovalra-theme-text)",  //getVariable('style-test-element.light-theme', '--rovalra-theme-text'),         
        header:         "var(--rovalra-theme-header)",  //getVariable('style-test-element.light-theme', '--rovalra-theme-header'),           
        sliderOn:       "var(--rovalra-theme-sliderOn)",  //getVariable('style-test-element.light-theme', '--rovalra-theme-sliderOn'),
        sliderOff:      "var(--rovalra-theme-sliderOff)",  //getVariable('style-test-element.light-theme', '--rovalra-theme-sliderOff'),         
        sliderButton:   "var(--rovalra-theme-sliderButton)",  //getVariable('style-test-element.light-theme', '--rovalra-theme-sliderButton'),   
        buttonText:     "var(--rovalra-theme-buttonText)",  //getVariable('style-test-element.light-theme', '--rovalra-theme-buttonText'),         
        buttonBg:       "var(--rovalra-theme-buttonBg)",  //getVariable('style-test-element.light-theme', '--rovalra-theme-buttonBg'),       
        buttonHover:    "var(--rovalra-theme-buttonHover)",  //getVariable('style-test-element.light-theme', '--rovalra-theme-buttonHover'),      
        buttonActive:   "var(--rovalra-theme-buttonActive)",  //getVariable('style-test-element.light-theme', '--rovalra-theme-buttonActive'),   
        buttonBorder:   "var(--rovalra-theme-buttonBorder)",  //getVariable('style-test-element.light-theme', '--rovalra-theme-buttonBorder'),      
        discordLink:    "var(--rovalra-theme-discordLink)",  //getVariable('style-test-element.light-theme', '--rovalra-theme-discordLink'),  
        githubLink:     "var(--rovalra-theme-githubLink)",  //getVariable('style-test-element.light-theme', '--rovalra-theme-githubLink'), 
        robloxLink:     "var(--rovalra-theme-robloxLink)",  //getVariable('style-test-element.light-theme', '--rovalra-theme-robloxLink'),
    },
    dark: {
        content:        "var(--rovalra-theme-content)",  //getVariable('style-test-element.dark-theme', '--rovalra-theme-content'),                                  // 'rgb(39, 41, 48)',
        text:           "var(--rovalra-theme-text)",  //getVariable('style-test-element.dark-theme', '--rovalra-theme-text'),                               // 'rgb(213, 215, 221)',
        header:         "var(--rovalra-theme-header)",  //getVariable('style-test-element.dark-theme', '--rovalra-theme-header'),                                 // 'white',
        sliderOn:       "var(--rovalra-theme-sliderOn)",  //getVariable('style-test-element.dark-theme', '--rovalra-theme-sliderOn'),                                   // '#ddd',
        sliderOff:      "var(--rovalra-theme-sliderOff)",  //getVariable('style-test-element.dark-theme', '--rovalra-theme-sliderOff'),                                    // 'rgba(0, 0, 0, 0.1)',
        sliderButton:   "var(--rovalra-theme-sliderButton)",  //getVariable('style-test-element.dark-theme', '--rovalra-theme-sliderButton'),                                       // 'white',
        buttonText:     "var(--rovalra-theme-buttonText)",  //getVariable('style-test-element.dark-theme', '--rovalra-theme-buttonText'),                                     // 'rgba(255, 255, 255, 0.9)',
        buttonBg:       "var(--rovalra-theme-buttonBg)",  //getVariable('style-test-element.dark-theme', '--rovalra-theme-buttonBg'),                                   // 'rgb(45, 48, 51)',
        buttonHover:    "var(--rovalra-theme-buttonHover)",  //getVariable('style-test-element.dark-theme', '--rovalra-theme-buttonHover'),                                      // 'rgb(57, 60, 64)',
        buttonActive:   "var(--rovalra-theme-buttonActive)",  //getVariable('style-test-element.dark-theme', '--rovalra-theme-buttonActive'),                                       // 'rgb(69, 73, 77)',
        buttonBorder:   "var(--rovalra-theme-buttonBorder)",  //getVariable('style-test-element.dark-theme', '--rovalra-theme-buttonBorder'),                                       // '0px solid rgba(255, 255, 255, 0.1)',
        discordLink:    "var(--rovalra-theme-discordLink)",  //getVariable('style-test-element.dark-theme', '--rovalra-theme-discordLink'),                                      // '#7289da',
        githubLink:     "var(--rovalra-theme-githubLink)",  //getVariable('style-test-element.dark-theme', '--rovalra-theme-githubLink'),                                     // '#2dba4e',
        robloxLink:     "var(--rovalra-theme-robloxLink)",  //getVariable('style-test-element.dark-theme', '--rovalra-theme-robloxLink'),                                     // '#c13ad9'
    }
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