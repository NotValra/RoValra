// Prevents the script from removing stuff that it isnt meant to remove cuz thats bad and we no no want that (hazelnuts fault)
function isExcludedButton(button) {
    if (!button || typeof button.matches !== 'function') {
        return false;
    }
  
    return button.getAttribute('data-bind') === 'game-context-menu' &&
           button.classList.contains('rbx-menu-item') &&
           button.classList.contains('btn-generic-more-sm');
}


var buttonsToMonitor = {};

function checkAndRepositionButtons() {
    var buttonIds = Object.keys(buttonsToMonitor);
    if (buttonIds.length === 0) {
        return;
    }
    
    for (var i = 0; i < buttonIds.length; i++) {
        var buttonId = buttonIds[i];
        var buttonInfo = buttonsToMonitor[buttonId];
        
        if (!document.contains(buttonInfo.copyButton)) {
            delete buttonsToMonitor[buttonId];
            continue;
        }
        var shareButtons = [
            ...Array.from(buttonInfo.detailsElement.querySelectorAll('.share-button')),
            ...Array.from(buttonInfo.server.querySelectorAll('.share-button'))
        ];
        shareButtons.forEach(function(button) {

            if (!isExcludedButton(button)) { button.remove(); } 
        });
        
        var joinButton = buttonInfo.detailsElement.querySelector('.game-server-join-btn');
        if (joinButton) {
            joinButton.style.width = '100%';
        }
        
        var createServerLink = buttonInfo.detailsElement.querySelector('.create-server-link');
        if (createServerLink) {
            createServerLink.style.width = '100%';
            
            buttonInfo.copyButton.style.width = '100%';
            createServerLink.insertAdjacentElement('afterend', buttonInfo.copyButton);
            delete buttonsToMonitor[buttonId];
        } else {
            buttonInfo.attempts++;
            if (buttonInfo.attempts >= 10) {
                delete buttonsToMonitor[buttonId];
            }
        }
    }
}

var serverIdInterval = setInterval(function () {
    chrome.storage.local.get(['showfullserveridEnabled', 'inviteEnabled', 'enableFriendservers'], function(result) {
        var showFullId = result.showfullserveridEnabled !== false;
        var inviteEnabled = result.inviteEnabled !== false;
        var enableFriendservers = result.enableFriendservers !== false;
        
        if (!showFullId && !inviteEnabled) return;
        
        var shareButtons = document.querySelectorAll('.share-button, [class*="share-button"], [data-toggle="popover"], button[title*="Share"], a[title*="Share"], .rbx-friends-game-server-item .share-button, .rbx-friends-game-server-details .share-button');
        shareButtons.forEach(function(button) {
            if (!isExcludedButton(button)) { 
                button.remove();
            }
        });
        
        if (!showFullId && inviteEnabled) {
            var allServerElements = document.querySelectorAll('.rbx-public-game-server-item, .rbx-private-game-server-item, .rbx-friends-game-server-item');
            allServerElements.forEach(function(serverElement) {
                var serverShareButtons = serverElement.querySelectorAll('.share-button, [class*="share-button"], [data-toggle="popover"], button[title*="Share"], a[title*="Share"]');
                serverShareButtons.forEach(function(button) {
                     if (!isExcludedButton(button)) { 
                        button.remove();
                    }
                });
                
                var allElements = serverElement.querySelectorAll('button, a, [role="button"]');
                allElements.forEach(function(element) {
                    if (!isExcludedButton(element) && element.textContent && element.textContent.toLowerCase().includes('share') && 
                        !element.classList.contains('rovalra-copy-join-link') &&
                        !element.classList.contains('rovalra-vip-invite-link') &&
                        !element.classList.contains('rovalra-vip-new-invite-link')) {
                        element.remove();
                    }
                });
            });
        }
        
        if (inviteEnabled) {
            var regularJoinButtons = document.querySelectorAll('.rbx-public-game-server-item .game-server-join-btn, .rbx-private-game-server-item .game-server-join-btn');
            regularJoinButtons.forEach(function(button) {
                button.style.width = '100%';
            });
        }
        
        if (enableFriendservers) {
            var friendJoinButtons = document.querySelectorAll('.rbx-friends-game-server-item .game-server-join-btn');
            friendJoinButtons.forEach(function(button) {
                button.style.width = '100%';
            });
        }
        
        if (enableFriendservers) {
            var friendServers = document.querySelectorAll('.rbx-friends-game-server-item');
            friendServers.forEach(function(server) {
                cleanupServerUI(server, true);
            });
            
            var friendServerContainer = document.getElementById('rbx-friends-game-server-item-container');
            if (friendServerContainer) {
                var allButtons = friendServerContainer.querySelectorAll('button, a, [role="button"]');
                allButtons.forEach(function(button) {
                    if (!isExcludedButton(button) && button.textContent && button.textContent.toLowerCase().includes('share')) { 
                        button.remove();
                    }
                });
            }
            
            processServerElements('.rbx-friends-game-server-item', showFullId, inviteEnabled, true);
        }
        
        processServerElements('.rbx-public-game-server-item', showFullId, inviteEnabled);
        processServerElements('.rbx-private-game-server-item', showFullId, false);
        
        checkAndRepositionButtons();
    });
}, 300);

