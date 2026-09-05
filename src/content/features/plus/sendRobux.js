import { callRobloxApi, callRobloxApiJson } from '../../core/api.js';
import { getUserIdFromUrl } from '../../core/idExtractor.js';
import { t } from '../../core/locale/i18n.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import * as CacheHandler from '../../core/storage/cacheHandler.js';
import {
    registerProfileContextMenuAction,
    createContextMenuButton,
} from '../../core/ui/profile/contextMenu.js';
import DOMPurify from '../../core/packages/dompurify.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { createButton } from '../../core/ui/buttons.js';
import { createSpinnerContainer } from '../../core/ui/spinner.js';
import { getUserCurrency } from '../../core/user/userCurrency.js';
import { createRobuxIcon } from '../../core/ui/robuxIcon.js';
import { getUserFullData, getUserProfileData } from '../../core/apis/users.js';
import { fetchUserThumbnailWithApiKey, getBatchThumbnails } from '../../core/thumbnail/thumbnails.js';
import { createUserCard } from '../../core/ui/profile/userCard.js';
import { observeElement, observeChildren, startObserving } from '../../core/observer.js';
import { fetchFriendsCustom, fetchFriendsOnlineStatus } from '../../core/utils/trackers/friendslist.js';
import { getUserSettings } from '../../core/donators/settingHandler.js';
import { applyDisplayNameGradientToElement } from '../profile/header/displayNameGradient.js';
import { applyBorderToContainer } from '../profile/avatarBorder.js';
import { applyGradientForUserId } from '../profile/header/profileBackground.js';
import { CUSTOM_ADDED_TAGS } from '../../core/utils/purifyCfg.js';

let keepOpenInAppProfileItem = false;
const cssClassNamePrefix = "rovalra-sendrobux";

const isAprilFools = () => {
    const d = new Date();
    return d.getMonth() === 3 && d.getDate() <= 7;
}


