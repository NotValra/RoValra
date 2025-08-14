(function() {
    'use strict';

    let serverCountsData = {};
    let initialCameraPosition;

    let lastCameraPosition = null;
    let lastControlsTarget = null;
    let easterEggActive = false;

    document.addEventListener('initRovalraGlobe', (e) => {
        const {
            REGIONS,
            mapUrl,
            serverCounts
        } = e.detail;
        serverCountsData = serverCounts || {};

        const container = document.getElementById('rovalra-globe-container');
        const tooltip = document.getElementById('rovalra-globe-tooltip');

        if (!container || !window.THREE) {
            return;
        }


        const onContainerResize = () => {
            const width = container.clientWidth;
            const height = container.clientHeight;

            if (width === 0 || height === 0) {
                return;
            }

            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        };

        const initialWidth = container.clientWidth;
        const initialHeight = container.clientHeight;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(1, 1, 0.1, 1000);


        const createMarkerTexture = (r, g, b) => {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const context = canvas.getContext('2d');
            const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
            gradient.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, 1)`);
            gradient.addColorStop(1.0, `rgba(${r}, ${g}, ${b}, 0.5)`);
            context.fillStyle = gradient;
            context.fillRect(0, 0, 128, 128);
            return new THREE.CanvasTexture(canvas);
        };

        const activeMarkerTexture = createMarkerTexture(51, 95, 255);
        const inactiveMarkerTexture = createMarkerTexture(128, 128, 128);

        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        renderer.setClearColor(0x000000, 0);
        renderer.setSize(initialWidth, initialHeight);
        container.appendChild(renderer.domElement);

        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 1;
        controls.minDistance = 100;
        controls.maxDistance = 270.7;
        controls.enablePan = false;
        controls.zoomSpeed = 1.5;
        controls.autoRotateSpeed = 0.4;

        controls.addEventListener('end', () => {
            if (!lastCameraPosition) {
                lastCameraPosition = new THREE.Vector3();
                lastControlsTarget = new THREE.Vector3();
            }
            lastCameraPosition.copy(camera.position);
            lastControlsTarget.copy(controls.target);
        });

        const loader = new THREE.TextureLoader();
        const texture = loader.load(mapUrl);
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;

        const globeRadius = 2;
        const globeGeometry = new THREE.SphereGeometry(globeRadius, 64, 64);

        const globeMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            depthTest: false
        });
        const globe = new THREE.Mesh(globeGeometry, globeMaterial);
        globe.renderOrder = -1;
        scene.add(globe);

        const initialViewLat = 15;
        const initialViewLon = -35;
        const initialDistance = 230;

        const phi = (90 - initialViewLat) * (Math.PI / 180);
        const theta = (initialViewLon + 180) * (Math.PI / 180);

        camera.position.x = -(initialDistance * Math.sin(phi) * Math.cos(theta));
        camera.position.y = initialDistance * Math.cos(phi);
        camera.position.z = initialDistance * Math.sin(phi) * Math.sin(theta);

        initialCameraPosition = camera.position.clone();

        const markers = [];
        const interactiveMarkers = [];

        document.addEventListener('rovalraGlobeEasterEgg', (event) => {
            easterEggActive = true;
            const {
                iconUrl
            } = event.detail;
            if (!iconUrl) return;

            const easterEggLoader = new THREE.TextureLoader();
            easterEggLoader.load(iconUrl, (easterEggTexture) => {
                easterEggTexture.minFilter = THREE.LinearFilter;
                easterEggTexture.magFilter = THREE.LinearFilter;
                markers.forEach(marker => {
                    marker.children.forEach(child => {
                        if (child.material && child.material.map) {
                            child.material.map = easterEggTexture;
                            child.material.needsUpdate = true;
                        }
                    });
                });
            });
        });

        document.addEventListener('rovalraGlobeEasterEggOff', () => {
            easterEggActive = false;
            markers.forEach(marker => {
                const {
                    code
                } = marker.userData;
                const count = serverCountsData[code];
                const hasServers = typeof count === 'number' && count > 0;
                const targetTexture = hasServers ? activeMarkerTexture : inactiveMarkerTexture;
                marker.children.forEach(child => {
                    if (child.material) {
                        child.material.map = targetTexture;
                        child.material.needsUpdate = true;
                    }
                });
            });
        });

        const latLonToVector3 = (lat, lon, radius) => {
            const phi = (90 - lat) * (Math.PI / 180);
            const theta = (lon + 180) * (Math.PI / 180);
            const x = -(radius * Math.sin(phi) * Math.cos(theta));
            const z = radius * Math.sin(phi) * Math.sin(theta);
            const y = radius * Math.cos(phi);
            return new THREE.Vector3(x, y, z);
        };

        const markerGeometry = new THREE.CircleGeometry(0.035, 32);
        const numberOfRipples = 3;

        Object.values(REGIONS).forEach(continent => {
            Object.entries(continent).forEach(([code, region]) => {
                if (region.coords) {
                    const count = serverCountsData[code];
                    const hasServers = typeof count === 'number' && count > 0;
                    const initialTexture = hasServers ? activeMarkerTexture : inactiveMarkerTexture;

                    const markerGroup = new THREE.Group();

                    const hitboxGeometry = new THREE.CircleGeometry(0.08, 16);
                    const hitboxMaterial = new THREE.MeshBasicMaterial({
                        transparent: true,
                        opacity: 0,
                        depthWrite: false,
                        side: THREE.DoubleSide
                    });
                    const hitbox = new THREE.Mesh(hitboxGeometry, hitboxMaterial);
                    hitbox.renderOrder = 3;
                    markerGroup.add(hitbox);
                    interactiveMarkers.push(hitbox);

                    const coreMaterial = new THREE.MeshBasicMaterial({
                        map: initialTexture,
                        transparent: true,
                        side: THREE.DoubleSide,
                        depthWrite: false
                    });

                    const coreDot = new THREE.Mesh(markerGeometry, coreMaterial);
                    coreDot.renderOrder = 2;
                    markerGroup.add(coreDot);

                    for (let i = 0; i < numberOfRipples; i++) {
                        const rippleMaterial = new THREE.MeshBasicMaterial({
                            map: initialTexture,
                            transparent: true,
                            side: THREE.DoubleSide,
                            depthWrite: false,
                        });

                        const rippleDot = new THREE.Mesh(markerGeometry, rippleMaterial);
                        rippleDot.renderOrder = 1;
                        rippleDot.raycast = () => {};
                        markerGroup.add(rippleDot);
                    }

                    const position = latLonToVector3(region.coords.lat, region.coords.lon, globeRadius + 0.01);
                    markerGroup.position.copy(position);
                    markerGroup.lookAt(globe.position);
                    markerGroup.userData = {
                        code: code,
                        city: region.city,
                        country: region.country
                    };
                    globe.add(markerGroup);
                    markers.push(markerGroup);
                }
            });
        });

        document.addEventListener('rovalraGlobe_UpdateData', (e) => {
            if (easterEggActive) return;
            const {
                serverCounts
            } = e.detail;
            if (!serverCounts) return;

            serverCountsData = serverCounts;

            markers.forEach(marker => {
                const {
                    code
                } = marker.userData;
                const count = serverCountsData[code];
                const hasServers = typeof count === 'number' && count > 0;
                const targetTexture = hasServers ? activeMarkerTexture : inactiveMarkerTexture;

                marker.children.forEach(child => {
                    if (child.material && child.material.map && child.material.map !== targetTexture) {
                        child.material.map = targetTexture;
                    }
                });
            });
        });

        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        let intersected;
        let isDragging = false;
        let pointerDownTime = 0;
        let isMouseOver = false;

        function onPointerDown(event) {
            isDragging = false;
            pointerDownTime = Date.now();
            container.setPointerCapture(event.pointerId);
            container.addEventListener('pointermove', onPointerMove);
            container.addEventListener('pointerup', onPointerUp);
        }

        function onPointerMove(event) {
            isDragging = true;
            tooltip.style.display = 'none';
        }

        function onPointerUp(event) {
            container.releasePointerCapture(event.pointerId);
            container.removeEventListener('pointermove', onPointerMove);
            container.removeEventListener('pointerup', onPointerUp);
            const dragDuration = Date.now() - pointerDownTime;
            if (!isDragging && dragDuration < 200) {
                onClick(event);
            }
            isDragging = false;
        }

        function onMouseMove(event) {
            if (isDragging) return;
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const visibleInteractiveMarkers = interactiveMarkers.filter(m => m.parent?.visible);
            const intersects = raycaster.intersectObjects(visibleInteractiveMarkers, false);

            let isStillHoveringLocked = false;
            if (intersected) {
                const intersectedMarkers = intersects.map(hit => {
                    let parentGroup = hit.object;
                    while (parentGroup.parent && !parentGroup.userData.code) {
                        parentGroup = parentGroup.parent;
                    }
                    return parentGroup;
                });

                if (intersectedMarkers.includes(intersected)) {
                    isStillHoveringLocked = true;
                }
            }

            if (isStillHoveringLocked) {
                tooltip.style.left = `${event.clientX}px`;
                tooltip.style.top = `${event.clientY}px`;
                return;
            }

            let newTarget = null;
            if (intersects.length > 0) {
                let parentGroup = intersects[0].object;
                while (parentGroup.parent && !parentGroup.userData.code) {
                    parentGroup = parentGroup.parent;
                }
                newTarget = parentGroup;
            }

            intersected = newTarget;

            if (intersected) {
                container.style.cursor = 'pointer';
                tooltip.style.display = 'block';

                const userData = intersected.userData;
                const regionCode = userData.code;
                let tooltipText = `${userData.city}, ${userData.country}`;

                const count = serverCountsData[regionCode];
                if (typeof count === 'number') {
                    tooltipText += `<br><b>Servers: ${count.toLocaleString()}</b>`;
                }

                tooltip.innerHTML = tooltipText;
                tooltip.style.left = `${event.clientX}px`;
                tooltip.style.top = `${event.clientY}px`;
            } else {
                tooltip.style.display = 'none';
                container.style.cursor = 'grab';
            }
        }

        function onClick(event) {
            if (intersected && intersected.userData.code) {
                const regionCode = intersected.userData.code;
                const count = serverCountsData[regionCode];
                const hasServers = typeof count === 'number' && count > 0;
                if ((hasServers || easterEggActive) && regionCode !== 'BR') {
                    document.dispatchEvent(new CustomEvent('rovalraRegionSelected', {
                        detail: {
                            regionCode: regionCode
                        }
                    }));
                }
            }
        }

        const clock = new THREE.Clock();
        const cameraPosNorm = new THREE.Vector3();
        const markerPosNorm = new THREE.Vector3();
        const visibleMarkerScaleZoomedOut = 0.9;
        const visibleMarkerScaleZoomedIn = 1.5;
        const minHitboxScale = 1.0;
        const maxHitboxScale = 1.2;
        const rippleMultiplierZoomedIn = 2.0;
        const rippleMultiplierZoomedOut = 4.0;
        const baseRotateSpeed = 0.2;

        const animate = () => {
            requestAnimationFrame(animate);

            const elapsedTime = clock.getElapsedTime();
            const cameraDistance = camera.position.length();
            const zoomProgress = Math.max(0, Math.min(1,
                (cameraDistance - controls.minDistance) / (controls.maxDistance - controls.minDistance)
            ));
            const dynamicScale = visibleMarkerScaleZoomedIn - zoomProgress * (visibleMarkerScaleZoomedIn - visibleMarkerScaleZoomedOut);
            const rippleSizeMultiplier = rippleMultiplierZoomedIn + zoomProgress * (rippleMultiplierZoomedOut - rippleMultiplierZoomedIn);
            const hitboxScale = minHitboxScale + zoomProgress * (maxHitboxScale - minHitboxScale);
            const dynamicRotateSpeed = baseRotateSpeed * (cameraDistance / controls.minDistance);
            controls.rotateSpeed = dynamicRotateSpeed;

            const horizonCosine = globeRadius / cameraDistance;
            cameraPosNorm.copy(camera.position).normalize();

            const pulseDuration = 3.0;

            for (const marker of markers) {
                markerPosNorm.copy(marker.position).normalize();
                const dotProduct = cameraPosNorm.dot(markerPosNorm);
                marker.visible = dotProduct > horizonCosine;

                if (marker.visible) {
                    if (marker.children[0]) {
                        marker.children[0].scale.set(hitboxScale, hitboxScale, hitboxScale);
                    }
                    if (marker.children[1]) {
                        marker.children[1].scale.set(dynamicScale, dynamicScale, dynamicScale);
                    }

                    const {
                        code
                    } = marker.userData;
                    const count = serverCountsData[code];
                    let hasServers = typeof count === 'number' && count > 0;

                    if (easterEggActive) {
                        hasServers = true;
                    }

                    for (let i = 2; i < marker.children.length; i++) {
                        const ripple = marker.children[i];
                        if (hasServers) {
                            const rippleCount = marker.children.length - 2;
                            const delay = (i - 2) * (pulseDuration / rippleCount);
                            const rippleTime = ((elapsedTime + delay) % pulseDuration) / pulseDuration;
                            const scale = (1 + rippleTime * rippleSizeMultiplier) * dynamicScale;
                            ripple.scale.set(scale, scale, scale);
                            ripple.material.opacity = 0.8 * Math.pow(1 - rippleTime, 2);
                        } else {
                            ripple.material.opacity = 0;
                        }
                    }
                }
            }
            controls.autoRotate = !isMouseOver;
            controls.update();
            renderer.render(scene, camera);
        };



        const resizeObserver = new ResizeObserver(onContainerResize);
        resizeObserver.observe(container);

        onContainerResize();



        container.addEventListener('pointerdown', onPointerDown);
        container.addEventListener('mousemove', onMouseMove);
        const handleMouseEnter = () => {
            isMouseOver = true;
        };

        const handleMouseLeave = () => {
            isMouseOver = false;
            container.style.cursor = 'grab';
            tooltip.style.display = 'none';
            intersected = null;
        };

        container.addEventListener('mouseenter', handleMouseEnter);
        container.addEventListener('mouseleave', handleMouseLeave);

        document.addEventListener('rovalraGlobeOpened', () => {
            onContainerResize();
            if (lastCameraPosition && lastControlsTarget) {
                camera.position.copy(lastCameraPosition);
                controls.target.copy(lastControlsTarget);
            } else if (initialCameraPosition) {
                camera.position.copy(initialCameraPosition);
                controls.target.set(0, 0, 0);
            }
            controls.update();
        });

        setTimeout(() => {
            if (container.matches(':hover')) {
                handleMouseEnter();
            }
        }, 100);

        animate();
    }, {
        once: true
    });
})();