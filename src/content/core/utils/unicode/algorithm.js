// Likely wont be useful cuz of filters sadly :C
export const Base3Codec = {
    alphabet: ['\u001d', '\u007f', '\u0020'],

    encode(text) {
        if (!text) return '';

        const hex = Array.from(new TextEncoder().encode(text))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
        let decimal = BigInt('0x1' + hex);

        let result = '';
        const base = BigInt(this.alphabet.length);
        while (decimal > 0n) {
            result = this.alphabet[Number(decimal % base)] + result;
            decimal = decimal / base;
        }
        return result;
    },

    decode(invisibleStr) {
        const filtered = invisibleStr
            .split('')
            .filter((c) => this.alphabet.includes(c));
        if (filtered.length === 0) return '';

        const base = BigInt(this.alphabet.length);
        let decimal = 0n;
        for (const char of filtered) {
            decimal = decimal * base + BigInt(this.alphabet.indexOf(char));
        }

        let hex = decimal.toString(16);
        hex = hex.substring(1);

        try {
            const bytes = new Uint8Array(
                hex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)),
            );
            return new TextDecoder().decode(bytes);
        } catch (e) {
            console.error('Malformed invisible data');
            return null;
        }
    },
};