async function showStep1Popup(userId, robuxAmount = 0, easterEgg = false) {
    // i really didn't know how to format with all these elements but i created all of them and added
    // comments where i start to add classes and edit elements, etc.
    // so yeaaaaaaaaaaah alright coolio, enjoy really bad code!
    const minRobuxRequired = 10

    const nextBtn = createButton(await t('plus.sendRobux.popup.step1.nextBtn'), 'primary', {
        id: `${cssClassNamePrefix}-step1-nextbtn`,
        onClick: async () => {
            bodyContentContainer.dataset.rovalraSendrobuxLoading = true;
            const robuxSendAmount = Number(robuxInput.value)
            if (robuxSendAmount < minRobuxRequired || robuxSendAmount > perTransferLimit) {
                mutedTextNotice.classList.add('error');
                if (robuxSendAmount < minRobuxRequired)
                    mutedTextNotice.textContent = await t('plus.sendRobux.popup.step1.minRobux', { robuxAmount: minRobuxRequired });
                else
                    mutedTextNotice.textContent = await t('plus.sendRobux.popup.step1.maxRobux', { robuxAmount: perTransferLimit });
                bodyContentContainer.dataset.rovalraSendrobuxLoading = false;
                return;
            }
            if ((await getUserCurrency()).robux < robuxSendAmount) {
                mutedTextNotice.classList.add('error');
                mutedTextNotice.textContent = await t('plus.sendRobux.popup.step1.notEnoughRobux')
                bodyContentContainer.dataset.rovalraSendrobuxLoading = false;
                return;
            }
            overlay.close();
            showStep2Popup(userId, robuxSendAmount, easterEgg);
        }
    });

    const bodyContentContainer = document.createElement('div');
    const bodyContent = document.createElement('div');
    const robuxBalanceContainer = document.createElement('div');
    const profileContainer = document.createElement('div');
    const robuxAmountContainer = document.createElement('span');
    const robuxButtonsContainer = document.createElement('span');
    const robuxInput = document.createElement('input');
    const mutedTextNotice = document.createElement('span')
    const spinner = createSpinnerContainer({
        className: `${cssClassNamePrefix}-spinner`,
        containerClass: `${cssClassNamePrefix}-spinner-container`
    });

    // Setup spinner, body content, body content container, and create overlay
    bodyContentContainer.dataset.rovalraSendrobuxLoading = true;
    bodyContentContainer.classList.add(`${cssClassNamePrefix}-container`);
    bodyContent.classList.add(`${cssClassNamePrefix}-content`, 'step1');
    bodyContentContainer.append(spinner, bodyContent);

    const overlay = createOverlay(
        {
            title: await t(`plus.sendRobux.popup.shared.title${easterEgg || isAprilFools() ? 'Silly' : ''}`),
            bodyContent: bodyContentContainer,
            showLogo: true,
            actions: [nextBtn],
            onClose: () => { },
            overflowVisible: true,
        }
    );

    // Get transfer limits
    const transferLimits = await callRobloxApiJson({
        endpoint: '/transfer/v1/robux-transfer/user-transfer-limit',
        subdomain: 'apis',
        method: 'GET',
    })
    const perTransferLimit = transferLimits.perTransferLimit

    // Setup Robux Balance
    robuxBalanceContainer.classList.add(`${cssClassNamePrefix}-robux-container`);
    robuxBalanceContainer.append(createRobuxIcon({ size: "20px" }), " " + String((await getUserCurrency()).robux));

    // Setup User Profile
    const userThumbnailData = await fetchUserThumbnailWithApiKey(userId);
    const userFullData = await getUserFullData(userId);
    const userProfileData = (await getUserProfileData([userId])).profileDetails[0];
    const userCard = createUserCard({
        displayName: userFullData.displayName || userFullData.name,
        username: userFullData.name,
        thumbData: userThumbnailData,
        hidePresence: true,
        isVerified: userFullData.hasVerifiedBadge || false,
        isSubscribed: userProfileData.hasRobloxSubscription,
        userId,
        showUsername: false,
    });
    userCard.classList.add(`${cssClassNamePrefix}-profile`)
    const avatarEl = userCard.querySelector('.avatar.avatar-card-fullbody');
    if (avatarEl) avatarEl.classList.add(`${cssClassNamePrefix}-avatar`);
    profileContainer.classList.add(`${cssClassNamePrefix}-profile-container`);
    profileContainer.append(userCard);

    // Setup Robux Amount Input
    robuxInput.type = "text";
    robuxInput.inputMode = "numeric";
    robuxInput.pattern = "\\d*";
    robuxInput.placeholder = "0";
    robuxInput.maxLength = "10";
    robuxInput.name = await t('plus.sendRobux.popup.step1.robuxInputName');
    robuxInput.value = Number(robuxAmount) > 0 && !Number.isNaN(robuxAmount) ? String(robuxAmount) : '';
    robuxAmountContainer.classList.add(`${cssClassNamePrefix}-robuxamount-container`);
    robuxAmountContainer.append(createRobuxIcon({ size: "55px" }), robuxInput);
    robuxInput.oninput = async (ev) => {
        ev.target.value = ev.target.value.replace(/[^0-9]/g, '');
        mutedTextNotice.textContent = await t('plus.sendRobux.popup.step1.mutedNotice');
        mutedTextNotice.classList.remove('error')
        for (const quickSelectNum in quickSelectOptionMap) {
            const quickSelect = quickSelectOptionMap[quickSelectNum];
            if (ev.target.value == quickSelectNum)
                quickSelect.classList.add("selected");
            else
                quickSelect.classList.remove("selected");
        }
    }

    // Setup Quick Buttons
    const quickSelectOptions = [25, 50, 100, 200];
    let quickSelectOptionMap = {}
    robuxButtonsContainer.classList.add(`${cssClassNamePrefix}-quick-btns`);
    for (const aButtonAmount of quickSelectOptions) {
        const buttonAmount = aButtonAmount;
        const robuxQuickButton = document.createElement('button');
        const quickBtnRobuxIcon = createRobuxIcon();

        robuxQuickButton.classList.add(`${cssClassNamePrefix}-quick-btn`);
        robuxQuickButton.dataset.rovalraSendrobuxQuickamount = buttonAmount;
        robuxQuickButton.onclick = (ev) => { robuxInput.value = buttonAmount; robuxInput.dispatchEvent(new Event('input')); };

        robuxQuickButton.append(quickBtnRobuxIcon, " " + String(buttonAmount));
        quickSelectOptionMap[String(buttonAmount)] = robuxQuickButton;
        robuxButtonsContainer.appendChild(robuxQuickButton);

    }

    // Setup muted text
    mutedTextNotice.classList.add(`${cssClassNamePrefix}-mutednotice`);
    mutedTextNotice.textContent = await t('plus.sendRobux.popup.step1.mutedNotice');



    // add everything to body content
    robuxInput.dispatchEvent(new Event('input'));
    bodyContent.append(
        robuxBalanceContainer,
        profileContainer,
        robuxAmountContainer,
        robuxButtonsContainer,
        mutedTextNotice
    );
    bodyContentContainer.dataset.rovalraSendrobuxLoading = false;
}