function processServerElements(selector, showFullId, inviteEnabled, checkPrivate = false) {
    var serverElements = document.querySelectorAll(selector);
    
    for (var i = 0; i < serverElements.length; i++) {
        var server = serverElements[i];
        
        if (selector === '.rbx-friends-game-server-item') {
            cleanupServerUI(server, true);
        } else {
            cleanupServerUI(server, false);
        }
        
        var serverId = server.getAttribute('data-rovalra-serverid');
        
        var vipServerId = server.getAttribute('data-rovalra-vipserverid');
        if (vipServerId && selector === '.rbx-private-game-server-item') {
            addVipServerInviteButton(server, vipServerId);
        }
        
        if (serverId && serverId.length > 0) {
            if (showFullId) {
                var serverIDTextElement = server.querySelector('.server-id-text.text-info.xsmall');
                
                if (serverIDTextElement) {
                    var displayedText = serverIDTextElement.textContent;
                    var displayedServerId = displayedText.replace('ID: ', '');
                    
                    if (displayedServerId !== serverId) {
                        serverIDTextElement.textContent = 'ID: ' + serverId;
                        serverIDTextElement.style.fontSize = '9px';
                        
                        server.setAttribute('data-rovalra-serverid-displayed', serverId);
                        
                        var existingCopyButton = server.querySelector('.rovalra-copy-join-link');
                        if (existingCopyButton) {
                            existingCopyButton.remove();
                        }
                        
                        var privateLabel = server.querySelector('.rovalra-private-server-label');
                        if (privateLabel) {
                            privateLabel.remove();
                        }
                        
                        if (inviteEnabled) {
                            addCopyJoinLinkButton(server, serverId, serverIDTextElement);
                        }
                    }
                }
            }
            
            if (checkPrivate) {
                server.setAttribute('data-rovalra-invite-enabled', inviteEnabled);
                checkIfServerIsPrivate(server, serverId);
            } else if (!showFullId) {
                if (inviteEnabled) {
                    addCopyJoinLinkButton(server, serverId);
                }
            }
        }
    }
}

function checkIfServerIsPrivate(server, serverId) {
    if (server.hasAttribute('data-rovalra-private-checked')) {
        if (server.getAttribute('data-rovalra-is-private') === 'false') {
            chrome.storage.local.get(['inviteEnabled', 'enableFriendservers', 'showfullserveridEnabled'], function(result) {
                var inviteEnabled = result.inviteEnabled !== false;
                var enableFriendservers = result.enableFriendservers !== false;
                var showFullId = result.showfullserveridEnabled !== false;
                
                if (inviteEnabled && enableFriendservers) {
                    if (showFullId) {
                        var serverIDTextElement = server.querySelector('.server-id-text.text-info.xsmall');
                        if (serverIDTextElement) {
                            addCopyJoinLinkButton(server, serverId, serverIDTextElement);
                            return;
                        }
                    }
                    addCopyJoinLinkButton(server, serverId);
                }
            });
        }
        return;
    }
    
    server.setAttribute('data-rovalra-private-checked', 'true');
    
    var placeId = server.getAttribute('data-placeid');
    if (!placeId) {
        var gameDetailsElement = document.querySelector('#game-detail-page');
        if (gameDetailsElement) {
            var placeIdMatch = window.location.href.match(/\/games\/(\d+)\//);
            if (placeIdMatch && placeIdMatch[1]) {
                placeId = placeIdMatch[1];
            }
        }
    }
    
    if (!placeId) return;
    
    var gameJoinAttemptId = createUUID();
    
    fetch('https://gamejoin.roblox.com/v1/join-game-instance', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            gameId: serverId,
            gameJoinAttemptId: gameJoinAttemptId,
            placeId: parseInt(placeId)
        }),
        credentials: 'include'
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 12 || 
            (data.message && data.message.includes("Can't join private instance"))) {
            
            server.setAttribute('data-rovalra-is-private', 'true');
            
            if (!server.querySelector('.rovalra-private-server-label')) {
                addPrivateServerLabel(server);
            }
            
            var existingCopyButton = server.querySelector('.rovalra-copy-join-link');
            if (existingCopyButton) {
                existingCopyButton.remove();
            }
        } else {
            server.setAttribute('data-rovalra-is-private', 'false');
            
            chrome.storage.local.get(['enableFriendservers', 'showfullserveridEnabled'], function(result) {
                var enableFriendservers = result.enableFriendservers !== false;
                var inviteEnabled = server.getAttribute('data-rovalra-invite-enabled') !== 'false';
                var showFullId = result.showfullserveridEnabled !== false;
                
                if (inviteEnabled && enableFriendservers) {
                    if (showFullId) {
                        var serverIDTextElement = server.querySelector('.server-id-text.text-info.xsmall');
                        if (serverIDTextElement) {
                            addCopyJoinLinkButton(server, serverId, serverIDTextElement);
                            return;
                        }
                    }
                    addCopyJoinLinkButton(server, serverId);
                }
            });
        }
    })
    .catch(function(error) {});
}

function createUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0,
            v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function addPrivateServerLabel(server) {
    if (server.classList.contains('rbx-friends-game-server-item')) {
        chrome.storage.local.get(['enableFriendservers'], function(result) {
            var enableFriendservers = result.enableFriendservers !== false;
            if (!enableFriendservers) {
                return;
            }
            createAndAddPrivateServerLabel(server);
        });
    } else {
        createAndAddPrivateServerLabel(server);
    }
}

function createAndAddPrivateServerLabel(server) {
    var label = document.createElement('div');
    label.className = 'text-info rbx-game-status rbx-friends-game-server-status text-overflow rovalra-private-server-label';
    label.textContent = 'Private Server';
    
    var isLightMode = document.querySelector('.rbx-body.light-theme') !== null;
    
    label.style.fontWeight = '600';
    label.style.fontSize = '18px';
    label.style.lineHeight = '1.4em';
    label.style.color = isLightMode ? 'rgb(32, 34, 39)' : 'rgb(247, 247, 248)';
    label.style.textOverflow = 'ellipsis';
    label.style.overflow = 'hidden';
    label.style.whiteSpace = 'nowrap';
    label.style.margin = '0';
    
    var joinButton = server.querySelector('.game-server-join-btn');
    if (joinButton) {
        joinButton.parentElement.insertBefore(label, joinButton);
    } else {
        var serverDetails = server.querySelector('.rbx-game-server-details');
        if (serverDetails) {
            serverDetails.appendChild(label);
        } else {
            server.appendChild(label);
        }
    }
}

function addCopyJoinLinkButton(server, serverId, serverIDTextElement = null) {
    if (server.classList.contains('rbx-friends-game-server-item')) {
        chrome.storage.local.get(['enableFriendservers'], function(result) {
            var enableFriendservers = result.enableFriendservers !== false;
            if (enableFriendservers) {
                createAndAddCopyJoinLinkButton(server, serverId, serverIDTextElement);
            }
        });
    } else {
        createAndAddCopyJoinLinkButton(server, serverId, serverIDTextElement);
    }
}


