// TODO get rid of this and replace it with better things

let cachedTheme = null;


export const getCurrentTheme = () => cachedTheme || 'light';

export const THEME_CONFIG = {
    light: {
        content: 'rgb(247, 247, 248)',
        text: 'rgb(73, 77, 90)',
        header: 'rgb(32, 34, 39)',
        sliderOn: '#444',
        sliderOff: 'rgba(0, 0, 0, 0.1)',
        sliderButton: '#24292e',
        buttonText: 'rgb(57, 59, 61)',
        buttonBg: 'rgb(242, 244, 245)',
        buttonHover: 'rgb(224, 226, 227)',
        buttonActive: 'rgb(210, 212, 213)',
        buttonBorder: '0 solid rgba(0, 0, 0, 0.1)',
        discordLink: '#3479b7',
        githubLink: '#1e722a',
        robloxLink: '#c13ad9'
    },
    dark: {
        content: 'rgb(39, 41, 48)',
        text: 'rgb(213, 215, 221)',
        header: 'white',
        sliderOn: '#ddd',
        sliderOff: 'rgba(0, 0, 0, 0.1)',
        sliderButton: 'white',
        buttonText: 'rgba(255, 255, 255, 0.9)',
        buttonBg: 'rgb(45, 48, 51)',
        buttonHover: 'rgb(57, 60, 64)',
        buttonActive: 'rgb(69, 73, 77)',
        buttonBorder: '0px solid rgba(255, 255, 255, 0.1)',
        discordLink: '#7289da',
        githubLink: '#2dba4e',
        robloxLink: '#c13ad9'
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

        const themeObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
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
                        themeObserver.disconnect();
                        resolve(theme);
                        return;
                    }
                }
            }
        });

        themeObserver.observe(body, { attributes: true });
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