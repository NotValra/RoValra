const min = (a, b) => a > b ? b : a;

export default class Version {
    /**
     * @param {string} version 
     */
    constructor(version) {
        try {
            this.versions = version.split(".").map((v) => Number(v));
        } catch (e) {
            console.error(`(RoValra) Failed to construct Version due to error: `, e);
        }
    }

    /**
     * @param {Version} other 
     * @returns {number} 0 if false, 1 if equal, 2 if greater
     */
    greater_than(other) {
        for (let i = 0; i < min(this.versions.length, other.versions.length); i++) {
            if (this.versions[i] > other.versions[i])
                return 2;
            else if (this.versions[i] < other.versions[i])
                return 0;
        }

        if (this.versions.length < other.versions.length)
            return 0;
        else if (this.versions.length > other.versions.length)
            return 2;

        return 1;
    }

    get major() { return this.versions[0]; }
    set major(value) { this.versions[0] = value; }
    get minor() { return this.versions[1]; }
    set minor(value) { this.versions[1] = value; }
    get patch() { return this.versions[2]; }
    set patch(value) { this.versions[2] = value; }
}

export function getVersion() {
    return new Version(chrome.runtime.getManifest().version);
}
