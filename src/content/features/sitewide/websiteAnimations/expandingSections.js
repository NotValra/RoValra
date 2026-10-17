import { finishExpandingSections } from '../../../core/ui/expandingSection.js';

let initialized = false;

export function initExpandingSections() {
    if (initialized) return;
    initialized = true;
    document.addEventListener('rovalra:motionChanged', finishExpandingSections);
}