async function showStep2Popup(userId, robuxAmount, easterEgg = false, error = null) {

    const sendBtn = createButton(await t('plus.sendRobux.popup.step2.sendBtn'), 'primary', {
        id: `${cssClassNamePrefix}-step2-sendbtn`,
        onClick: async () => {
            bodyContentContainer.dataset.rovalraSendrobuxLoading = true;
            const processTransferReq = await callRobloxApi({
                endpoint: '/transfer/v1/robux-transfer/process-transfer/' + initTransferRequest.transferRequestId,
                subdomain: 'apis',
                method: 'POST',
                body: {
                    robuxAmount,
                },
            });
            const processTransferJson = await processTransferReq.json();
            if (!processTransferReq.ok && ((processTransferJson.ampRecourseActions && !processTransferJson.ampRecourseActions.includes("ParentConsentRecourse")) || !processTransferJson.ampRecourseActions)) {
                mutedTextNotice.textContent = processTransferJson && (processTransferJson.failureReason || processTransferJson.errorMessage)
                    ? `${String(processTransferJson.failureReason ?? 'UNK#')}: ${processTransferJson.errorMessage ?? await t('plus.sendRobux.popup.step2.transferErrorNoMessage')}`
                    : await t('plus.sendRobux.popup.step2.transferErrorGeneric') + " HTTP Status Code " + processTransferReq.status;
                mutedTextNotice.classList.add('error');
                bodyContentContainer.dataset.rovalraSendrobuxLoading = false;
                return;
            }
            if (processTransferJson.ampRecourseActions && processTransferJson.ampRecourseActions.includes("ParentConsentRecourse")) {
                overlay.close();
                sendParentPermission(userId, robuxAmount, initTransferRequest.transferRequestId, easterEgg)
                return;
            }
            overlay.close();
            const successOverlay = createOverlay({
                title: await t(`plus.sendRobux.popup.shared.title${easterEgg || isAprilFools() ? 'Silly' : ''}`),
                bodyContent: await t(`plus.sendRobux.popup.step2.transferSuccessBody${easterEgg || isAprilFools() ? 'Silly' : ''}`),
                actions: [
                    createButton(await t(`plus.sendRobux.popup.${easterEgg || isAprilFools() ? 'step2.transferSuccessOkBtnSilly' : 'shared.okBtn'}`), "primary", {
                        onClick: () => {
                            successOverlay.close();
                        }
                    })
                ],
                showLogo: true,
            });
        }
    });
    const editBtn = createButton(await t('plus.sendRobux.popup.step2.editBtn'), 'secondary', {
        id: `${cssClassNamePrefix}-step2-editbtn`,
        onClick: async () => {
            overlay.close();
            showStep1Popup(userId, robuxAmount, easterEgg)
        }
    });

    const bodyContentContainer = document.createElement('div');
    const bodyContent = document.createElement('div');
    const robuxBalanceContainer = document.createElement('div');
    const profileContainer = document.createElement('div');
    const infoContainer = document.createElement('span');
    const robuxAmountContainer = document.createElement('span');
    const mutedTextNotice = document.createElement('span');
    const spinner = createSpinnerContainer({
        className: `${cssClassNamePrefix}-spinner`,
        containerClass: `${cssClassNamePrefix}-spinner-container`
    });

    // Setup spinner, body content, body content container, and create overlay
    bodyContentContainer.dataset.rovalraSendrobuxLoading = true;
    bodyContentContainer.classList.add(`${cssClassNamePrefix}-container`);
    bodyContent.classList.add(`${cssClassNamePrefix}-content`, 'step2');
    bodyContentContainer.append(spinner, bodyContent);

    const overlay = createOverlay(
        {
            title: await t(`plus.sendRobux.popup.shared.title${easterEgg || isAprilFools() ? 'Silly' : ''}`),
            bodyContent: bodyContentContainer,
            showLogo: true,
            actions: [editBtn, sendBtn],
            onClose: () => { },
            overflowVisible: true,
            preventBackdropClose: true,
        }
    );
    const initTransferRequest = await callRobloxApiJson({
        endpoint: '/transfer/v1/robux-transfer/initiate-transfer',
        subdomain: 'apis',
        method: 'POST',
        body: {
            "transferOrigin": 1,
            "recipientId": userId
        },
    });

    // Setup Robux Balance
    robuxBalanceContainer.classList.add(`${cssClassNamePrefix}-robux-container`);
    robuxBalanceContainer.append(createRobuxIcon({ size: "20px" }), " " + String((await getUserCurrency()).robux));

    // Setup User Profile and info about relationship to user
    const userThumbnailData = await fetchUserThumbnailWithApiKey(userId);
    const userFullData = await getUserFullData(userId);
    const userProfileData = (await getUserProfileData([userId])).profileDetails[0];
    const userCard = createUserCard({
        displayName: userFullData.displayName,
        username: `@${userFullData.name}`,
        thumbData: userThumbnailData,
        hidePresence: true,
        isVerified: userFullData.hasVerifiedBadge || false,
        isSubscribed: userProfileData.hasRobloxSubscription,
        userId,
        showUsername: true,
    });

    const avatarEl = userCard.querySelector('.avatar.avatar-card-fullbody');
    if (avatarEl) avatarEl.classList.add(`${cssClassNamePrefix}-avatar`);

    userCard.classList.add(`${cssClassNamePrefix}-profile`)
    profileContainer.classList.add(`${cssClassNamePrefix}-profile-container`);
    infoContainer.classList.add(`${cssClassNamePrefix}-profile-info`);

    if (initTransferRequest.userRelationshipDetail.areFriends) {
        const friendedDate = Date.now() - new Date(`${initTransferRequest.userRelationshipDetail.friendSinceDate.month}-${initTransferRequest.userRelationshipDetail.friendSinceDate.day}-${initTransferRequest.userRelationshipDetail.friendSinceDate.year}`).valueOf();
        let days = Math.floor(friendedDate / 1000 / 60 / 60 / 24);
        let months = Math.floor(days / 30);
        let years = Math.floor(months / 365);
        let time = years != 0 ? years
            : months != 0 ? months
                : days
        let timeUnit = years != 0 ? 'year'
            : months != 0 ? 'month'
                : 'day'

        infoContainer.innerHTML += `<span><icon filled>calendar</icon>${await t('plus.sendRobux.popup.step2.userInfoFriendTime', { time: -time, range: timeUnit })}</span>`
    }
    infoContainer.innerHTML +=
        `<span><icon filled>two-people</icon>${await t('plus.sendRobux.popup.step2.userInfoMutualFriends', { count: initTransferRequest.userRelationshipDetail.mutualFriendsCount })}</span>`
        + `<span><icon filled>circle-i</icon>${await t('plus.sendRobux.popup.step2.userInfoJoin', { year: initTransferRequest.userRelationshipDetail.userAccountSinceYear })}</span>`

    profileContainer.append(userCard, infoContainer);

    // Setup Robux Amount Input
    robuxAmountContainer.classList.add(`${cssClassNamePrefix}-robuxamount-container`);
    robuxAmountContainer.append(createRobuxIcon({ size: "55px" }), " " + String(robuxAmount));

    // Setup muted text
    mutedTextNotice.classList.add(`${cssClassNamePrefix}-mutednotice`);
    mutedTextNotice.textContent = await t('plus.sendRobux.popup.step2.mutedNotice');

    if (error != null && error != '') {
        mutedTextNotice.textContent = error == true ? await t('plus.sendRobux.popup.step2.paramPassedError') : error;
        mutedTextNotice.classList.add('error')
    }


    // add everything to body content
    bodyContent.append(
        robuxBalanceContainer,
        profileContainer,
        robuxAmountContainer,
        mutedTextNotice
    );
    bodyContentContainer.dataset.rovalraSendrobuxLoading = false;
}

