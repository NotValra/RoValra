import { settings } from '../../core/settings/getSettings.js';
import { initListReveals } from './websiteAnimations/listReveals.js';
import { initTabIndicator } from './websiteAnimations/tabIndicator.js';
import { initExpandingSections } from './websiteAnimations/expandingSections.js';
import { initCarouselFades } from './websiteAnimations/carouselFades.js';

const SETTING_NAME = 'websiteAnimationsEnabled';
const STYLE_SETTING = 'websiteAnimationsStyle';
const SIDEBAR_ATTRIBUTE = 'data-rovalra-animate-sidebar';
const ANIMATIONS = {
    websiteAnimationsSidebar: SIDEBAR_ATTRIBUTE,
    websiteAnimationsCards: 'data-rovalra-animate-cards',
    websiteAnimationsButtons: 'data-rovalra-animate-buttons',
    websiteAnimationsNavigation: 'data-rovalra-animate-navigation',
    websiteAnimationsMenus: 'data-rovalra-animate-menus',
    websiteAnimationsForms: 'data-rovalra-animate-forms',
    websiteAnimationsPanels: 'data-rovalra-animate-panels',
};
let initialized = false;
let settingsVersion = 0;
let resizeQueued = false;

function finishSidebarSlide() {
    // Removing a transition duration does not stop a slide already in progress.
    document
        .querySelectorAll(
            ':is(.left-nav, main.container-main)[data-rovalra-sidebar-collapse-ready="true"][data-rovalra-sidebar-layout-active="true"]',
        )
        .forEach((element) => {
            element.getAnimations().forEach((animation) => {
                if (
                    ['width', 'margin-left'].includes(
                        animation.transitionProperty,
                    )
                ) {
                    animation.cancel();
                }
            });
        });
}

async function updateSettings() {
    const version = ++settingsVersion;
    const names = Object.keys(ANIMATIONS);
    const [enabled, style, ...values] = await Promise.all([
        settings[SETTING_NAME],
        settings[STYLE_SETTING],
        ...names.map((name) => settings[name]),
    ]);
    if (version !== settingsVersion) return;

    if (enabled === true) {
        document.documentElement.setAttribute(
            'data-rovalra-motion-style',
            ['subtle', 'balanced', 'lively'].includes(style)
                ? style
                : 'balanced',
        );
    } else {
        document.documentElement.removeAttribute('data-rovalra-motion-style');
    }
    const sidebarWasAnimated =
        document.documentElement.hasAttribute(SIDEBAR_ATTRIBUTE);
    names.forEach((name, index) => {
        if (enabled === true && values[index] !== false) {
            document.documentElement.setAttribute(ANIMATIONS[name], 'true');
        } else {
            document.documentElement.removeAttribute(ANIMATIONS[name]);
        }
    });
    if (
        sidebarWasAnimated &&
        !document.documentElement.hasAttribute(SIDEBAR_ATTRIBUTE)
    ) {
        finishSidebarSlide();
    }
    document.dispatchEvent(new Event('rovalra:motionChanged'));
}

function isAnimationSetting(name) {
    return (
        name === SETTING_NAME ||
        name === STYLE_SETTING ||
        Object.hasOwn(ANIMATIONS, name)
    );
}

function handleSidebarTransition(event) {
    if (
        event.propertyName !== 'width' ||
        !event.target.matches(
            'main.container-main[data-rovalra-sidebar-collapse-ready="true"][data-rovalra-sidebar-layout-active="true"]',
        ) ||
        resizeQueued
    ) {
        return;
    }

    // Let Roblox measure the final page width, including when motion is disabled mid-slide.
    resizeQueued = true;
    requestAnimationFrame(() => {
        resizeQueued = false;
        window.dispatchEvent(new Event('resize'));
    });
}

export function init() {
    if (initialized) return;
    initialized = true;
    initListReveals();
    initTabIndicator();
    initExpandingSections();
    initCarouselFades();
    updateSettings();
    document.addEventListener('transitionend', handleSidebarTransition);
    document.addEventListener('transitioncancel', handleSidebarTransition);
    window
        .matchMedia('(prefers-reduced-motion: reduce)')
        .addEventListener('change', (event) => {
            if (
                event.matches &&
                document.documentElement.hasAttribute(SIDEBAR_ATTRIBUTE)
            ) {
                finishSidebarSlide();
            }
            document.dispatchEvent(new Event('rovalra:motionChanged'));
        });

    document.addEventListener('rovalra:settingSaved', (event) => {
        if (isAnimationSetting(event.detail?.name)) updateSettings();
    });
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (
            areaName === 'local' &&
            Object.keys(changes).some(isAnimationSetting)
        ) {
            updateSettings();
        }
    });
}
