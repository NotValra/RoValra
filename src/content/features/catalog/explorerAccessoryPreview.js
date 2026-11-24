import {
    API,
    Authentication,
    CFrame,
    FLAGS,
    RBX,
    RBXRenderer,
} from 'roavatar-renderer';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { observeResize } from '../../core/observer.js';
import { backgroundRendererRequests } from '../../core/utils/renderer.js';

backgroundRendererRequests();

const BACKGROUND_COLOR = 0x111214;
const CAMERA_HELPER_COLOR = 0xffb000;
const FOCUSED_CAMERA_HELPER_COLOR = 0x00a2ff;
const THUMBNAIL_ASPECT = 1;
const COMPILE_TIMEOUT_SECONDS = 30;
const THUMBNAIL_CAMERA_PADDING = 1.1;
const DEFAULT_THUMBNAIL_FOV = 70;

let rendererSetupPromise = null;

function ensureRenderer() {
    if (RBXRenderer.renderer) return Promise.resolve(true);
    if (!rendererSetupPromise) {
        FLAGS.ONLINE_ASSETS = true;
        FLAGS.AUDIO_ENABLED = false;
        rendererSetupPromise = RBXRenderer.fullSetup(false, false, false)
            .then((ok) => {
                if (!ok) rendererSetupPromise = null;
                return ok;
            })
            .catch((error) => {
                rendererSetupPromise = null;
                throw error;
            });
    }
    return rendererSetupPromise;
}

async function loadRoAvatarTree(source) {
    const rbx = await API.Asset.GetRBX(
        `rbxassetid://${source.assetId}`,
        source.headers,
    );
    if (!(rbx instanceof RBX)) return null;
    return rbx.generateTree();
}

function findByPath(dataModel, path) {
    let current = dataModel;
    for (const [className, name] of path) {
        const children = current.GetChildren();
        current =
            children.find(
                (c) =>
                    c.className === className &&
                    c.PropOrDefault('Name', '') === name,
            ) || children.find((c) => c.className === className);
        if (!current) return null;
    }
    return current;
}

function isBasePart(inst) {
    return !!inst && inst.HasProperty('CFrame') && inst.HasProperty('Size');
}

function collectThumbnailCameras(accessory) {
    const handle = accessory.FindFirstChild('Handle');
    const cameras = [];

    for (const inst of [accessory, ...accessory.GetDescendants()]) {
        if (inst.className === 'Camera') {
            const cframe = inst.PropOrDefault('CFrame', null);
            if (!cframe?.lookVector) continue;
            cameras.push({
                name: inst.PropOrDefault('Name', 'Camera'),
                instances: new Set([inst]),
                cframe,
                fov: Number(inst.PropOrDefault('FieldOfView', 70)) || 70,
                target: isBasePart(handle) ? handle : null,
            });
        } else if (inst.PropOrDefault('Name', '') === 'ThumbnailCameraValue') {
            const parent = inst.parent;
            const targetValue = parent?.FindFirstChild('ThumbnailCameraTarget');
            const target = targetValue?.PropOrDefault('Value', null);
            const offset = inst.PropOrDefault('Value', null);
            if (!offset?.lookVector) continue;

            const targetPart = isBasePart(target) ? target : null;
            cameras.push({
                name: parent?.PropOrDefault('Name', '') || 'ThumbnailCamera',
                instances: new Set([inst, parent, targetValue].filter(Boolean)),
                cframe: targetPart
                    ? targetPart.Prop('CFrame').multiply(offset)
                    : offset,
                fov: DEFAULT_THUMBNAIL_FOV,
                target: targetPart,
            });
        }
    }
    return cameras;
}

function frameThumbnailCamera({ cframe, fov, target }) {
    const cameraCF = cframe.clone();
    if (!target) return cameraCF.getTHREEMatrix();

    const targetCF = target.Prop('CFrame');
    const size = target.Prop('Size');
    const look = cameraCF.lookVector();
    const up = cameraCF.upVector();
    const right = cameraCF.rightVector();
    const center = targetCF.Position;
    const tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

    let distance = 0.1;
    for (const x of [-0.5, 0.5]) {
        for (const y of [-0.5, 0.5]) {
            for (const z of [-0.5, 0.5]) {
                const corner = targetCF.multiply(
                    new CFrame(size.X * x, size.Y * y, size.Z * z),
                ).Position;
                const offset = [
                    corner[0] - center[0],
                    corner[1] - center[1],
                    corner[2] - center[2],
                ];
                const depth = dot(offset, look);
                distance = Math.max(
                    distance,
                    Math.abs(dot(offset, right)) / tan - depth,
                    Math.abs(dot(offset, up)) / tan - depth,
                );
            }
        }
    }
    distance *= THUMBNAIL_CAMERA_PADDING;

    cameraCF.Position = [
        center[0] - look[0] * distance,
        center[1] - look[1] * distance,
        center[2] - look[2] * distance,
    ];
    return cameraCF.getTHREEMatrix();
}

