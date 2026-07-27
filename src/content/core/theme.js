const THEME_VARIABLES = {
    content: 'var(--rovalra-theme-content)',
    text: 'var(--rovalra-theme-text)',
    header: 'var(--rovalra-theme-header)',
    sliderOn: 'var(--rovalra-theme-sliderOn)',
    sliderOff: 'var(--rovalra-theme-sliderOff)',
    sliderButton: 'var(--rovalra-theme-sliderButton)',
    buttonText: 'var(--rovalra-theme-buttonText)',
    buttonBg: 'var(--rovalra-theme-buttonBg)',
    buttonHover: 'var(--rovalra-theme-buttonHover)',
    buttonActive: 'var(--rovalra-theme-buttonActive)',
    buttonBorder: 'var(--rovalra-theme-buttonBorder)',
    discordLink: 'var(--rovalra-theme-discordLink)',
    githubLink: 'var(--rovalra-theme-githubLink)',
    robloxLink: 'var(--rovalra-theme-robloxLink)',
};

export const THEME_CONFIG = {
    light: THEME_VARIABLES,
    dark: THEME_VARIABLES,
};

export function getCurrentTheme() {
    return document.body?.classList.contains('dark-theme') ? 'dark' : 'light';
}

export function isDarkMode() {
    return getCurrentTheme() === 'dark';
}

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