function createAndAddCopyJoinLinkButton(server, serverId, serverIDTextElement = null) {
    var existingButton = server.querySelector('.rovalra-copy-join-link');
    if (existingButton) {
        var buttonServerId = existingButton.getAttribute('data-serverid');
        if (buttonServerId === serverId) {
            return;
        }
        existingButton.remove();
    }
    
    var placeId = server.getAttribute('data-placeid');
    if (!placeId) {
        var gameDetailsElement = document.querySelector('#game-detail-page');
        if (gameDetailsElement) {
            var placeIdMatch = window.location.href.match(/\/games\/(\d+)\//);
            if (placeIdMatch && placeIdMatch[1]) {
                placeId = placeIdMatch[1];
            }
        }
    }
    
    if (!placeId) return;
    
    cleanupServerUI(server, server.classList.contains('rbx-friends-game-server-item'));
    
    var allServerShareButtons = server.querySelectorAll('.share-button, [class*="share-button"], [data-toggle="popover"], button[title*="Share"], a[title*="Share"]');
    allServerShareButtons.forEach(function(button) {
         if (!isExcludedButton(button)) { button.remove(); } 
    });
    
    var allElements = server.querySelectorAll('*');
    allElements.forEach(function(element) {
        if (!isExcludedButton(element) && element.textContent && element.textContent.toLowerCase().includes('share') && 
            element.tagName && (element.tagName.toLowerCase() === 'button' || element.tagName.toLowerCase() === 'a')) {
            element.remove();
        } else if (!isExcludedButton(element) && element.hasAttribute('aria-label') && element.getAttribute('aria-label').toLowerCase().includes('share')) { 
            element.remove();
        } else if (!isExcludedButton(element) && element.hasAttribute('title') && element.getAttribute('title').toLowerCase().includes('share')) {
            element.remove();
        }
    });
    
    var copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'btn-full-width btn-control-xs rbx-public-game-server-join btn-primary-md btn-min-width rovalra-copy-join-link';
    copyButton.textContent = 'Copy Join Link';
    copyButton.style.marginTop = '5px';
    copyButton.style.width = '100%';
    copyButton.setAttribute('data-serverid', serverId);
    copyButton.setAttribute('data-rovalra-button-id', 'copy-' + serverId);
    
    copyButton.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        var deepLink = 'roblox://experiences/start?placeId=' + placeId + '&gameInstanceId=' + serverId;
        
        navigator.clipboard.writeText(deepLink).then(function() {
            copyButton.textContent = 'Copied!';
            setTimeout(function() {
                copyButton.textContent = 'Copy Join Link';
            }, 2000);
        }).catch(function(err) {
            copyButton.textContent = 'Failed to copy';
            setTimeout(function() {
                copyButton.textContent = 'Copy Join Link';
            }, 2000);
        });
    });
    
    var buttonId = 'copy-' + serverId;
    
    if (server.classList.contains('rbx-friends-game-server-item')) {
        var detailsElement = server.querySelector('.rbx-friends-game-server-details.game-server-details');
        if (detailsElement) {
            var shareButtons = [
                ...Array.from(detailsElement.querySelectorAll('.share-button')), 
                ...Array.from(server.querySelectorAll('.share-button'))
            ];
            shareButtons.forEach(function(button) {
                if (!isExcludedButton(button)) { button.remove(); } 
            });
            
            chrome.storage.local.get(['enableFriendservers'], function(result) {
                var enableFriendservers = result.enableFriendservers !== false;
                if (enableFriendservers) {
                    var joinButton = detailsElement.querySelector('.game-server-join-btn');
                    if (joinButton) {
                        joinButton.style.width = '100%';
                    }
                }
            });
            
            if (serverIDTextElement && serverIDTextElement.closest('.rbx-friends-game-server-details.game-server-details')) {
                var container = serverIDTextElement.parentElement;
                if (!container.classList.contains('rovalra-server-id-container')) {
                    var newContainer = document.createElement('div');
                    newContainer.className = 'rovalra-server-id-container';
                    newContainer.style.display = 'flex';
                    newContainer.style.flexDirection = 'column';
                    newContainer.style.alignItems = 'flex-start';
                    newContainer.style.width = '100%';
                    
                    serverIDTextElement.parentElement.replaceChild(newContainer, serverIDTextElement);
                    newContainer.appendChild(serverIDTextElement);
                    container = newContainer;
                }
                
                container.appendChild(copyButton);
            } else {
                var createServerLink = detailsElement.querySelector('.create-server-link');
                if (createServerLink) {
                    createServerLink.style.width = '100%';
                    createServerLink.insertAdjacentElement('afterend', copyButton);
                } else {
                    detailsElement.appendChild(copyButton);
                    
                    buttonsToMonitor[buttonId] = {
                        server: server,
                        serverId: serverId,
                        detailsElement: detailsElement,
                        copyButton: copyButton,
                        attempts: 0
                    };
                }
            }
            return;
        }
    }
    
    if (serverIDTextElement) {
        var container = serverIDTextElement.parentElement;
        if (!container.classList.contains('rovalra-server-id-container')) {
            var newContainer = document.createElement('div');
            newContainer.className = 'rovalra-server-id-container';
            newContainer.style.display = 'flex';
            newContainer.style.flexDirection = 'column';
            newContainer.style.alignItems = 'flex-start';
            newContainer.style.width = '100%';
            
            serverIDTextElement.parentElement.replaceChild(newContainer, serverIDTextElement);
            
            newContainer.appendChild(copyButton);
            newContainer.appendChild(serverIDTextElement);
            container = newContainer;
        } else {
            container.insertBefore(copyButton, serverIDTextElement);
        }
    } else {
        var joinButton = server.querySelector('.game-server-join-btn');
        if (joinButton && joinButton.parentElement) {
            var allServerShareButtons = server.querySelectorAll('.share-button, [class*="share-button"], [data-toggle="popover"], button[title*="Share"], a[title*="Share"]');
            allServerShareButtons.forEach(function(button) {
                if (!isExcludedButton(button)) { button.remove(); } 
            });
            
            var parentElement = joinButton.parentElement;
            var parentShareButtons = parentElement.querySelectorAll('.share-button, [class*="share-button"], [data-toggle="popover"], button[title*="Share"], a[title*="Share"]');
            parentShareButtons.forEach(function(button) {
                if (!isExcludedButton(button)) { button.remove(); } 
            });
            
            chrome.storage.local.get(['inviteEnabled', 'enableFriendservers'], function(result) {
                var inviteEnabled = result.inviteEnabled !== false;
                var enableFriendservers = result.enableFriendservers !== false;
                
                if ((server.classList.contains('rbx-friends-game-server-item') && enableFriendservers) || 
                    (!server.classList.contains('rbx-friends-game-server-item') && inviteEnabled)) {
                    joinButton.style.width = '100%';
                }
            });
            
            joinButton.parentElement.appendChild(copyButton);
        } else {
            server.appendChild(copyButton);
        }
    }
}

