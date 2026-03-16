// used to load roavatar-renderer
const OriginalWorker = window.Worker;

window.Worker = class extends OriginalWorker {
    constructor(scriptURL, options) {
        const urlStr = scriptURL.toString();

        if (
            urlStr.includes('blob:') ||
            urlStr.includes('worker') ||
            urlStr.includes('data:')
        ) {
            return {
                onmessage: null,
                postMessage: function (message) {
                    const [id, type, data] = message;

                    if (type === 'patchRBF') {
                        const sanitizedData = [
                            data[0].map((buf) =>
                                Array.from(new Float32Array(buf)),
                            ),
                            Array.from(new Float32Array(data[1])),
                            Array.from(new Float32Array(data[2])),
                            Array.from(new Float32Array(data[3])),
                        ];

                        chrome.runtime.sendMessage(
                            {
                                type: 'OFFLOAD_RBF_MATH',
                                data: sanitizedData,
                            },
                            (response) => {
                                if (this.onmessage && response) {
                                    const resultFloatArray = new Float32Array(
                                        response,
                                    );
                                    this.onmessage({
                                        data: [id, resultFloatArray.buffer],
                                    });
                                }
                            },
                        );
                    }
                },
                terminate: () => {},
                addEventListener: function (type, fn) {
                    if (type === 'message') this.onmessage = fn;
                },
                removeEventListener: function () {},
            };
        }
        return new OriginalWorker(scriptURL, options);
    }
};
