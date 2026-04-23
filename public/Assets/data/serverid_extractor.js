window.addEventListener('rovalra-extract-serverid-request', function (event) {
    const { extractionId } = event.detail;

    try {
        const element = document.querySelector(
            `[data-rovalra-extraction-id="${extractionId}"]`,
        );
        if (!element) return;

        const reactKey = Object.keys(element).find((k) =>
            k.startsWith('__reactFiber$'),
        );
        if (!reactKey) throw new Error('No React Fiber');

        const fiber = element[reactKey];
        const memoizedProps = fiber?.return?.memoizedProps;
        const accessCode = memoizedProps?.accessCode;

        let serverId = null;
        if (!accessCode) {
            let rawKey = fiber?.return?.key;
            if (!rawKey) rawKey = fiber?.key;
            if (!rawKey) {
                rawKey = memoizedProps?.id || memoizedProps?.server?.id;
            }

            if (rawKey && typeof rawKey === 'string') {
                const candidate = rawKey.startsWith('.')
                    ? rawKey.slice(1)
                    : rawKey;
                const uuidRegex =
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                if (uuidRegex.test(candidate)) {
                    serverId = candidate;
                }
            }
        }

        let isFriendServer = false;
        const thumbnailTargetId = memoizedProps?.thumbnailTargetId;
        if (typeof thumbnailTargetId === 'number' && thumbnailTargetId > 0) {
            isFriendServer = true;
        }

        window.dispatchEvent(
            new CustomEvent('rovalra-serverid-extracted', {
                detail: {
                    extractionId,
                    serverId,
                    accessCode,
                    isFriendServer,
                },
            }),
        );
    } catch (e) {
        console.error('Extraction failed:', e);
        window.dispatchEvent(
            new CustomEvent('rovalra-serverid-extracted', {
                detail: { extractionId, serverId: null, error: e.message },
            }),
        );
    }
});
