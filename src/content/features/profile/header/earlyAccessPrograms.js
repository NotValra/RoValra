import { getAssets } from '../../../core/assets.js';
import { getBatchThumbnails } from '../../../core/thumbnail/thumbnails.js';
import { formatPlayerCount } from '../../../core/games/playerCount.js';
import { createOverlay } from '../../../core/ui/overlay.js';
import { createSpinner } from '../../../core/ui/spinner.js';
import { ts } from '../../../core/locale/i18n.js';

// prettier-ignore
const SECTIONS = [
    { category: 'development', titleKey: 'earlyAccessPrograms.developmentTitle' },
    { category: 'current', titleKey: 'earlyAccessPrograms.currentTitle', emptyKey: 'earlyAccessPrograms.currentEmpty' },
    { category: 'past', titleKey: 'earlyAccessPrograms.pastTitle' },
];

// prettier-ignore
const EARLY_ACCESS_PROGRAMS = [
    // current dev
    { groupId: 14593111, name: 'AvatarEmotionContent', category: 'development' },
    { groupId: 178279080, name: 'Ads Testing Group', category: 'development' },
    { groupId: 2523540, name: 'RegressionTestGroup', category: 'development' },
    { groupId: 7964428, name: 'Epic Rendering Testers', category: 'development' },
    { groupId: 16962484, name: 'Avatar Chat Testing', category: 'development' },
    { groupId: 35848446, name: 'Internal Roblox Studio', category: 'development' },
    { groupId: 126758615, name: 'HubSearch', category: 'development' },
    { groupId: 233413002, name: 'Animation Testing Group', category: 'development' },
    { groupId: 176848777, name: 'Passkey Testers', category: 'development' },
    { groupId: 1026663720, name: 'Procedural Bone Testing', category: 'development' },
    { groupId: 3253689, name: 'AvLab', category: 'development' },
    { groupId: 6821794, name: 'Alpha Strike Group', category: 'development' },
    { groupId: 14716024, name: 'Iris-Group', category: 'development' },
    { groupId: 4582200, name: 'Clothing Permissions Test', category: 'development' },
    { groupId: 15155030, name: 'Vid2Animation', category: 'development' },
    { groupId: 9170755, name: 'LuoBu Review Team', category: 'development' },
    { groupId: 14773498, name: 'Studio Collaborative Learning Group', category: 'development' },
    { groupId: 36048786, name: 'Creator Game Solutions', category: 'development' },
    { groupId: 14649879, name: 'Collaborative Tools Dev Group', category: 'development' },
    { groupId: 17169245, name: 'WebRTC in 3D', category: 'development' },
    { groupId: 602077369, name: 'Roblox Innovation Studio', category: 'development' },
    { groupId: 8554431, name: 'Assessment Tools', category: 'development' },
    { groupId: 160690462, name: 'ContentGuardians', category: 'development' },
    { groupId: 142598225, name: 'Roblox Labs', category: 'development' },
    { groupId: 17134089, name: 'Immersive Ads', category: 'development' },

    // current early access
    { groupId: 117529920, name: 'Roblox: Testing', category: 'development' },
    { groupId: 8507294, name: 'Roblox Client Testing', category: 'current' },
    { groupId: 12051064, name: 'Community Feedback Program', category: 'current' },
    { groupId: 4358041, name: 'Freecam', category: 'current' },
    { groupId: 170433477, name: 'IEC Test', category: 'development' },
    { groupId: 806784387, name: 'Roblox Rendering Testing', category: 'current' },
    { groupId: 758805222, name: 'Procedural Bones Closed Beta Testing', category: 'current' },
    { groupId: 34927658, name: 'Community Feedback', category: 'current' },
    { groupId: 134755475, name: 'TestPilot - In-Experience Avatar Generation', category: 'current' },

    // former early accesss
    { groupId: 3055661, name: 'Valiant Community QA Team', category: 'past' },
    { groupId: 15772045, name: 'ACBooth', category: 'past' },
    { groupId: 9340438, name: 'AvatarEmotion', category: 'past' },
    { groupId: 59135124, name: '4D Early Access', category: 'past' },
    { groupId: 15757190, name: 'ACDemo', category: 'past' },
    { groupId: 34186039, name: 'Flex Layout QA Test Group', category: 'past' },
    { groupId: 35110384, name: 'UI Layouts Test Group', category: 'past' },
    { groupId: 35466458, name: 'cube3D', category: 'past' },
    { groupId: 14538942, name: 'betacollabgroup', category: 'past' },
];

