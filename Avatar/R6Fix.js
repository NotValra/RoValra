(function() {
    if (!window.location.href.includes('/my/avatar')) {
        return;
    }
    const currentURL = window.location.href;
    const languageMatch = currentURL.match(/https:\/\/www\.roblox\.com\/([a-z]{2}(-[A-Z]{2})?)\//);
    let languagePrefix = '';
    console.log(languageMatch[0])
    if (languageMatch && languageMatch[0]) {
          if(languageMatch[1] !== "my")
          {
               languagePrefix = `/${languageMatch[0]}`;
          }
    }
    

    const dynamicHeadsSelector = 'span.ng-binding';
    const avatarPageURL = `${languagePrefix}/my/avatar`;
    const avatarAPIURL = 'https://avatar.roblox.com/v1/avatar';
    const setAvatarTypeAPIURL = 'https://avatar.roblox.com/v1/avatar/set-player-avatar-type';
    const thumbnailLoaderSelector = 'div[ng-if="isThumbnailLoading"].thumbnail-loader.ng-scope';
    const dynamicHeadsContainerSelector = 'div.container-of-dynamic-heads';
    const refreshButtonSelector = '#refreshAvatar';
     const fallbackRefreshButtonSelector = 'a.text-link.ng-binding[ng-click="redrawThumbnail()"]';

    let observer = null;
    let lastDynamicHeadsNode = null;
    let isR6 = false;
    let canDetectThumbnails = false;
    let csrfToken = null;
    let lastThumbnailLoader = null;
    let isSettingAvatar = false;
    let isObserverActive = false;
    let csrfPromise = null;
    let isClickingRefresh = false;
    let isAvatarSetting = false;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    let refreshClickHandled = false;
    let isOnHeadsPage = false;

   function extractCSRFTokenFromCookie() {
        const cookieString = document.cookie;
        const cookies = cookieString.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.startsWith('rbx-csrf-token=')) {
                return cookie.substring('rbx-csrf-token='.length);
            }
        }
        return null;
    }

    function extractCSRFTokenFromHTML(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const metaTag = doc.querySelector('meta[name="csrf-token"]');

        if (metaTag) {
            return metaTag.getAttribute('data-token');
        }
        return null;
    }

     async function fetchCSRFToken() {
        if (csrfPromise) {
            return csrfPromise;
        }
        csrfPromise = new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', avatarPageURL, true);
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    const token = extractCSRFTokenFromHTML(xhr.responseText);
                    if (token) {
                        resolve(token);
                        csrfPromise = null;
                    } else {
                        reject(new Error('Could not extract csrf token from html'));
                        csrfPromise = null;
                    }
                } else {
                    reject(new Error(`Failed to fetch avatar page for csrf token with status ${xhr.status}`));
                    csrfPromise = null;
                }
            };
            xhr.onerror = () => {
                reject(new Error('Failed to fetch avatar page for csrf token'));
                csrfPromise = null;
            };
            xhr.send();
        });
        return csrfPromise;
    }


   async function setAvatarTypeToR6() {
         if (!isOnHeadsPage) {
             return;
         }
         if (isSettingAvatar || isAvatarSetting) {
            return;
        }
         isAvatarSetting = true;
        isSettingAvatar = true;
        try {
            if (!csrfToken) {
               try {
                   csrfToken = await fetchCSRFToken();

                } catch (e) {
                    return;
               }
            }
            if (!csrfToken) {
                return;
           }
            const response = await fetch(setAvatarTypeAPIURL, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'x-csrf-token': csrfToken
                },
                body: JSON.stringify({ playerAvatarType: "R6" })
           });

            if (!response.ok) {
                const errorText = await response.text();
                 throw new Error(`setAvatarTypeToR6 API request failed with status: ${response.status}`);
            }

           const data = await response.json();

        disconnectObserver();
         setupObserver();

      } catch (error) {
       } finally {
           isSettingAvatar = false;
            isAvatarSetting = false;
       }
   }


    function retryMakeAvatarRequest(isSecondRequest = false) {
          if (!isOnHeadsPage) {
            return;
        }
        if (retryCount < MAX_RETRIES) {
            retryCount++;
            makeAvatarRequest(isSecondRequest);
        } else {
            retryCount = 0;
        }
    }


  function makeAvatarRequest(isSecondRequest = false) {
          if (!isOnHeadsPage) {
            return Promise.resolve();
        }
        if (isAvatarSetting) {
            return Promise.resolve();
        }


        return fetch(avatarAPIURL, {
            method: 'GET',
            credentials: 'include',
        }).then(response => {
            if (!response.ok) {
                return response.text().then(errorText => {
                });
           }
            return response.json()
                 .then(data => {
                    if (typeof data === 'object' && data !== null && data.playerAvatarType) {
                         isR6 = data.playerAvatarType === 'R6';
                        canDetectThumbnails = isR6;
                       if (isSecondRequest && !isR6) {
                            return setAvatarTypeToR6();
                       }

                    } else {
                        isR6 = false;
                        canDetectThumbnails = false;
                  }
               }).catch(e => {
                    return response.text().then(textData => {
                       isR6 = false;
                       canDetectThumbnails = false;
                  });
              });

        }).then(() => {
            if (isSecondRequest) {
                if (!isR6) {
                     retryMakeAvatarRequest(true);
                } else {
                     retryCount = 0;
                }
           }
        }).catch(error => {
            isR6 = false;
            canDetectThumbnails = false;
           if(isSecondRequest) {
               retryMakeAvatarRequest(true);
            }

        });
    }



    function checkDynamicHeadsPage(node) {
        const spanElements = Array.from(document.querySelectorAll(dynamicHeadsSelector));
        const headsElement = spanElements.find(span => span.textContent.trim() === "Heads");
        if (headsElement && headsElement !== lastDynamicHeadsNode) {
            lastDynamicHeadsNode = headsElement;
             isOnHeadsPage = true;
            makeAvatarRequest();
            return true;
        }
        if (!headsElement && lastDynamicHeadsNode) {
            lastDynamicHeadsNode = null;
            isOnHeadsPage = false;
        }
       return false;
    }

    function clickRefreshButton() {
        if (isClickingRefresh || refreshClickHandled) {
            return;
        }

        isClickingRefresh = true;
          let refreshButton = document.querySelector(refreshButtonSelector);
        if (!refreshButton) {
             refreshButton = document.querySelector(fallbackRefreshButtonSelector);
              if (!refreshButton){
                   isClickingRefresh = false;
                  return;
            }
        }


         if (refreshButton) {
            refreshButton.click();
              refreshClickHandled = true;
            setTimeout(() => {
                isClickingRefresh = false;
                 refreshClickHandled = false;
            }, 200);
        } else {
              isClickingRefresh = false;
        }
    }


    function checkUserAvatarChange(node) {
          if (!isOnHeadsPage) {
            return;
        }
       const thumbnailLoader = document.querySelector(thumbnailLoaderSelector);
       if (thumbnailLoader && canDetectThumbnails && thumbnailLoader !== lastThumbnailLoader) {
           lastThumbnailLoader = thumbnailLoader;
          makeAvatarRequest(true);
        } else if (!thumbnailLoader) {
           lastThumbnailLoader = null;
       }
   }

    function setupObserver() {
        if (isObserverActive) {
            return;
       }
        isObserverActive = true;
        lastDynamicHeadsNode = null;
        lastThumbnailLoader = null;


        const targetNode = document.querySelector(dynamicHeadsContainerSelector) || document.body;
       if (!targetNode) {
       }

        observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                   mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1 && node.matches(dynamicHeadsSelector)) {
                            if (checkDynamicHeadsPage(node)) {

                            }
                        }
                        if (node.nodeType === 1) {
                            if (checkDynamicHeadsPage(node)) {
                           }
                        }
                      if (node.nodeType === 1 && node.matches(thumbnailLoaderSelector)) {
                         checkUserAvatarChange(node);
                       }
                    });
                }
               if (mutation.type === 'attributes') {
                    if (mutation.target.nodeType === 1 && mutation.target.matches(dynamicHeadsSelector)) {
                        if (checkDynamicHeadsPage(mutation.target)) {

                        }
                    }
                }
            }
       });
       observer.observe(targetNode, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
   }


   function disconnectObserver() {
        clickRefreshButton();
        if (observer) {
            observer.disconnect();
            observer = null;
            isObserverActive = false;
         } else {
        }
   }


   document.addEventListener('click', function(event) {
      if (event.target.matches(refreshButtonSelector) || event.target.matches(fallbackRefreshButtonSelector)) {
           clickRefreshButton();
          }
   });

    setupObserver();
})();