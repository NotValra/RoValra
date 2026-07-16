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
import { getUserFullData } from '../../core/apis/users.js';
import { fetchUserThumbnailWithApiKey } from '../../core/thumbnail/thumbnails.js';
import { createUserCard } from '../../core/ui/profile/userCard.js';
import { observeElement, observeChildren } from '../../core/observer.js';
import { use } from 'i18next';

let keepOpenInAppProfileItem = false;
const cssClassNamePrefix = "rovalra-sendrobux";

const SVG_CALANDAR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048"><path d="M640 1536Q667 1536 685.5 1517.5Q704 1499 704 1472V1344H1344V1472Q1344 1499 1362.5 1517.5Q1381 1536 1408.0 1536.0Q1435 1536 1453.5 1517.5Q1472 1499 1472 1472V1344H1600Q1670 1344 1728.5 1309.5Q1787 1275 1821.5 1216.5Q1856 1158 1856 1088V1024H192V1088Q192 1158 226.5 1216.5Q261 1275 319.5 1309.5Q378 1344 448 1344H576V1472Q576 1499 594.5 1517.5Q613 1536 640 1536ZM192 896H1856V72Q1856 14 1831.0 -37.0Q1806 -88 1761.0 -120.5Q1716 -153 1659 -160Q1386 -192 1024.0 -192.0Q662 -192 389 -160Q332 -153 287.0 -120.5Q242 -88 217.0 -37.0Q192 14 192 72ZM640 640Q613 640 594.5 621.5Q576 603 576.0 576.0Q576 549 594.5 530.5Q613 512 640.0 512.0Q667 512 685.5 530.5Q704 549 704.0 576.0Q704 603 685.5 621.5Q667 640 640 640ZM960 576Q960 549 978.5 530.5Q997 512 1024.0 512.0Q1051 512 1069.5 530.5Q1088 549 1088.0 576.0Q1088 603 1069.5 621.5Q1051 640 1024.0 640.0Q997 640 978.5 621.5Q960 603 960 576ZM960 192Q960 165 978.5 146.5Q997 128 1024.0 128.0Q1051 128 1069.5 146.5Q1088 165 1088.0 192.0Q1088 219 1069.5 237.5Q1051 256 1024.0 256.0Q997 256 978.5 237.5Q960 219 960 192ZM1408 256Q1381 256 1362.5 237.5Q1344 219 1344.0 192.0Q1344 165 1362.5 146.5Q1381 128 1408.0 128.0Q1435 128 1453.5 146.5Q1472 165 1472.0 192.0Q1472 219 1453.5 237.5Q1435 256 1408 256ZM1344 576Q1344 549 1362.5 530.5Q1381 512 1408.0 512.0Q1435 512 1453.5 530.5Q1472 549 1472.0 576.0Q1472 603 1453.5 621.5Q1435 640 1408.0 640.0Q1381 640 1362.5 621.5Q1344 603 1344 576ZM576 192Q576 165 594.5 146.5Q613 128 640.0 128.0Q667 128 685.5 146.5Q704 165 704.0 192.0Q704 219 685.5 237.5Q667 256 640.0 256.0Q613 256 594.5 237.5Q576 219 576 192Z" transform="scale(1, -1) translate(0, -1664)" fill="currentColor"/></svg>';
const SVG_TWOFRIENDS = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048"><path d="M572 1471Q538 1480 505.0 1471.0Q472 1462 448.0 1438.0Q424 1414 415 1380L332 1071Q323 1038 332.0 1005.0Q341 972 365.0 947.5Q389 923 423 914L732 832Q765 823 798.0 832.0Q831 841 855.0 865.0Q879 889 888 922L971 1231Q980 1265 971.0 1298.0Q962 1331 938.0 1355.0Q914 1379 881 1388ZM1408 832Q1495 832 1569 876Q1642 918 1684 990Q1728 1065 1728.0 1152.0Q1728 1239 1684 1313Q1642 1386 1569 1428Q1495 1472 1408.0 1472.0Q1321 1472 1246 1428Q1174 1386 1132 1313Q1088 1239 1088.0 1152.0Q1088 1065 1132 990Q1174 918 1246 876Q1321 832 1408 832ZM1228 -150Q1316 -160 1415 -160Q1586 -160 1718 -131Q1813 -111 1879 -78Q1917 -59 1933 -20Q1947 16 1938 53L1855 407Q1835 493 1780.5 560.5Q1726 628 1648.0 666.0Q1570 704 1481 704H1349Q1287 704 1229.0 684.5Q1171 665 1122 629Q1187 543 1212 436L1295 82Q1308 24 1293 -37Q1277 -104 1228 -150ZM1031 535Q978 614 894.0 659.0Q810 704 713 704H581Q493 704 415.0 666.0Q337 628 282.0 560.5Q227 493 207 407L125 53Q116 16 130 -20Q146 -59 184 -78Q250 -111 345 -131Q477 -160 647 -160Q772 -160 877 -145Q962 -132 1031 -110Q1076 -95 1111 -78Q1149 -59 1165 -20Q1179 16 1170 53L1087 407Q1071 477 1031 535Z" transform="scale(1, -1) translate(0, -1664)" fill="currentColor"/></svg>';
const SVG_INFO_FILLED = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048"><path d="M1024 1536Q1206 1536 1373 1466Q1534 1398 1658.0 1274.0Q1782 1150 1850 989Q1920 822 1920.0 640.0Q1920 458 1850 291Q1782 130 1658.0 6.0Q1534 -118 1373 -186Q1206 -256 1024.0 -256.0Q842 -256 675 -186Q514 -118 390.0 6.0Q266 130 198 291Q128 458 128.0 640.0Q128 822 198 989Q266 1150 390.0 1274.0Q514 1398 675 1466Q842 1536 1024 1536ZM832 768H960V320H800V192H1248V320H1088V896H832ZM960 1024H1088V1152H960Z" transform="scale(1, -1) translate(0, -1664)" fill="currentColor"/></svg>';

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
    const userCard = createUserCard({
        displayName: userFullData.displayName || userFullData.name,
        username: userFullData.name,
        thumbData: userThumbnailData,
        hidePresence: true,
        isVerified: userFullData.hasVerifiedBadge || false,
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
        for (quickSelectNum in quickSelectOptionMap) {
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
    for (aButtonAmount of quickSelectOptions) {
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
    const userCard = createUserCard({
        displayName: userFullData.displayName,
        username: `@${userFullData.name}`,
        thumbData: userThumbnailData,
        hidePresence: true,
        isVerified: userFullData.hasVerifiedBadge || false,
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

        infoContainer.innerHTML += `<span>${SVG_CALANDAR}${await t('plus.sendRobux.popup.step2.userInfoFriendTime', { time: -time, range: timeUnit })}</span>`
    }
    infoContainer.innerHTML +=
        `<span>${SVG_TWOFRIENDS}${await t('plus.sendRobux.popup.step2.userInfoMutualFriends', { count: initTransferRequest.userRelationshipDetail.mutualFriendsCount })}</span>`
        + `<span>${SVG_INFO_FILLED}${await t('plus.sendRobux.popup.step2.userInfoJoin', { year: initTransferRequest.userRelationshipDetail.userAccountSinceYear })}</span>`

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
                title: await t(`plus.sendRobux.popup.parentPerms.askTitle${easterEgg || isAprilFools() ? 'Silly' : ''}`),
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
                    actions: [createButton(t(`plus.sendRobux.popup.${easterEgg || isAprilFools() ? 'parentPerms.errorReceivingOkBtnSilly' : 'shared.okBtn'}`), "secondary", {
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
                title: await t(`plus.sendRobux.popup.parentPerms.askTitle${easterEgg || isAprilFools() ? 'Silly' : ''}`),
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
    if (!canTransfer) return;

    const { button } = createContextMenuButton(
        await t('plus.sendRobux.profile.button', {
            defaultValue: 'Send Robux',
        }),
    );

    button.addEventListener('click', async () => {
        showStep1Popup(userId, null, window.event?.shiftKey || false)
    });

    const container = menu.querySelector('[role="group"]') || menu;
    const menuItems = container.querySelectorAll('[role="menuitem"]');

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

    if (menuItems.length > 0) {
        menuItems[0].insertAdjacentElement('afterend', button);
    } else {
        container.appendChild(button);
    }
}

export function initProfileButton() {
    chrome.storage.local.get({ sendRobuxEnabled: false, keepRobuxAppButtonEnabled: false, }, (settings) => {
        if (!settings.sendRobuxEnabled) return;
        keepOpenInAppProfileItem = settings.keepRobuxAppButtonEnabled;

        registerProfileContextMenuAction(addSendRobuxButton, () => {
            getSendRobuxStatus();
        });
    });
}

export function initNotificationCenter() {
    chrome.storage.local.get({ sendRobuxEnabled: false }, (settings) => {
        if (!settings.sendRobuxEnabled) return;

        observeElement('.sendr-notification-container.ng-scope', (element) => {
            const notificationData = JSON.parse(element.getAttribute('notification-data'));

            if (notificationData.content.notificationType != 'RobuxTransferReceived')
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
    chrome.storage.local.get({ sendRobuxEnabled: false }, (settings) => {
        if (!settings.sendRobuxEnabled) return;

        observeElement('.fui-base-sheet-overlay.foundation-web-portal-zindex.fixed h2.text-title-large.content-default.margin-top-small', async (element) => {
            const notice = document.createElement('span');
            notice.textContent = await t('sendRobux.buyRobux.notice', {
                defaultValue: 'These links will open in app. Use the search box above instead.'
            });
            notice.classList.add(`${cssClassNamePrefix}-friends-notice`);
            element.appendChild(notice);

        }, { multiple: false, });

        observeElement('#user-search-listbox > .flex.flex-row.items-center.gap-small.padding-small.width-full.cursor-pointer.shrink-0.bg-transparent', async (element) => {
            if (element.dataset.rovalraSendrobuxHooked) return;
            var newEl = element.cloneNode(true);
            element.style.display = 'none';
            newEl.dataset.rovalraSendrobuxHooked = true
            newEl.addEventListener('click', (ev) => {
                ev.preventDefault();
                document.querySelector('.fui-sheet-close-affordance-container > button').click();
                showStep1Popup(newEl.id.replace('user-', ''), 0, window.event?.shiftKey || false);
            });
            element.parentNode.appendChild(newEl, element);


        }, {
            multiple: true,
            onRemove: (element) => {
                if (element.dataset.rovalraSendrobuxHooked) return;
                document.querySelector(`#${element.id}[data-rovalra-sendrobux-hooked=true]`).remove();
            }
        });
    });
}