function cleanupServerUI(server, isDeepClean) {
    var shareButtons = server.querySelectorAll('.share-button, [class*="share-button"], [data-toggle="popover"], button[title*="Share"], a[title*="Share"]');
    shareButtons.forEach(function(button) {
        if (!isExcludedButton(button)) { button.remove(); } 
    });
    
    var vipServerId = server.getAttribute('data-rovalra-vipserverid');
    if (vipServerId && server.classList.contains('rbx-private-game-server-item')) {
        addVipServerInviteButton(server, vipServerId);
    }
    
    chrome.storage.local.get(['inviteEnabled', 'enableFriendservers'], function(result) {
        var inviteEnabled = result.inviteEnabled !== false;
        var enableFriendservers = result.enableFriendservers !== false;
        
        if (isDeepClean) {
            if (enableFriendservers) {
                var joinButtons = server.querySelectorAll('.game-server-join-btn');
                joinButtons.forEach(function(button) {
                    button.style.width = '100%';
                });
            }
        } else {
            if (inviteEnabled) {
                var joinButtons = server.querySelectorAll('.game-server-join-btn');
                joinButtons.forEach(function(button) {
                    button.style.width = '100%';
                });
            }
        }
    });
    
    if (isDeepClean) {
        var detailsElement = server.querySelector('.rbx-friends-game-server-details.game-server-details');
        if (detailsElement) {
            var detailsShareButtons = detailsElement.querySelectorAll('.share-button, [class*="share-button"], [data-toggle="popover"], button[title*="Share"], a[title*="Share"]');
            detailsShareButtons.forEach(function(button) {
                if (!isExcludedButton(button)) { button.remove(); } 
            });
            
            var detailsJoinButton = detailsElement.querySelector('.game-server-join-btn');
            if (detailsJoinButton) {
                detailsJoinButton.style.width = '100%';
            }
            
            var createServerLink = detailsElement.querySelector('.create-server-link');
            if (createServerLink) {
                createServerLink.style.width = '100%';
            }
            
            var parentElement = detailsElement.parentElement;
            if (parentElement) {
                var parentShareButtons = parentElement.querySelectorAll('.share-button, [class*="share-button"], [data-toggle="popover"], button[title*="Share"], a[title*="Share"]');
                parentShareButtons.forEach(function(button) {
                    if (!isExcludedButton(button)) { button.remove(); } 
                });
            }
            
            var siblings = [];
            if (detailsElement.parentElement) {
                siblings = Array.from(detailsElement.parentElement.children);
            }
            siblings.forEach(function(sibling) {
                if (sibling !== detailsElement) {
                    var siblingShareButtons = sibling.querySelectorAll('.share-button, [class*="share-button"], [data-toggle="popover"], button[title*="Share"], a[title*="Share"]');
                    siblingShareButtons.forEach(function(button) {
                        if (!isExcludedButton(button)) { button.remove(); } 
                    });
                }
            });
            
            var allButtons = detailsElement.querySelectorAll('button, a');
            allButtons.forEach(function(button) {
                if (!isExcludedButton(button) && button.textContent && button.textContent.toLowerCase().includes('share')) { 
                    button.remove();
                }
            });
        }
    }
}

var shareBtnCleanupInterval = setInterval(function() {
    chrome.storage.local.get(['enableFriendservers', 'inviteEnabled'], function(result) {
        var enableFriendservers = result.enableFriendservers !== false;
        var inviteEnabled = result.inviteEnabled !== false;
        
        var allShareButtons = document.querySelectorAll('.share-button, [class*="share-button"], [data-toggle="popover"], button[title*="Share"], a[title*="Share"]');
        allShareButtons.forEach(function(button) {
            if (!isExcludedButton(button)) { button.remove(); } 
        });
        
        var privateServers = document.querySelectorAll('.rbx-private-game-server-item');
        privateServers.forEach(function(server) {
            var vipServerId = server.getAttribute('data-rovalra-vipserverid');
            if (vipServerId) {
                addVipServerInviteButton(server, vipServerId);
            }
        });
        
        if (inviteEnabled) {
            var regularJoinButtons = document.querySelectorAll('.rbx-public-game-server-item .game-server-join-btn, .rbx-private-game-server-item .game-server-join-btn');
            regularJoinButtons.forEach(function(button) {
                button.style.width = '100%';
            });
        }
        
        if (enableFriendservers) {
            var friendJoinButtons = document.querySelectorAll('.rbx-friends-game-server-item .game-server-join-btn');
            friendJoinButtons.forEach(function(button) {
                button.style.width = '100%';
            });
        }
        
        if (enableFriendservers) {
            var friendServers = document.querySelectorAll('.rbx-friends-game-server-item');
            friendServers.forEach(function(server) {
                cleanupServerUI(server, true);
            });
            
            var friendServerContainer = document.getElementById('rbx-friends-game-server-item-container');
            if (friendServerContainer) {
                var containerShareButtons = friendServerContainer.querySelectorAll('.share-button, [class*="share-button"], [data-toggle="popover"], button[title*="Share"], a[title*="Share"]');
                containerShareButtons.forEach(function(button) {
                    if (!isExcludedButton(button)) { button.remove(); } 
                });
                
                var allButtons = friendServerContainer.querySelectorAll('button, a, [role="button"]');
                allButtons.forEach(function(button) {
                    if (!isExcludedButton(button) && button.textContent && button.textContent.toLowerCase().includes('share')) { 
                        button.remove();
                    }
                });
            }
            
            var possibleShareElements = document.querySelectorAll('a[class*="share"], button[class*="share"], div[class*="share"], [aria-label*="share"], [title*="Share"]');
            possibleShareElements.forEach(function(element) {
                if (!isExcludedButton(element) && element.textContent && element.textContent.toLowerCase().includes('share')) { 
                    element.remove();
                }
            });
            
            var popoverContainers = document.querySelectorAll('[data-original-title], .popover, .tooltip');
            popoverContainers.forEach(function(container) {
                if (container.textContent && container.textContent.toLowerCase().includes('share')) {
                    container.remove();
                }
            });
        }
    });
}, 200);