async function sendParentPermission(userId, robuxAmount, transferRequestId, easterEgg = false) {
    const askBtn = createButton(await t('plus.sendRobux.popup.parentPerms.askBtn'), "primary", {
        id: `${cssClassNamePrefix}-step3-askbtn`,
        onClick: async () => {
            bodyContentContainer.dataset.rovalraSendrobuxLoading = true;
            const askPermissionRequest = await callRobloxApi({
                endpoint: '/child-requests-api/v1/send-request-to-all-parents',
                subdomain: 'apis',
                method: 'POST',
                body: {
                    requestType: 'SendTransfer',
                    requestDetails: {
                        transferType: 'Robux',
                        transferId: transferRequestId.replace("RXT-", ""),
                        robuxTransferAmount: robuxAmount,
                    }
                },
            });
            if (!askPermissionRequest.ok) {
                console.error("[RoValra Send Robux] An unknown error occured:", askPermissionRequest.status, await askPermissionRequest.text());
                overlay.close();
                showStep2Popup(userId, robuxAmount, easterEgg, await t('plus.sendRobux.popup.parentPerms.errorSending'));
                return;
            }
            overlay.close();
            const successfulAsk = createOverlay({
                title: await t(`plus.sendRobux.popup.parentPerms.successfulAskTitle${easterEgg || isAprilFools() ? 'Silly' : ''}`),
                bodyContent: await t('plus.sendRobux.popup.parentPerms.successfulAskBody'),
                showLogo: true,
                actions: [
                    createButton(await t(`plus.sendRobux.popup.${easterEgg || isAprilFools() ? 'parentPerms.successfulAskOkBtnSilly' : 'shared.okBtn'}`), 'secondary', {
                        onClick: () => { successfulAsk.close(); }
                    })
                ],
                onClose: () => { },
                overflowVisible: true,
                preventBackdropClose: true,
            });

        }
    });
    const bodyContentContainer = document.createElement('div');
    const bodyContent = document.createElement('div');
    const spinner = createSpinnerContainer({
        className: `${cssClassNamePrefix}-spinner`,
        containerClass: `${cssClassNamePrefix}-spinner-container`
    });

    // Setup spinner, body content, body content container, and create overlay
    bodyContentContainer.dataset.rovalraSendrobuxLoading = true;
    bodyContentContainer.classList.add(`${cssClassNamePrefix}-container`);
    bodyContent.classList.add(`${cssClassNamePrefix}-content`, 'step3');
    bodyContent.textContent = await t('plus.sendRobux.popup.parentPerms.sendRobuxBody');
    bodyContentContainer.append(spinner, bodyContent);

    const overlay = createOverlay(
        {
            title: await t(`plus.sendRobux.popup.parentPerms.askTitle${easterEgg || isAprilFools() ? 'Silly' : ''}`),
            bodyContent: bodyContentContainer,
            showLogo: true,
            actions: [askBtn],
            onClose: () => { },
            overflowVisible: true,
            preventBackdropClose: true,
        }
    );

    bodyContentContainer.dataset.rovalraSendrobuxLoading = false;

}

