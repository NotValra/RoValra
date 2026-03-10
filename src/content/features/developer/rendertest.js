import { observeElement } from '../../core/observer.js';
import { callRobloxApiJson } from '../../core/api.js';
import { 
    RegisterWrappers, 
    RBXRenderer, 
    Instance, 
    HumanoidDescriptionWrapper, 
    RBX, 
    Outfit, 
    API,
    FLAGS,
    AnimatorWrapper
} from 'roavatar-renderer';
// This script is kinad outdated
FLAGS.ASSETS_PATH = chrome.runtime.getURL("assets/rbxasset/")
FLAGS.USE_WORKERS = false 

let currentRig = null;
let lastFrameTime = Date.now() / 1000;
let animationRequestId = null;

async function playEmote(emoteAssetId, loop = true) {
    if (!currentRig) return;
    
    const humanoid = currentRig.FindFirstChildOfClass("Humanoid");
    const animator = humanoid?.FindFirstChildOfClass("Animator");
    
    if (animator) {
        const animatorW = new AnimatorWrapper(animator);
        const animName = `emote.${emoteAssetId}`;

        console.log(`Playing Emote ID: ${emoteAssetId}`);
        
        await animatorW.loadAvatarAnimation(BigInt(emoteAssetId), true, loop);
        animatorW.playAnimation(animName);
    }
}

async function renderAvatarPage(contentDiv) {
    if (window.location.pathname.toLowerCase() !== '/render') return;
    
    if (animationRequestId) cancelAnimationFrame(animationRequestId);

    contentDiv.innerHTML = '';
    contentDiv.style.display = 'flex';
    contentDiv.style.flexDirection = 'column';
    contentDiv.style.alignItems = 'center';
    contentDiv.style.gap = '15px';

    const viewport = document.createElement('div');
    viewport.style.width = '512px';
    viewport.style.height = '512px';
    contentDiv.appendChild(viewport);

    const emoteBar = document.createElement('div');
    emoteBar.style.display = 'flex';
    emoteBar.style.gap = '8px';
    emoteBar.style.flexWrap = 'wrap';
    emoteBar.style.justifyContent = 'center';
    emoteBar.style.maxWidth = '600px';
    contentDiv.appendChild(emoteBar);

    try {
        RegisterWrappers();
        RBXRenderer.fullSetup();
        viewport.appendChild(RBXRenderer.getRendererDom());

        const userId = "447170745";
        const avatarData = await callRobloxApiJson({
            subdomain: 'avatar',
            endpoint: `/v2/avatar/users/${userId}/avatar`,
            method: 'GET'
        });

        const outfit = new Outfit();
        outfit.fromJson(avatarData);

        const rigType = avatarData.playerAvatarType; 
        const rigUrl = chrome.runtime.getURL(`assets/Rig${rigType}.rbxm`);
        const rigResult = await API.Asset.GetRBX(rigUrl, undefined);
        
        if (rigResult instanceof RBX) {
            if (currentRig) currentRig.Destroy();
            currentRig = rigResult.generateTree().GetChildren()[0];
            RBXRenderer.addInstance(currentRig, null);
        }

        const hrp = new Instance("HumanoidDescription");
        const hrpWrapper = new HumanoidDescriptionWrapper(hrp);
        hrpWrapper.fromOutfit(outfit);

        const humanoid = currentRig?.FindFirstChildOfClass("Humanoid");
        if (humanoid) {
            await hrpWrapper.applyDescription(humanoid);
            RBXRenderer.addInstance(currentRig, null);

            if (avatarData.emotes && avatarData.emotes.length > 0) {
                avatarData.emotes.forEach(emote => {
                    const btn = document.createElement('button');
                    btn.innerText = emote.assetName;
                    btn.style.padding = '10px 15px';
                    btn.style.background = '#393b3d';
                    btn.style.color = 'white';
                    btn.style.border = '1px solid #555';
                    btn.style.borderRadius = '5px';
                    btn.style.cursor = 'pointer';
                    btn.style.fontSize = '12px';

                    btn.onclick = () => playEmote(emote.assetId, true);
                    emoteBar.appendChild(btn);
                });

                playEmote(avatarData.emotes[0].assetId, false);
            }

            startAnimationLoop();
        }

    } catch (err) {
        console.error("Avatar Render Error:", err);
    }
}

function startAnimationLoop() {
    const animate = () => {
        if (currentRig) {
            const humanoid = currentRig.FindFirstChildOfClass("Humanoid");
            const animator = humanoid?.FindFirstChildOfClass("Animator");

            if (animator) {
                const currentTime = Date.now() / 1000;
                const deltaTime = currentTime - lastFrameTime;
                lastFrameTime = currentTime;

                const animatorW = new AnimatorWrapper(animator);
                animatorW.renderAnimation(deltaTime);
                
                RBXRenderer.addInstance(currentRig, null);
            }
        }
        animationRequestId = requestAnimationFrame(animate);
    };
    
    lastFrameTime = Date.now() / 1000;
    animate();
}

export function init() {
    chrome.storage.local.get('eastereggslinksEnabled', async (result) => {
        if (result.eastereggslinksEnabled) {
            observeElement('.content#content', (cDiv) => {
                renderAvatarPage(cDiv);
            });
        }
    });
}