function setupShareButtonObserver() {
    var containers = [
        document.getElementById('rbx-friends-game-server-item-container'),
        document.body
    ].filter(Boolean);
    
    var shareButtonObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.addedNodes && mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) {
                        if (!isExcludedButton(node) && node.classList && ( 
                            node.classList.contains('share-button') || 
                            node.className.indexOf('share') !== -1 || 
                            (node.hasAttribute('data-toggle') && node.getAttribute('data-toggle') === 'popover')
                        )) {
                            node.remove();
                        }
                        
                        var shareButtons = node.querySelectorAll('.share-button, [class*="share-button"], [data-toggle="popover"], button[title*="Share"], a[title*="Share"]');
                        shareButtons.forEach(function(button) {
                            if (!isExcludedButton(button)) { button.remove(); } 
                        });
                          if (node.classList && node.classList.contains('rbx-friends-game-server-item')) {
                            cleanupServerUI(node, true);
                            
                            setTimeout(function() {
                                cleanupServerUI(node, true);
                            }, 50);
                        }
                        
                        if (node.classList && node.classList.contains('rbx-private-game-server-item')) {
                            var vipServerId = node.getAttribute('data-rovalra-vipserverid');
                            if (vipServerId) {
                                addVipServerInviteButton(node, vipServerId);
                            }
                        }
                        
                        chrome.storage.local.get(['inviteEnabled', 'enableFriendservers'], function(result) {
                            var inviteEnabled = result.inviteEnabled !== false;
                            var enableFriendservers = result.enableFriendservers !== false;
                            
                            if (node.classList && node.classList.contains('rbx-friends-game-server-item')) {
                                if (enableFriendservers) {
                                    var friendJoinButtons = node.querySelectorAll('.game-server-join-btn');
                                    friendJoinButtons.forEach(function(button) {
                                        button.style.width = '100%';
                                    });
                                }
                            } else {
                                if (inviteEnabled) {
                                    var regularJoinButtons = node.querySelectorAll('.game-server-join-btn');
                                    regularJoinButtons.forEach(function(button) {
                                        button.style.width = '100%';
                                    });
                                }
                            }
                        });
                    }
                });
            }
        });
    });
    
    containers.forEach(function(container) {
        shareButtonObserver.observe(container, { 
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
    });
}

let vipStatusCache = {}; 

function addVipServerInviteButton(server, vipServerId) {

    const cachedStatus = vipStatusCache[vipServerId];
    if (cachedStatus === 'pending') { return; }
    const existingButtonContainer = server.querySelector('.rovalra-vip-buttons-container[data-vipserverid="' + vipServerId + '"]');
    if (existingButtonContainer) { if (cachedStatus !== 'success') { vipStatusCache[vipServerId] = 'success'; } return; }
    if (cachedStatus === 'no-link' || cachedStatus === 'error') { let container = server.querySelector('.rovalra-vip-buttons-container'); if (container) container.remove(); return; }
    let oldContainer = server.querySelector('.rovalra-vip-buttons-container');
    if (oldContainer) { oldContainer.remove(); }
    server.querySelectorAll('.rovalra-vip-invite-link, .rovalra-vip-new-invite-link').forEach(btn => btn.remove());
    vipStatusCache[vipServerId] = 'pending';    function getCsrfToken() {
            return new Promise((resolve, reject) => {
                if (typeof Roblox !== 'undefined' && Roblox.CSRF && typeof Roblox.CSRF.getToken === 'function') {
                    const token = Roblox.CSRF.getToken();
                    if (token) {                    resolve(token);
                    return;
                }
            }
    
            try { 
                const metaTokenElement = document.head.querySelector("meta[name='csrf-token']");
                if (metaTokenElement) {
                    const token = metaTokenElement.getAttribute('data-token');
                    if (token) {                        resolve(token);
                        return;
                    }
                }            } catch (e) {
            }
    
            fetch('https://auth.roblox.com/v2/logout', { 
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'include' 
            })
            .then(response => { 
                const csrfTokenFromHeader = response.headers.get('x-csrf-token');
                if (csrfTokenFromHeader) {                    resolve(csrfTokenFromHeader);                } else {
                    reject('CSRF token refresh failed: Header not found after auth ping. Status: ' + response.status);
                }
            })            .catch(error => {
                reject('CSRF token refresh fetch error: ' + error.message);
            });
        });
    }
    function fetchVipServerDataInternal() {
        fetch('https://games.roblox.com/v1/vip-servers/' + vipServerId, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            credentials: 'include'
        })
        .then(response => {            if (!response.ok) {
            }
            return response.json();
        })
        .then(data => {            if (vipStatusCache[vipServerId] !== 'pending') {
                return;
            }
            let inviteLinkString = null;
            if (data && data.link) {
                if (typeof data.link === 'string') {
                    inviteLinkString = data.link;
                } else if (typeof data.link === 'object' && data.link.link && typeof data.link.link === 'string') {
                    inviteLinkString = data.link.link;
                }
            }
            if (inviteLinkString) {
                chrome.storage.local.get(['privateserverlink'], function(result) {
                    if (result.privateserverlink === true) {                        vipStatusCache[vipServerId] = 'success';
                        const initialInviteLink = inviteLinkString;
                        const buttonContainer = document.createElement('div');
                        buttonContainer.className = 'rovalra-vip-buttons-container';
                        buttonContainer.setAttribute('data-vipserverid', vipServerId); 
                        buttonContainer.style.display = 'flex';
                        buttonContainer.style.flexDirection = 'column';
                        buttonContainer.style.gap = '5px';
                        buttonContainer.style.marginTop = '5px';
                        const copyButton = document.createElement('button');
                        copyButton.type = 'button';
                        copyButton.className = 'btn-full-width btn-control-xs rbx-public-game-server-join btn-primary-md btn-min-width rovalra-vip-invite-link';
                        copyButton.textContent = 'Copy Invite Link';
                        copyButton.setAttribute('data-clipboard-text', initialInviteLink);
                        copyButton.setAttribute('data-vipserverid', vipServerId);
                        copyButton.addEventListener('click', function(e) {
                            e.preventDefault();
                            e.stopPropagation();
                            const linkToCopy = this.getAttribute('data-clipboard-text');
                            navigator.clipboard.writeText(linkToCopy).then(() => {
                                this.textContent = 'Copied!';
                                setTimeout(() => { this.textContent = 'Copy Invite Link'; }, 2000);
                            }).catch(err => {
                                this.textContent = 'Failed to copy';
                                console.error('Failed to copy VIP link:', err);
                                setTimeout(() => { this.textContent = 'Copy Invite Link'; }, 2000);
                            });
                        });
                        buttonContainer.appendChild(copyButton);
                        const generateButton = document.createElement('button');
                        generateButton.type = 'button';
                        generateButton.className = 'btn-full-width btn-control-xs rbx-public-game-server-join btn-secondary-md btn-min-width rovalra-vip-new-invite-link';
                        generateButton.textContent = 'Generate New Invite Link';
                        generateButton.setAttribute('data-vipserverid', vipServerId);
                        generateButton.addEventListener('click', function(e) {
                            e.preventDefault();
                            e.stopPropagation();
                            this.textContent = 'Generating...';
                            this.disabled = true;
                            getCsrfToken().then(csrfToken => {
                                fetch('https://games.roblox.com/v1/vip-servers/' + vipServerId, {
                                    method: 'PATCH',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'X-CSRF-TOKEN': csrfToken,
                                        'Accept': 'application/json'
                                    },
                                    body: JSON.stringify({ newJoinCode: true }),
                                    credentials: 'include'
                                })
                                .then(response => {
                                    if (!response.ok) {
                                        return response.json().then(errData => {
                                            throw { status: response.status, data: errData, message: `HTTP error ${response.status}` };
                                        }).catch(() => {
                                             throw { status: response.status, data: {}, message: `HTTP error ${response.status}, no JSON body` };
                                        });
                                    }
                                    return response.json();
                                })
                                .then(patchData => { 
                                    let newGeneratedLinkString = null;
                                    if (patchData && patchData.link) {
                                        if (typeof patchData.link === 'string') {
                                            newGeneratedLinkString = patchData.link;
                                        } else if (typeof patchData.link === 'object' && patchData.link.link && typeof patchData.link.link === 'string') {
                                            newGeneratedLinkString = patchData.link.link;
                                        }
                                    }
                                    if (newGeneratedLinkString) {
                                        const newGeneratedLink = newGeneratedLinkString;
                                        copyButton.setAttribute('data-clipboard-text', newGeneratedLink);
                                        copyButton.textContent = 'Copy Invite Link';
                                        this.textContent = 'Generated!';
                                        setTimeout(() => {
                                            this.textContent = 'Generate New Invite Link';
                                            this.disabled = false;
                                        }, 2000);
                                    } else {
                                        console.error('PATCH success but no valid link structure in response for ' + vipServerId, patchData);
                                        this.textContent = 'Error (No Link Data)';                                        setTimeout(() => {
                                            this.textContent = 'Generate New Invite Link';
                                            this.disabled = false;
                                        }, 3000);
                                    }
                                })
                                .catch(error => {
                                    console.error('Error generating new VIP link for ' + vipServerId + ':', error);
                                    this.textContent = 'Error Generating';
                                    if (error && error.data && error.data.errors && error.data.errors.length > 0) {
                                        console.error('Specific errors:', error.data.errors[0].message);
                                        if (error.data.errors[0].message.toLowerCase().includes("configure")) {
                                             this.textContent = 'Error (Configure Page)';
                                        }
                                    } else if (error && error.status === 403) {
                                        this.textContent = 'Error (Forbidden)';
                                    }
                                    setTimeout(() => {
                                        this.textContent = 'Generate New Invite Link';
                                        this.disabled = false;
                                    }, 3000);
                                });
                            }).catch(csrfError => {
                                console.error('CSRF token error for VIP link generation:', csrfError);
                                this.textContent = 'Error (CSRF)';
                                setTimeout(() => {
                                    this.textContent = 'Generate New Invite Link';
                                    this.disabled = false;
                                }, 3000);
                            });
                        });
                        buttonContainer.appendChild(generateButton);
                        var joinButton = server.querySelector('.game-server-join-btn');
                        var serverDetails = server.querySelector('.rbx-game-server-details, .rbx-friends-game-server-details');
                        if (joinButton && joinButton.parentElement) {
                            joinButton.parentElement.appendChild(buttonContainer);
                        } else if (serverDetails) {
                            serverDetails.appendChild(buttonContainer);
                        } else {
                            server.appendChild(buttonContainer);
                        }                    } else {
                        vipStatusCache[vipServerId] = 'no-link';
                        let container = server.querySelector('.rovalra-vip-buttons-container');
                        if (container) container.remove();
                    }
                });            } else {
                vipStatusCache[vipServerId] = 'no-link';
                let container = server.querySelector('.rovalra-vip-buttons-container');
                if (container) container.remove();
            }
        })
        .catch(function(error) {
            if (vipStatusCache[vipServerId] === 'pending') {
                vipStatusCache[vipServerId] = 'error';
            }            console.error('Error fetching VIP server data for ' + vipServerId + ':', error);
            let container = server.querySelector('.rovalra-vip-buttons-container');
            if (container) container.remove();
        });
    }
    fetchVipServerDataInternal(); 
}



