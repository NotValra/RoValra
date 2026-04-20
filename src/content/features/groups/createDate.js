import { observeElement } from '../../core/observer.js';
import { getGroupIdFromUrl } from '../../core/idExtractor.js';
import { getGroupCreateTime } from '../../core/apis/groups.js';
import { createInteractiveTimestamp } from '../../core/ui/time/time.js';
import { t } from '../../core/locale/i18n.js';

export function init() {
    chrome.storage.local.get({ groupCreateDateEnabled: true }, (settings) => {
        if (!settings.groupCreateDateEnabled) return;

        observeElement(
            '.roseal-group-stats .group-created-date',
            () => {
                document.querySelector('.rovalra-group-created-date')?.remove();
            },
            { multiple: true },
        );

        observeElement(
            '.profile-header-details-owner-name',
            async (ownerNameSpan) => {
                const container = ownerNameSpan.parentElement;
                if (!container) return;

                if (
                    document.querySelector(
                        '.roseal-group-stats .group-created-date',
                    )
                ) {
                    container.dataset.rovalraCreateDateProcessed = 'true';
                    return;
                }

                if (container.dataset.rovalraCreateDateProcessed) return;

                const groupId = getGroupIdFromUrl();
                if (!groupId) return;

                container.dataset.rovalraCreateDateProcessed = 'true';

                const createTime = await getGroupCreateTime(groupId);
                if (
                    !createTime ||
                    document.querySelector(
                        '.roseal-group-stats .group-created-date',
                    )
                ) {
                    delete container.dataset.rovalraCreateDateProcessed;
                    return;
                }

                const dateWrapper = document.createElement('div');
                dateWrapper.className = 'rovalra-group-created-date';
                Object.assign(dateWrapper.style, {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginTop: '2px',
                });

                const labelSpan = document.createElement('span');
                labelSpan.className = 'text-caption-medium content-default';
                labelSpan.style.fontSize = '12px';
                labelSpan.textContent = `${await t('groups.createdLabel')}`;

                const timestamp = createInteractiveTimestamp(createTime);
                timestamp.classList.add('text-caption-medium');
                timestamp.style.fontSize = '12px';
                timestamp.style.display = 'inline-flex';

                dateWrapper.appendChild(labelSpan);
                dateWrapper.appendChild(timestamp);

                ownerNameSpan.insertAdjacentElement('afterend', dateWrapper);
            },
        );
    });
}
