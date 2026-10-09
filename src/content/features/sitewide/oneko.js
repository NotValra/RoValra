/*
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Based on adryd's Oneko.js (MIT); see public/Assets/cursorBuddy/LICENSE.
 * Modified for RoValra on 2026-10-09.
 */

export default function oneko(options = {}) {
    let {
        speed = 10,
        size = 32,
        image = "./oneko.gif",
        parent = document.body,
        initialState,
    } = options;
    const fps = 24;

    const nekoEl = document.createElement("div");
    let animationFrameId = 0;
    let lastFrameTimestamp;
    let destroyed = false;
    let paused = true;
    let nekoPosX = 32;
    let nekoPosY = 32;

    let mousePosX = 0;
    let mousePosY = 0;

    let frameCount = 0;
    let idleTime = 0;
    let idleAnimation = null;
    let idleAnimationFrame = 0;

    let currentSprite = "idle";
    let currentSpriteFrame = 0;
    let walking = false;
    let walkingFrame = 0;
    let walkingDistance = 0;
    const spriteSets = {
        idle: [[-3, -3]],
        alert: [[-7, -3]],
        scratchSelf: [
            [-5, 0],
            [-6, 0],
            [-7, 0],
        ],
        scratchWallN: [
            [0, 0],
            [0, -1],
        ],
        scratchWallS: [
            [-7, -1],
            [-6, -2],
        ],
        scratchWallE: [
            [-2, -2],
            [-2, -3],
        ],
        scratchWallW: [
            [-4, 0],
            [-4, -1],
        ],
        tired: [[-3, -2]],
        sleeping: [
            [-2, 0],
            [-2, -1],
        ],
        N: [
            [-1, -2],
            [-1, -3],
        ],
        NE: [
            [0, -2],
            [0, -3],
        ],
        E: [
            [-3, 0],
            [-3, -1],
        ],
        SE: [
            [-5, -1],
            [-5, -2],
        ],
        S: [
            [-6, -3],
            [-7, -2],
        ],
        SW: [
            [-5, -3],
            [-6, -1],
        ],
        W: [
            [-4, -2],
            [-4, -3],
        ],
        NW: [
            [-1, 0],
            [-1, -1],
        ],
    };

    function init() {
        nekoEl.id = "oneko";
        nekoEl.ariaHidden = true;
        nekoEl.style.width = `${size}px`;
        nekoEl.style.height = `${size}px`;
        nekoEl.style.backgroundSize = `${size * 8}px ${size * 4}px`;
        nekoEl.style.position = "fixed";
        nekoEl.style.pointerEvents = "none";
        nekoEl.style.imageRendering = "pixelated";
        nekoEl.style.zIndex = 2147483647;

        nekoEl.style.backgroundImage = `url(${image})`;

        if (!restoreState(initialState)) renderState();
        parent.appendChild(nekoEl);

        document.addEventListener("mousemove", handleMouseMove);

        resume();
    }

    function handleMouseMove(event) {
        mousePosX = event.clientX;
        mousePosY = event.clientY;
    }

    function destroy() {
        pause();
        destroyed = true;
        document.removeEventListener("mousemove", handleMouseMove);
        nekoEl.remove();
    }

    function pause() {
        paused = true;
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = 0;
        lastFrameTimestamp = undefined;
    }

    function resume() {
        if (destroyed || !nekoEl.isConnected) return;
        paused = false;
        if (animationFrameId) return;
        lastFrameTimestamp = undefined;
        animationFrameId = window.requestAnimationFrame(onAnimationFrame);
    }

    function onAnimationFrame(timestamp) {
        animationFrameId = 0;
        if (destroyed || paused || !nekoEl.isConnected) return;
        if (!lastFrameTimestamp) lastFrameTimestamp = timestamp;
        if (timestamp - lastFrameTimestamp > 1000 / fps) {
            lastFrameTimestamp = timestamp;
            frame();
        }
        if (!destroyed && !paused) {
            animationFrameId = window.requestAnimationFrame(onAnimationFrame);
        }
    }

    function setSprite(name, frame) {
        currentSprite = name;
        currentSpriteFrame = frame;
        const sprite = spriteSets[name][frame % spriteSets[name].length];
        nekoEl.style.backgroundPosition = `${sprite[0] * size}px ${
            sprite[1] * size
        }px`;
    }

    function updateOptions(options) {
        size = options.size;
        speed = options.speed;
        nekoEl.style.width = `${size}px`;
        nekoEl.style.height = `${size}px`;
        nekoEl.style.backgroundSize = `${size * 8}px ${size * 4}px`;
        renderState();
    }

    function clampPosition() {
        const halfWidth = Math.min(size / 2, window.innerWidth / 2);
        const halfHeight = Math.min(size / 2, window.innerHeight / 2);
        nekoPosX = Math.min(Math.max(halfWidth, nekoPosX), window.innerWidth - halfWidth);
        nekoPosY = Math.min(Math.max(halfHeight, nekoPosY), window.innerHeight - halfHeight);
    }

    function renderState() {
        clampPosition();
        nekoEl.style.left = `${nekoPosX - size / 2}px`;
        nekoEl.style.top = `${nekoPosY - size / 2}px`;
        setSprite(currentSprite, currentSpriteFrame);
    }

    function getState() {
        return {
            nekoPosX,
            nekoPosY,
            mousePosX,
            mousePosY,
            frameCount,
            idleTime,
            idleAnimation,
            idleAnimationFrame,
            currentSprite,
            currentSpriteFrame,
            walking,
            walkingFrame,
            walkingDistance,
        };
    }

    function restoreState(state) {
        if (destroyed || !state || typeof state !== "object") return false;
        const positions = [
            state.nekoPosX, state.nekoPosY, state.mousePosX, state.mousePosY,
        ];
        const counters = [
            state.frameCount,
            state.idleTime,
            state.idleAnimationFrame,
            state.currentSpriteFrame,
            state.walkingFrame,
        ];
        const idleAnimations = [
            "sleeping", "scratchSelf", "scratchWallN",
            "scratchWallS", "scratchWallE", "scratchWallW",
        ];
        if (
            !positions.every(Number.isFinite) ||
            !counters.every((value) => Number.isSafeInteger(value) && value >= 0) ||
            !Number.isFinite(state.walkingDistance) ||
            state.walkingDistance < 0 ||
            typeof state.walking !== "boolean" ||
            typeof state.currentSprite !== "string" ||
            !Object.hasOwn(spriteSets, state.currentSprite) ||
            (state.idleAnimation !== null && !idleAnimations.includes(state.idleAnimation))
        ) return false;

        nekoPosX = state.nekoPosX;
        nekoPosY = state.nekoPosY;
        mousePosX = Math.min(Math.max(0, state.mousePosX), window.innerWidth);
        mousePosY = Math.min(Math.max(0, state.mousePosY), window.innerHeight);
        frameCount = state.frameCount;
        idleTime = state.idleTime;
        idleAnimation = state.idleAnimation;
        idleAnimationFrame = state.idleAnimationFrame;
        currentSprite = state.currentSprite;
        currentSpriteFrame = state.currentSpriteFrame;
        walking = state.walking;
        walkingFrame = state.walkingFrame;
        walkingDistance = state.walkingDistance % (size * 10 / 32);
        lastFrameTimestamp = undefined;
        renderState();
        return true;
    }

    function resetIdleAnimation() {
        idleAnimation = null;
        idleAnimationFrame = 0;
    }

    function idle() {
        idleTime += 1;

        if (
            idleTime > 10 &&
            Math.floor(Math.random() * 200) == 0 &&
            idleAnimation == null
        ) {
            let avalibleIdleAnimations = ["sleeping", "scratchSelf"];
            if (nekoPosX < size) avalibleIdleAnimations.push("scratchWallW");
            if (nekoPosY < size) avalibleIdleAnimations.push("scratchWallN");
            if (nekoPosX > window.innerWidth - size)
                avalibleIdleAnimations.push("scratchWallE");
            if (nekoPosY > window.innerHeight - size)
                avalibleIdleAnimations.push("scratchWallS");
            idleAnimation =
                avalibleIdleAnimations[
                    Math.floor(Math.random() * avalibleIdleAnimations.length)
                ];
        }

        switch (idleAnimation) {
            case "sleeping":
                if (idleAnimationFrame < 8) {
                    setSprite("tired", 0);
                    break;
                }
                setSprite("sleeping", Math.floor(idleAnimationFrame / 4));
                if (idleAnimationFrame > 192) {
                    resetIdleAnimation();
                }
                break;
            case "scratchWallN":
            case "scratchWallS":
            case "scratchWallE":
            case "scratchWallW":
            case "scratchSelf":
                setSprite(idleAnimation, idleAnimationFrame);
                if (idleAnimationFrame > 9) {
                    resetIdleAnimation();
                }
                break;
            default:
                setSprite("idle", 0);
                return;
        }
        idleAnimationFrame += 1;
    }

    function frame() {
        const nekoSpeed = speed;
        frameCount += 1;
        const diffX = nekoPosX - mousePosX;
        const diffY = nekoPosY - mousePosY;
        const distance = Math.sqrt(diffX ** 2 + diffY ** 2);

        if (distance < nekoSpeed || distance < 48) {
            walking = false;
            idle();
            return;
        }

        idleAnimation = null;
        idleAnimationFrame = 0;

        if (idleTime > 1) {
            walking = false;
            setSprite("alert", 0);
            idleTime = Math.min(idleTime, 7);
            idleTime -= 1;
            return;
        }

        let direction = diffY / distance > 0.5 ? "N" : "";
        direction += diffY / distance < -0.5 ? "S" : "";
        direction += diffX / distance > 0.5 ? "W" : "";
        direction += diffX / distance < -0.5 ? "E" : "";
        if (!walking) {
            walking = true;
            walkingFrame = frameCount;
            walkingDistance = 0;
        }
        setSprite(direction, walkingFrame);

        const previousX = nekoPosX;
        const previousY = nekoPosY;
        nekoPosX -= (diffX / distance) * nekoSpeed;
        nekoPosY -= (diffY / distance) * nekoSpeed;

        clampPosition();

        walkingDistance += Math.hypot(nekoPosX - previousX, nekoPosY - previousY);
        const stride = size * 10 / 32;
        const frames = Math.floor((walkingDistance + 1e-9) / stride);
        walkingFrame += frames;
        walkingDistance = Math.max(0, walkingDistance - frames * stride);

        nekoEl.style.left = `${nekoPosX - size / 2}px`;
        nekoEl.style.top = `${nekoPosY - size / 2}px`;
    }

    init();

    destroy.updateOptions = updateOptions;
    destroy.getState = getState;
    destroy.restoreState = restoreState;
    destroy.pause = pause;
    destroy.resume = resume;
    return destroy;
}