function aggressiveShareButtonRemoval() {
    chrome.storage.local.get(['showfullserveridEnabled', 'inviteEnabled', 'enableFriendservers'], function(result) {
        var showFullId = result.showfullserveridEnabled !== false;
        var inviteEnabled = result.inviteEnabled !== false;
        var enableFriendservers = result.enableFriendservers !== false;
        
        if (!showFullId && inviteEnabled) {
            var allShareButtons = document.querySelectorAll('.share-button, [class*="share-button"], [data-toggle="popover"], button[title*="Share"], a[title*="Share"]');
            allShareButtons.forEach(function(button) {
                if (!isExcludedButton(button)) { button.remove(); } 
            });
            
            var serverContainers = document.querySelectorAll('.rbx-public-game-server-item, .rbx-private-game-server-item, .rbx-friends-game-server-item');
            serverContainers.forEach(function(container) {
                var containerShareButtons = container.querySelectorAll('.share-button, [class*="share-button"], [data-toggle="popover"], button[title*="Share"], a[title*="Share"]');
                containerShareButtons.forEach(function(button) {
                    if (!isExcludedButton(button)) { button.remove(); } 
                });
                
                var allElements = container.querySelectorAll('button, a, [role="button"]');
                allElements.forEach(function(element) {
                    if (!isExcludedButton(element) && element.textContent && element.textContent.toLowerCase().includes('share') && 
                        !element.classList.contains('rovalra-copy-join-link') &&
                        !element.classList.contains('rovalra-vip-invite-link') &&
                        !element.classList.contains('rovalra-vip-new-invite-link')) {
                        element.remove();
                    }
                });
            });
        }
    });
}

var aggressiveRemovalInterval = setInterval(aggressiveShareButtonRemoval, 100);