async function sendParentPermissionRecieve(transferRequestId, easterEgg = false) {
    const askBtn = createButton(await t('plus.sendRobux.popup.parentPerms.askBtn'), "primary", {
        id: `${cssClassNamePrefix}-stepreceive-askbtn`,
        onClick: async () => {
            bodyContentContainer.dataset.rovalraSendrobuxLoading = true;
            const askPermissionRequest = await callRobloxApi({
                endpoint: '/child-requests-api/v1/send-request-to-all-parents',
                subdomain: 'apis',
                method: 'POST',
                body: {
                    requestType: 'ReceiveTransfer',
                    requestDetails: {
                        transferType: 'Robux',
                        transferId: transferRequestId.replace("RXT-", ""),
                    }
                },
            });
            const askPermText = await askPermissionRequest.text();
            if (!askPermissionRequest.ok) {
                console.error("[RoValra Recieve Robux] An unknown error occured:", askPermissionRequest.status, askPermText);
                overlay.close();
                const errorAsk = createOverlay({
                    title: await t('plus.sendRobux.popup.parentPerms.errorReceivingTitle'),
                    bodyContent: await t('plus.sendRobux.popup.parentPerms.errorReceivingBody'),
                    showLogo: true,
                    actions: [createButton(await t(`plus.sendRobux.popup.${easterEgg || isAprilFools() ? 'parentPerms.errorReceivingOkBtnSilly' : 'shared.okBtn'}`), "secondary", {
                        onClick: () => { errorAsk.close(); }
                    })],
                    onClose: () => { },
                    overflowVisible: true,
                    preventBackdropClose: true,
                });
                return;
            }
            overlay.close();
            const successfulAsk = createOverlay({
                title: await t(`plus.sendRobux.popup.parentPerms.successfulAskTitle${easterEgg || isAprilFools() ? 'Silly' : ''}`),
                bodyContent: await t('plus.sendRobux.popup.parentPerms.successfulAskBody'),
                showLogo: true,
                actions: [createButton(await t(`plus.sendRobux.popup.${easterEgg || isAprilFools() ? 'parentPerms.successfulAskOkBtnSilly' : 'shared.okBtn'}`), 'secondary', {
                    onClick: () => { successfulAsk.close(); }
                })],
                onClose: () => { },
                overflowVisible: true,
                preventBackdropClose: true,
            });

        }
    });
    const bodyContentContainer = document.createElement('div');
    const bodyContent = document.createElement('div');
    const spinner = createSpinnerContainer({
        className: `${cssClassNamePrefix}-spinner`,
        containerClass: `${cssClassNamePrefix}-spinner-container`
    });

    // Setup spinner, body content, body content container, and create overlay
    bodyContentContainer.dataset.rovalraSendrobuxLoading = true;
    bodyContentContainer.classList.add(`${cssClassNamePrefix}-container`);
    bodyContent.classList.add(`${cssClassNamePrefix}-content`, 'steprecieve');
    bodyContent.textContent = await t('plus.sendRobux.popup.parentPerms.receiveRobuxBody');;
    bodyContentContainer.append(spinner, bodyContent);

    const overlay = createOverlay(
        {
            title: await t(`plus.sendRobux.popup.parentPerms.askTitle${easterEgg || isAprilFools() ? 'Silly' : ''}`),
            bodyContent: bodyContentContainer,
            showLogo: true,
            actions: [askBtn],
            onClose: () => { },
            overflowVisible: true,
            preventBackdropClose: true,
        }
    );

    bodyContentContainer.dataset.rovalraSendrobuxLoading = false;

}