const PROGRAM_GROUP_IDS = new Set(EARLY_ACCESS_PROGRAMS.map((p) => p.groupId));

export function isEarlyAccessProgramGroup(groupId) {
    return PROGRAM_GROUP_IDS.has(groupId);
}

function createNotice() {
    const notice = document.createElement('div');
    notice.className = 'rovalra-group-list-notice';

    const description = document.createElement('p');
    description.textContent = ts('earlyAccessPrograms.description');

    notice.appendChild(description);
    return notice;
}

function createProgramRow(item, assets) {
    const { group, role } = item;

    const row = document.createElement('a');
    row.className = 'rovalra-group-list-row';
    row.href = `https://www.roblox.com/communities/${group.id}/-`;

    const thumb = document.createElement('span');
    thumb.className = 'rovalra-group-list-thumb';

    const info = document.createElement('span');
    info.className = 'rovalra-group-list-info';

    const nameLine = document.createElement('span');
    nameLine.className = 'rovalra-group-list-name';

    const name = document.createElement('span');
    name.className = 'rovalra-group-list-name-text';
    name.textContent = group.name;
    nameLine.appendChild(name);

    if (group.hasVerifiedBadge && assets.verifiedBadgeMono) {
        const verified = document.createElement('img');
        verified.className = 'rovalra-group-list-verified';
        verified.src = assets.verifiedBadgeMono;
        verified.alt = '';
        nameLine.appendChild(verified);
    }

    const meta = document.createElement('span');
    meta.className = 'rovalra-group-list-meta';
    meta.textContent = ts('earlyAccessPrograms.rowMeta', {
        role: role?.name || '',
        members: formatPlayerCount(Number(group.memberCount) || 0),
    });

    info.append(nameLine, meta);
    row.append(thumb, info);
    return row;
}

function loadThumbnails(rows, programs) {
    getBatchThumbnails(
        programs.map((item) => item.group.id),
        'GroupIcon',
        '150x150',
    )
        .then((thumbs) => {
            thumbs.forEach((thumb, index) => {
                if (!thumb?.imageUrl || thumb.state !== 'Completed') return;
                const slot = rows[index]?.querySelector(
                    '.rovalra-group-list-thumb',
                );
                if (!slot || slot.firstChild) return;
                const img = document.createElement('img');
                img.src = thumb.imageUrl;
                img.alt = '';
                slot.appendChild(img);
            });
        })
        .catch(() => {});
}

function createSection(title, programs, emptyText, assets) {
    const section = document.createElement('section');
    section.className = 'rovalra-group-list-section';

    const heading = document.createElement('h3');
    heading.className = 'rovalra-group-list-section-title';
    heading.textContent = title;
    section.appendChild(heading);

    if (!programs.length) {
        const empty = document.createElement('p');
        empty.className = 'rovalra-group-list-section-empty';
        empty.textContent = emptyText;
        section.appendChild(empty);
        return section;
    }

    const rows = programs.map((item) => createProgramRow(item, assets));
    section.append(...rows);
    loadThumbnails(rows, programs);
    return section;
}

function renderPrograms(list, memberships) {
    const assets = getAssets();
    const categoryByGroupId = new Map(
        EARLY_ACCESS_PROGRAMS.map((p) => [p.groupId, p.category]),
    );

    const sections = SECTIONS.flatMap(({ category, titleKey, emptyKey }) => {
        const programs = memberships.filter(
            (item) => categoryByGroupId.get(item?.group?.id) === category,
        );
        if (!programs.length && !emptyKey) return [];
        return [
            createSection(
                ts(titleKey),
                programs,
                emptyKey ? ts(emptyKey) : '',
                assets,
            ),
        ];
    });
    list.replaceChildren(...sections);
}

export function openEarlyAccessProgramsOverlay(groups) {
    const body = document.createElement('div');
    body.className = 'rovalra-group-list-body';

    const list = document.createElement('div');
    list.className = 'rovalra-group-list';

    const loading = document.createElement('div');
    loading.className = 'rovalra-group-list-loading';
    loading.appendChild(createSpinner({ size: '32px' }));
    list.appendChild(loading);

    body.append(createNotice(), list);

    createOverlay({
        title: ts('earlyAccessPrograms.title'),
        bodyContent: body,
        maxWidth: '480px',
        showLogo: true,
    });

    if (!Array.isArray(groups)) {
        const error = document.createElement('p');
        error.className = 'rovalra-group-list-status';
        error.textContent = ts('earlyAccessPrograms.error');
        list.replaceChildren(error);
        return;
    }

    renderPrograms(list, groups);
}
