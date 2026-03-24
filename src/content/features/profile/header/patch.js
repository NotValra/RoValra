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
                                buf instanceof Float32Array
                                    ? buf
                                    : new Float32Array(buf),
                            ),
                            data[1] instanceof Float32Array
                                ? data[1]
                                : new Float32Array(data[1]),
                            data[2] instanceof Float32Array
                                ? data[2]
                                : new Float32Array(data[2]),
                            data[3] instanceof Float32Array
                                ? data[3]
                                : new Float32Array(data[3]),
                        ];

                        chrome.runtime.sendMessage(
                            {
                                type: 'OFFLOAD_RBF_MATH',
                                data: sanitizedData,
                            },
                            (response) => {
                                if (this.onmessage && response) {
                                    const resultFloatArray =
                                        response instanceof Float32Array
                                            ? response
                                            : new Float32Array(
                                                  Object.values(response),
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