async function getSendRobuxStatus() {
    const authedUserId = await getAuthenticatedUserId();
    if (!authedUserId) return false;

    const cacheKey = `is_roblox_plus_${authedUserId}`;
    const cached = await CacheHandler.get('profile_data', cacheKey, 'session');
    if (cached !== undefined) return cached;

    const profileApiPayload = {
        profileId: authedUserId.toString(),
        profileType: 'User',
        components: [{ component: 'UserProfileHeader' }],
        includeComponentOrdering: true,
    };




    const statusPromise = (async () => {
        try {
            const profileResponse = await callRobloxApiJson({
                subdomain: 'apis',
                endpoint: '/profile-platform-api/v1/profiles/get',
                method: 'POST',
                body: profileApiPayload,
            });

            const isRobloxPlus =
                profileResponse?.components?.UserProfileHeader?.isRobloxPlus ===
                true;

            await CacheHandler.set(
                'profile_data',
                cacheKey,
                isRobloxPlus,
                'session',
            );
            return isRobloxPlus;
        } catch (err) {
            console.error(
                'RoValra: Failed to fetch currency transfer status.',
                err,
            );
            return false;
        }
    })();

    return statusPromise;
}

async function addSendRobuxButton(menu) {
    if (menu.dataset.rovalraSendRobuxBtnAdded) {
        return;
    }
    menu.dataset.rovalraSendRobuxBtnAdded = 'true';

    const authedUserId = await getAuthenticatedUserId();
    const userId = getUserIdFromUrl();
    if (!userId || String(userId) === String(authedUserId)) return;

    const canTransfer = await getSendRobuxStatus();
    //if (!canTransfer) return;

    const { button } = createContextMenuButton(
        await t('plus.sendRobux.profile.button', {
            defaultValue: 'Send Robux',
        }),
    );

    button.addEventListener('click', async () => {
        if (canTransfer) {
            showStep1Popup(userId, null, window.event?.shiftKey || false)
        } else {
            const easterEgg = isAprilFools() || window.event?.shiftKey || false
            const getPlusOverlay = createOverlay({
                title: await t(`plus.sendRobux.popup.shared.title${easterEgg ? 'Silly' : '' }`),
                bodyContent: await t(`plus.sendRobux.popup.plusNeeded.body${easterEgg ? 'Silly' : '' }`),
                showLogo: true,
                actions: [
                    createButton(await t(`plus.sendRobux.popup.plusNeeded.buyPlusBtn${easterEgg ? 'Silly' : '' }`), 'secondary', {
                        onClick: () => {
                            getPlusOverlay.close();
                            window.open("/plus", "_blank");
                        }
                    }),
                    createButton(await t(`plus.sendRobux.popup.${easterEgg ? 'plusNeeded.okBtnSilly' : 'shared.okBtn' }`), 'primary', {
                        onClick: () => {
                            getPlusOverlay.close();
                        }
                    }),
                ],
            });
        }

    });

    const container = menu.querySelector('[role="group"]') || menu;
    const menuItems = container.querySelectorAll('[role="menuitem"]');

    if (menuItems.length > 0) {
        menuItems[0].insertAdjacentElement('afterend', button);
    } else {
        container.appendChild(button);
    }

    for (const element of menuItems) {
        const titleContainer = element.querySelector('.grow-1');
        const title = titleContainer.querySelector('.foundation-web-menu-item-title');
        if (title.textContent.toLowerCase().includes("robux")) {
            if (keepOpenInAppProfileItem == true) {
                const openInAppText = DOMPurify.sanitize(
                    await t(
                        'plus.sendRobux.profile.openInApp',
                        { defaultValue: 'Open In App' }
                    )
                );
                title.textContent += ` (${openInAppText})`;
            } else {
                element.remove();
            }
        }
    }
}

export function initProfileButton() {
    chrome.storage.local.get({ sendRobuxEnabled: true, keepRobuxAppButtonEnabled: false, }, (settings) => {
        if (!settings.sendRobuxEnabled) return;
        keepOpenInAppProfileItem = settings.keepRobuxAppButtonEnabled;

        registerProfileContextMenuAction(addSendRobuxButton, () => {
            getSendRobuxStatus();
        });
    });
}

export function initNotificationCenter() {
    chrome.storage.local.get({ sendRobuxEnabled: true }, (settings) => {
        if (!settings.sendRobuxEnabled) return;

        observeElement('.sendr-notification-container.ng-scope', (element) => {
            const notificationData = JSON.parse(element.getAttribute('notification-data'));

            if (notificationData.content.notificationType != 'RobuxTransferReceived' || !notificationData.content.states.default.visualItems.button[1].actions[0].path.startsWith('roblox://navigation/currency_transfer'))
                return;

            const childrenObserver = observeChildren(element, (child) => {
                try {
                    var oldEl = element.querySelector('.notif-row-right-button');
                    var newEl = oldEl.cloneNode(true);

                    newEl.addEventListener('click', (ev) => {
                        ev.preventDefault()
                        sendParentPermissionRecieve(
                            notificationData.content.states.default.visualItems.button[1].actions[0].path.split('RXT-')[1],
                            window.event?.shiftKey || false
                        );
                    });
                    oldEl.parentNode.replaceChild(newEl, oldEl);
                    childrenObserver.disconnect();
                } catch { }
            })

        }, { multiple: true, });
    });
}

