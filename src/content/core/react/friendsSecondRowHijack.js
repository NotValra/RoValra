(function () {
    'use strict';

    if (window.__ROVALRA_REACT_HOOK_SETUP__) return;
    window.__ROVALRA_REACT_HOOK_SETUP__ = true;

    let friendsSecondRowEnabled = false;

    document.addEventListener('rovalra-friends-second-row', (event) => {
        friendsSecondRowEnabled = event.detail?.enabled === true;
    });

    const onSet = (obj, prop, callback) => {
        if (obj[prop]) return callback(obj[prop]);

        let descriptor;
        try {
            descriptor = Object.getOwnPropertyDescriptor(obj, prop);
        } catch (e) {}

        Object.defineProperty(obj, prop, {
            enumerable: false,
            configurable: true,
            set(value) {
                delete obj[prop];
                try {
                    Object.defineProperty(obj, prop, descriptor);
                } catch (e) {}
                obj[prop] = value;
                callback(value);
            },
        });
    };

    // Minimal port of BTRoblox's reactHook utility: just enough to
    // intercept a specific component's render function (hijackConstructor)
    // and a specific useState call inside it (hijackUseState).
    const reactHook = {
        constructorProxies: new WeakMap(),
        constructorReplaces: [],
        renderTarget: null,

        hijackConstructor(filter, handler) {
            const info = {
                filter,
                handler,
                remove() {
                    this.removed = true;
                },
            };
            this.constructorReplaces.push(info);
            return info;
        },

        hijackUseState(filter, transform) {
            const renderTarget = this.renderTarget;
            if (!renderTarget) {
                throw new TypeError('RoValra: Not in a render method.');
            }
            if (!renderTarget.hijackState) renderTarget.hijackState = [];
            renderTarget.hijackState.push({ filter, transform });
        },

        nextConstructorReplace(render, index, thisArg, args) {
            for (; index < reactHook.constructorReplaces.length; index++) {
                const info = reactHook.constructorReplaces[index];

                if (info.removed) {
                    reactHook.constructorReplaces.splice(index--, 1);
                    continue;
                }

                if (info.filter(args[0])) {
                    return info.handler(
                        function (...innerArgs) {
                            return reactHook.nextConstructorReplace(
                                render,
                                index + 1,
                                this,
                                innerArgs,
                            );
                        },
                        thisArg,
                        args,
                    );
                }
            }

            return render.apply(thisArg, args);
        },

        renderProxyProps: {
            apply(render, thisArg, args) {
                if (reactHook.renderTarget) {
                    return reactHook.nextConstructorReplace(
                        render,
                        0,
                        thisArg,
                        args,
                    );
                }
                return render.apply(thisArg, args);
            },
        },

        applyProxy(fiber) {
            const type = fiber.type;
            if (!type) return;

            let target;
            let key;
            let render;

            if (typeof type === 'function') {
                if (type.prototype?.isReactComponent) {
                    target = type.prototype;
                    key = 'render';
                    render = type.prototype.render;
                } else {
                    target = fiber;
                    key = 'type';
                    render = type;
                }
            } else if (typeof type === 'object') {
                if (typeof type.render === 'function') {
                    target = type;
                    key = 'render';
                    render = type.render;
                } else if (typeof type.type === 'function') {
                    target = type;
                    key = 'type';
                    render = type.type;
                }
            }

            if (
                typeof render === 'function' &&
                !this.constructorProxies.get(render)
            ) {
                const proxy = new Proxy(render, this.renderProxyProps);
                this.constructorProxies.set(proxy, true);
                target[key] = proxy;
            }
        },

        onUseState(target, thisArg, args) {
            const renderTarget = this.renderTarget;
            if (!renderTarget) return target.apply(thisArg, args);

            const matching = [];

            if (renderTarget.hijackState) {
                for (const filter of renderTarget.hijackState) {
                    if (!filter.resolved && filter.filter(args[0])) {
                        filter.resolved = true;
                        if (filter.transform) {
                            args[0] = filter.transform(args[0], true);
                        }
                        matching.push(filter);
                    }
                }
            }

            const result = target.apply(thisArg, args);

            for (const filter of matching) {
                if (filter.transform) {
                    result[1] = new Proxy(result[1], {
                        apply(setState, setStateThis, setStateArgs) {
                            setStateArgs[0] = filter.transform(
                                setStateArgs[0],
                                false,
                            );
                            return setState.apply(setStateThis, setStateArgs);
                        },
                    });
                }
            }

            return result;
        },

        onReact(_react) {
            this.React = _react;

            const original = this.React.useState;
            this.React.useState = new Proxy(original, {
                apply: this.onUseState.bind(this),
            });

            const dispatcher =
                this.React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
                    .ReactCurrentDispatcher;
            let current = dispatcher.current;

            Object.defineProperty(Object.prototype, 'lanes', {
                configurable: true,
                get() {
                    return undefined;
                },
                set(value) {
                    Object.defineProperty(this, 'lanes', {
                        enumerable: true,
                        configurable: true,
                        writable: true,
                        value,
                    });

                    if (
                        'tag' in this &&
                        'pendingProps' in this &&
                        !this.rovalraAttached
                    ) {
                        this.rovalraAttached = true;
                        let type = this.type;
                        const fiber = this;

                        try {
                            reactHook.applyProxy(fiber);
                        } catch (e) {
                            console.error('RoValra:', e);
                        }

                        Object.defineProperty(fiber, 'type', {
                            configurable: true,
                            get() {
                                return type;
                            },
                            set(newType) {
                                type = newType;
                                try {
                                    reactHook.applyProxy(fiber);
                                } catch (e) {
                                    console.error('RoValra:', e);
                                }
                            },
                        });
                    }
                },
            });

            Object.defineProperty(dispatcher, 'current', {
                enumerable: true,
                get() {
                    return current;
                },
                set(value) {
                    current = value;

                    if (current && current.useCallback !== current.useEffect) {
                        reactHook.renderTarget = { state: [] };
                    } else {
                        reactHook.renderTarget = null;
                    }
                },
            });
        },

        init() {
            onSet(window, 'React', this.onReact.bind(this));
        },
    };

    reactHook.init();

    reactHook.hijackConstructor(
        (props) => props && 'friendsList' in props,
        (target, thisArg, args) => {
            const props = args[0];
            const friendsList = props.friendsList;
            const carouselName = props.carouselName;

            const showSecondRow =
                friendsSecondRowEnabled &&
                carouselName === 'WebHomeFriendsCarousel';

            if (showSecondRow) {
                reactHook.hijackUseState(
                    (value) => value === friendsList,
                    (value, initial) => {
                        if (value && friendsList && !initial) {
                            // Show twice as many friends as Roblox would
                            // have, +1 to account for the "Add friends" tile.
                            return friendsList.slice(0, value.length * 2 + 1);
                        }
                        return value;
                    },
                );
            }

            const result = target.apply(thisArg, args);

            if (showSecondRow) {
                try {
                    result.props.className =
                        `${result.props.className ?? ''} rovalra-friends-second-row-native`.trim();
                } catch (e) {}
            }

            return result;
        },
    );

    console.log('RoValra: Friends second row (native) hook loaded.');
})();