function computeContentBox(scene, ignored) {
    const box = new THREE.Box3();
    scene.traverse((obj) => {
        if (!obj.isMesh || !obj.visible) return;
        for (let p = obj; p; p = p.parent) if (ignored.has(p)) return;
        obj.geometry?.computeBoundingBox?.();
        box.expandByObject(obj);
    });
    return box;
}

export function openAccessoryPreview({
    area,
    status,
    source,
    rootPath,
    focusCameraPath,
    onCamerasReady,
    onError,
}) {
    let disposed = false;
    let frame = 0;
    let dataModel = null;
    let renderScene = null;
    let resizeHandle = null;
    const helpers = [];
    const ignored = new Set();

    const canvas = document.createElement('canvas');
    canvas.className = 'rovalra-explorer-accessory-canvas';
    area.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const viewCamera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
    const controls = new OrbitControls(viewCamera, canvas);
    controls.enableDamping = true;

    let throughCamera = null;

    const cleanup = () => {
        if (disposed) return;
        disposed = true;
        cancelAnimationFrame(frame);
        resizeHandle?.unobserve();
        controls.dispose();
        for (const helper of helpers) {
            helper.parent?.remove(helper);
            helper.dispose?.();
        }
        if (renderScene) {
            renderScene.destroy();
            renderScene = null;
        }
        dataModel?.Destroy();
        dataModel = null;
    };

    const getViewRect = () => {
        const w = area.clientWidth;
        const h = area.clientHeight;
        if (!throughCamera) return { x: 0, y: 0, w, h };
        const side = Math.min(w, h);
        return {
            x: Math.round((w - side) / 2),
            y: Math.round((h - side) / 2),
            w: side,
            h: side,
        };
    };

    const resize = () => {
        const pr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.round(area.clientWidth * pr));
        canvas.height = Math.max(1, Math.round(area.clientHeight * pr));
    };

    const renderFrame = () => {
        const renderer = RBXRenderer.renderer;
        if (!renderer || !renderScene) return;

        let { x, y, w, h } = getViewRect();
        if (w <= 0 || h <= 0) return;

        if (!RBXRenderer.canvasContainer?.isConnected) {
            const [rw, rh] = RBXRenderer.resolution;
            if (rw < w || rh < h) {
                RBXRenderer.setRendererSize(
                    Math.max(rw, Math.ceil(w)),
                    Math.max(rh, Math.ceil(h)),
                );
            }
        }
        const [rw, rh] = RBXRenderer.resolution;
        w = Math.min(w, rw);
        h = Math.min(h, rh);

        if (throughCamera) {
            renderScene.camera.matrixAutoUpdate = false;
            renderScene.camera.matrix.copy(throughCamera.matrix);
            renderScene.camera.matrix.decompose(
                renderScene.camera.position,
                renderScene.camera.quaternion,
                renderScene.camera.scale,
            );
            renderScene.camera.fov = throughCamera.fov;
        } else {
            renderScene.camera.matrixAutoUpdate = true;
            renderScene.camera.position.copy(viewCamera.position);
            renderScene.camera.quaternion.copy(viewCamera.quaternion);
            renderScene.camera.fov = viewCamera.fov;
        }
        renderScene.camera.near = viewCamera.near;
        renderScene.camera.far = viewCamera.far;
        renderScene.camera.updateMatrixWorld(true);

        for (const helper of helpers) helper.visible = !throughCamera;

        renderScene.viewport = [0, 0, w, h];
        renderScene.scissor = [0, 0, w, h];
        RBXRenderer.renderScene(renderScene, true);
        renderScene.noRect();

        const pr = renderer.getPixelRatio();
        const bufferHeight = renderer.domElement.height;
        ctx.fillStyle = '#111214';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(
            renderer.domElement,
            0,
            bufferHeight - h * pr,
            w * pr,
            h * pr,
            x * (canvas.width / area.clientWidth),
            y * (canvas.height / area.clientHeight),
            w * (canvas.width / area.clientWidth),
            h * (canvas.height / area.clientHeight),
        );
    };

    const loop = () => {
        if (disposed) return;
        if (!canvas.isConnected) {
            cleanup();
            return;
        }
        if (!throughCamera) controls.update();
        renderFrame();
        frame = requestAnimationFrame(loop);
    };

    const fail = (error) => {
        console.error('[RoValra Explorer] Accessory preview failed:', error);
        if (!disposed) {
            cleanup();
            onError?.();
        }
    };

    (async () => {
        if (!(await ensureRenderer())) throw new Error('Renderer unavailable');
        if (disposed) return;

        dataModel = await loadRoAvatarTree(source);
        if (disposed) return;
        if (!dataModel) throw new Error('Asset could not be loaded');

        const accessory = findByPath(dataModel, rootPath);
        if (!accessory) throw new Error('Accessory not found in asset');

        renderScene = RBXRenderer.addScene(false);
        renderScene.noRect();
        RBXRenderer.setupScene('WellLit', BACKGROUND_COLOR, renderScene);
        for (const plane of [renderScene.plane, renderScene.shadowPlane]) {
            if (plane) {
                plane.visible = false;
                ignored.add(plane);
            }
        }

        RBXRenderer.addInstance(accessory, new Authentication(), renderScene);

        const descendants = [accessory, ...accessory.GetDescendants()];
        await renderScene.waitUntilFullyCompiled(
            descendants,
            COMPILE_TIMEOUT_SECONDS,
        );
        if (disposed) return;

        const box = computeContentBox(renderScene.scene, ignored);
        const center = box.isEmpty()
            ? new THREE.Vector3()
            : box.getCenter(new THREE.Vector3());
        const radius = box.isEmpty()
            ? 2
            : Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 0.05);
        const distance =
            (radius / Math.sin(THREE.MathUtils.degToRad(viewCamera.fov / 2))) *
            1.15;

        const focusTarget = focusCameraPath
            ? findByPath(dataModel, focusCameraPath)
            : null;
        const cameraEntries = [];
        const thumbnailCameras = focusTarget
            ? collectThumbnailCameras(accessory).filter((c) =>
                  c.instances.has(focusTarget),
              )
            : [];
        for (const thumbnailCamera of thumbnailCameras) {
            const matrix = frameThumbnailCamera(thumbnailCamera);
            const camPos = new THREE.Vector3().setFromMatrixPosition(matrix);
            const reach = Math.max(
                camPos.distanceTo(center) + radius,
                radius * 2,
            );
            const frustumCamera = new THREE.PerspectiveCamera(
                thumbnailCamera.fov,
                THUMBNAIL_ASPECT,
                reach * 0.02,
                reach,
            );
            frustumCamera.matrixAutoUpdate = false;
            frustumCamera.matrix.copy(matrix);
            frustumCamera.updateMatrixWorld(true);

            const isFocused = true;
            const helper = new THREE.CameraHelper(frustumCamera);
            helper.setColors(
                new THREE.Color(
                    isFocused
                        ? FOCUSED_CAMERA_HELPER_COLOR
                        : CAMERA_HELPER_COLOR,
                ),
                new THREE.Color(
                    isFocused
                        ? FOCUSED_CAMERA_HELPER_COLOR
                        : CAMERA_HELPER_COLOR,
                ),
                new THREE.Color(0xffffff),
                new THREE.Color(
                    isFocused
                        ? FOCUSED_CAMERA_HELPER_COLOR
                        : CAMERA_HELPER_COLOR,
                ),
                new THREE.Color(0x888888),
            );
            helper.update();
            renderScene.scene.add(helper);
            helpers.push(helper);
            ignored.add(helper);

            cameraEntries.push({
                name: thumbnailCamera.name,
                focused: isFocused,
                matrix,
                fov: thumbnailCamera.fov,
                position: camPos,
                reach,
            });
        }

        let viewRadius = radius;
        for (const entry of cameraEntries) {
            viewRadius = Math.max(
                viewRadius,
                entry.position.distanceTo(center) * 1.1,
            );
        }
        const viewDistance = Math.max(
            distance,
            (viewRadius /
                Math.sin(THREE.MathUtils.degToRad(viewCamera.fov / 2))) *
                1.05,
        );

        viewCamera.position
            .set(0.5, 0.35, -1)
            .normalize()
            .multiplyScalar(viewDistance)
            .add(center);
        viewCamera.near = viewDistance / 200;
        viewCamera.far = viewDistance * 50;
        viewCamera.updateProjectionMatrix();
        controls.target.copy(center);
        controls.update();

        resizeHandle = observeResize(area, resize);
        resize();
        status.remove();
        loop();

        onCamerasReady?.({
            cameras: cameraEntries,
            viewThrough(entry) {
                throughCamera = entry || null;
                controls.enabled = !throughCamera;
            },
        });
    })().catch(fail);

    return cleanup;
}