export function initBuyRobuxPage() {
    chrome.storage.local.get({
        sendRobuxEnabled: true,
        profileBackgroundGradientEnabled: true,
        displayNameGradientEnabled: true,
        avatarBorderEnabled: true
    }, (settings) => {
        if (!settings.sendRobuxEnabled) return;

        const buyRobuxPageData = JSON.parse(document.querySelector('#robux-redesign-page').dataset.buyRobuxPage);
        const robuxTransfers = buyRobuxPageData.sections.find((element) => element.sectionType == 'PAYMENTS_PRODUCT_SECTION_TYPE_TRANSFERS');

        startObserving();

        var friendsToSendRobux = null;
        var thumbnailData = null;

        // friendsRobuxCache
        async function friendsRobuxInit() {
            const userId = await getAuthenticatedUserId();
            const friendsOnline = await fetchFriendsOnlineStatus(userId);
            const usersInUserSort1Params = new URLSearchParams({
                userSort: 1
            });
            const usersInUserSort1 = await fetchFriendsCustom(userId, usersInUserSort1Params);

            const userSortIds = new Set(usersInUserSort1.PageItems.map(user => user.id));

            const addFriendsOnlineIds = friendsOnline
                .filter(e => !userSortIds.has(e.id))
                .map(e => e.id)

            if (addFriendsOnlineIds.length > 0) userSortIds.add(...addFriendsOnlineIds);

            const userSortIdsArray = [...userSortIds];


            var allUserProfiles = await getUserProfileData(userSortIdsArray);
            var thumbnails = await getBatchThumbnails(userSortIdsArray, 'AvatarHeadshot');

            for (const idIndexString in userSortIdsArray) {
                const idIndex = Number(idIndexString);
                console.log(allUserProfiles.profileDetails[idIndex]);
                allUserProfiles.profileDetails[idIndex].imageUrl = thumbnails[idIndex].imageUrl;
            }

            friendsToSendRobux = allUserProfiles;
            thumbnailData = thumbnails;
        }

        observeElement('#user-search-listbox > .flex.flex-row.items-center.gap-small.padding-small.width-full.cursor-pointer.shrink-0.bg-transparent', async (element) => {
            if (element.dataset.rovalraSendrobuxHooked) return;
            const profileUserSettings = await getUserSettings(element.id.replace('user-', ''));

            const waitForImageObserver = observeElement('img', () => {
                if (!element.isConnected) return;
                var newEl = element.cloneNode(true);

                newEl.dataset.rovalraSendrobuxHooked = true
                newEl.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    document.querySelector('.fui-sheet-close-affordance-container > button').click();
                    showStep1Popup(newEl.id.replace('user-', ''), 0, window.event?.shiftKey || false);
                });

                if (settings.displayNameGradientEnabled)
                    applyDisplayNameGradientToElement(newEl.querySelector('span.inline-flex.items-center.gap-xxsmall.text-body-medium.content-emphasis > span'), profileUserSettings, { hoverHost: newEl });
                if (settings.avatarBorderEnabled)
                    applyBorderToContainer(newEl.querySelector('div.radius-circle.overflow-hidden'), profileUserSettings.border, true);
                if (settings.profileBackgroundGradientEnabled)
                    applyGradientForUserId(newEl.id.replace('user-', ''), newEl.querySelector('div.radius-circle.overflow-hidden'), true);

                element.parentNode.appendChild(newEl);
                setTimeout(() => { waitForImageObserver.disconnect() }, 100);
            }, { scope: element });
        }, {
            multiple: true,
            onRemove: (element) => {
                if (element.dataset.rovalraSendrobuxHooked) return;
                const selector = `#${element.id}[data-rovalra-sendrobux-hooked=true]`;
                const elementSelected = document.querySelector(selector);
                if (elementSelected) elementSelected.remove();
            }
        });

        observeElement('.fui-base-sheet-overlay.foundation-web-portal-zindex.fixed div.friends-listbox-cap', async (element) => {
            if (element.dataset.rovalraSendrobuxFriendlistselect == true) return;
            element.dataset.rovalraSendrobuxFriendlistselect = true
            if (friendsToSendRobux == null) await friendsRobuxInit();
            const profiles = friendsToSendRobux.profileDetails;

            for (const profile of profiles) {
                console.log(profile, profile.userId);
                const profileUserSettings = await getUserSettings(profile.userId);


                console.log(profile.names.cominedName + ' RoValra Settings:', profileUserSettings)

                const profileDiv = document.createElement('div')
                profileDiv.classList.add(
                    'flex',
                    'flex-row',
                    'items-center',
                    'gap-small',
                    'padding-small',
                    'width-full',
                    'cursor-pointer',
                    'shrink-0',
                    'bg-none',
                    `${cssClassNamePrefix}-friendlistitem`
                );
                profileDiv.role = 'option';
                profileDiv.tabIndex = 0;
                profileDiv.ariaSelected = false;
                profileDiv.ariaLabel = profile.names.combinedName

                profileDiv.innerHTML = DOMPurify.sanitize(`
                    <div class="height-800 width-800 radius-circle overflow-hidden shrink-0 bg-surface-300 flex items-center justify-center">
                        <img src="${profile.imageUrl}" alt="${profile.names.combinedName}" class="height-full width-full object-cover" />
                    </div>
                    <div class="flex flex-row items-center gap-xsmall">
                        <span class="text-body-medium content-emphasis">${profile.names.combinedName}</span>
                        <span class="items-center gap-xxsmall inline-flex shrink-0 [--icon-size-small:1em]">
                            ${/* Verified Badge */ profile.isVerified ? `<span class="relative flex items-center justify-center">
                                <icon filled size="medium" role="presentation" class="grow-0 shrink-0 basis-auto content-system-emphasis">verified-backplate</icon>
                                <icon filled size="medium" role="presentation" class="grow-0 shrink-0 basis-auto absolute" style="color: white;">verified-check</icon>
                            </span>` : ''}
                            ${/* Roblox Plus Badge */ profile.hasRobloxSubscription ? `<icon size="small" role="presentation" class="grow-0 shrink-0 basis-auto content-system-contrast" aria-label="Roblox Plus subscriber">roblox-plus</icon>` : ''}
                        </span>
                    </div>
                `, { ...CUSTOM_ADDED_TAGS });

                if (settings.displayNameGradientEnabled)
                    applyDisplayNameGradientToElement(profileDiv.querySelector('.text-body-medium.content-emphasis'), profileUserSettings, { hoverHost: profileDiv });
                if (settings.avatarBorderEnabled)
                    applyBorderToContainer(profileDiv.querySelector('div.radius-circle.overflow-hidden'), profileUserSettings.border, true);
                if (settings.profileBackgroundGradientEnabled)
                    applyGradientForUserId(profile.userId, profileDiv.querySelector('div.radius-circle.overflow-hidden'), true);

                profileDiv.onclick = async () => {
                    document.querySelector('.fui-sheet-close-affordance-container > button').click();
                    if (profile.names.username == "Account Deleted") {
                        const deletedAccountNoticeOverlay = createOverlay({
                            title: await t('plus.sendRobux.buyRobux.deletedAccountTitle'),
                            bodyContent: await t('plus.sendRobux.buyRobux.deletedAccountBody'),
                            showLogo: true,
                            actions: [createButton(await t('plus.sendRobux.popup.shared.okBtn'), 'secondary', { onClick: () => { deletedAccountNoticeOverlay.close(); } })],
                        });
                    } else
                        showStep1Popup(profile.userId, 0, window.event?.shiftKey || false);
                }

                element.appendChild(profileDiv);
            }
        }, { multiple: true });

        observeElement('.fui-base-sheet-overlay.foundation-web-portal-zindex.fixed.flex > .fui-base-sheet-content .flex.flex-col.overflow-y-auto > .flex.flex-row.items-center.justify-between', async (element) => {
            if (element.dataset.rovalraSendrobuxHooked) return;

            const childIndex = Array.from(element.parentNode.children).indexOf(element);
            const transferData = robuxTransfers.transfers.pendingTransfers[childIndex];

            const profileUserSettings = await getUserSettings(transferData.sender.id);

            console.log(childIndex, transferData, element)

            var newEl = element.cloneNode(true);

            newEl.dataset.rovalraSendrobuxHooked = true
            newEl.querySelector('button').addEventListener('click', (ev) => {
                ev.preventDefault();
                document.querySelector('.fui-sheet-close-affordance-container > button').click();
                sendParentPermissionRecieve(transferData.transferRequestId, window.event?.shiftKey || false);
            });

            if (settings.displayNameGradientEnabled)
                applyDisplayNameGradientToElement(newEl.querySelector('div.flex.flex-row.items-center.gap-small > div.flex.flex-col > span.text-label-medium.content-emphasis'), profileUserSettings, { hoverHost: newEl });
            if (settings.avatarBorderEnabled)
                applyBorderToContainer(newEl.querySelector('div.height-800.width-800.radius-circle.clip.flex.items-center.justify-center.shrink-0.bg-surface-200:has(img.height-full.width-full.object-cover)'), profileUserSettings.border, true);
            if (settings.profileBackgroundGradientEnabled)
                applyGradientForUserId(transferData.sender.id, newEl.querySelector('div.height-800.width-800.radius-circle.clip.flex.items-center.justify-center.shrink-0.bg-surface-200:has(img.height-full.width-full.object-cover)'), true);

            element.parentNode.replaceChild(newEl, element);

        }, { multiple: true, });
    });
}
