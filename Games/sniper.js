
const REQUEST_LIMIT = 5;
let requestQueue = [];
let lastRequestTime = 0;
let isRateLimited = false;
let rateLimitStartTime = 0;
async function delayRequest() {
  return new Promise(resolve => {
    if (requestQueue.length >= REQUEST_LIMIT) {
      const timeToWait = (requestQueue[0] + 1000) - Date.now()
      if (timeToWait > 0) {
        setTimeout(resolve, timeToWait)
      } else {
        requestQueue.shift();
        resolve()
      }

    } else {
      resolve()
    }

  })
}
function recordRequest() {
  requestQueue.push(Date.now())
  if (requestQueue.length > REQUEST_LIMIT) {
    requestQueue.shift()
  }
}

function getPlaceIdFromUrl() {
  const url = window.location.href;
  const regex = /https:\/\/www\.roblox\.com\/(?:[a-z]{2}\/)?games\/(\d+)/;
  const match = url.match(regex);


  if (match && match[1]) {
    return match[1];
  } else {
    return null;
  }
}

async function fetchServers(placeId, initialImageUrl, updateRequestCount, updateRateLimitCount, onServerFound, onComplete, isCancelledRef) {
  if (!placeId) {
    return;
  }


  let nextPageCursor = null;
  let found = false;
  let requestCount = 0;
    let currentRequestCount = 0;

  while (!found) {
        if (isCancelledRef.current) {
             if(onComplete){
                onComplete()
              }
            return;
        }
    const timeSinceLastRequest = Date.now() - lastRequestTime;
    let minDelay = 100; 
    let maxDelay = 100; 
    const jitter = Math.random() * (maxDelay - minDelay) + minDelay;
    if (timeSinceLastRequest < jitter && !isRateLimited) {
      const waitTime = jitter - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    let url = `https://games.roblox.com/v1/games/${placeId}/servers/Public?limit=100`;
    if (nextPageCursor) {
      url += `&cursor=${nextPageCursor}`;
    }

    let retries = 0;
    const maxRetries = 5;
    while (retries <= maxRetries) {
         if (isCancelledRef.current) {
             if(onComplete){
                onComplete()
              }
            return;
        }
        let isRateLimitedOnThisRequest = false
        await delayRequest();
        recordRequest();
       
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            "Cache-Control": "no-cache"
          },
        });


        if (response.status === 429) {
          if (!isRateLimited) {
            isRateLimited = true;
            rateLimitStartTime = Date.now()
             if(updateRateLimitCount) {
              updateRateLimitCount();
            }
            isRateLimitedOnThisRequest = true
            console.warn("Too many server requests, attempting to spam until un-rate-limited.");
          }
          const delay = Math.random() * 1000 + 2300; 
          await new Promise(resolve => setTimeout(resolve, delay));
          retries++;
          continue;
        }

        if (isRateLimited) {
          const timeUnRateLimited = (Date.now() - rateLimitStartTime) / 1000
          isRateLimited = false;
          rateLimitStartTime = 0;
        }

        if (!response.ok) {
          return;
        }
          currentRequestCount++;
        if(!isRateLimitedOnThisRequest){
           requestCount++;
           if(updateRequestCount){
            updateRequestCount(requestCount);
            }
          }


        const data = await response.json();

        if (data && data.data) {
          const thumbnailResult = await fetchThumbnails(data.data, initialImageUrl, updateRateLimitCount, isCancelledRef);
            if (thumbnailResult && typeof thumbnailResult === 'object' && thumbnailResult.status === "FOUND") {
                found = true;
                if(onServerFound){
                 onServerFound(thumbnailResult.requestId);
                }
                return;
          }
        }
        nextPageCursor = data.nextPageCursor;
        if (!nextPageCursor) {
           if(onComplete){
                onComplete()
              }
          return;
        }
        retries = maxRetries + 1;
      } catch (error) {
        console.error("Error fetching servers:", error);
          if(onComplete){
             onComplete()
          }
        return;
      }
    }
    lastRequestTime = Date.now();
  }
}


async function fetchThumbnails(servers, initialImageUrl, updateRateLimitCount, isCancelledRef) {
    if (!servers || servers.length === 0) {
        return null;
    }

    let allThumbnailPayload = [];
    for (const server of servers) {
        if (server.playerTokens && server.playerTokens.length > 0) {
            const serverPayload = server.playerTokens.map(token => ({
                token: token,
                type: "AvatarHeadshot",
                size: "150x150",
                requestId: server.id
            }));
            allThumbnailPayload.push(...serverPayload);
        }
    }

    if (allThumbnailPayload.length === 0) {
        return null;
    }

    const BATCH_SIZE = 100;
    let allThumbnailResponses = [];
    const fetchPromises = [];
    for (let i = 0; i < allThumbnailPayload.length; i += BATCH_SIZE) {
        const batch = allThumbnailPayload.slice(i, i + BATCH_SIZE);

        const fetchPromise = new Promise(async (resolve) => {
            let retries = 0
            const maxRetries = 5
            while (retries <= maxRetries) {
                 if (isCancelledRef.current) {
                     resolve();
                    return;
                }
                let isRateLimitedOnThisRequest = false
                await delayRequest();
                recordRequest()
                try {
                    const response = await fetch("https://thumbnails.roblox.com/v1/batch", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                        },
                        body: JSON.stringify(batch),
                    });
                    if (response.status === 429) {
                          if (!isRateLimited) {
                            isRateLimited = true;
                            rateLimitStartTime = Date.now()
                              if(updateRateLimitCount) {
                              updateRateLimitCount();
                            }
                              isRateLimitedOnThisRequest = true
                            console.warn("Too many requests, waiting:", delay / 1000, "seconds. Retry:", retries + 1);
                        }
                        const delay = Math.random() * 2000 + 3000; 
                         await new Promise(resolve => setTimeout(resolve, delay));
                        retries++;
                        continue
                    }

                       if (isRateLimited) {
                            const timeUnRateLimited = (Date.now() - rateLimitStartTime) / 1000
                            isRateLimited = false;
                            rateLimitStartTime = 0;
                         }
                    if (!response.ok) {
                        console.error("Failed to fetch thumbnail batch:", response.status, response.statusText);
                        resolve()
                        return;
                    }


                    const data = await response.json();
                    for (const thumbnail of data.data) {
                        if (thumbnail.imageUrl === initialImageUrl) {
                           resolve({status: "FOUND", requestId: thumbnail.requestId});
                            return;
                        }
                        allThumbnailResponses.push(...data.data)
                    }
                    resolve();
                    retries = maxRetries + 1
                }
                catch (error) {
                    console.error("Error fetching thumbnail batch:", error);
                    resolve()
                }
            }

        });

        fetchPromises.push(fetchPromise);
    }

    const results = await Promise.all(fetchPromises);

     const foundResult = results.find(res => res && res.status === "FOUND")
     if(foundResult){
       return foundResult
     }
    return allThumbnailResponses;
}

async function fetchInitialThumbnail(targetid, updateRateLimitCount, isCancelledRef) {
  const initialPayload = [
    {
      type: "AvatarHeadshot",
      size: "150x150",
      targetid: targetid
    }
  ];
  let retries = 0;
  const maxRetries = 5;
  while (retries <= maxRetries) {
       if (isCancelledRef.current) {
          return null;
        }
      let isRateLimitedOnThisRequest = false;
    await delayRequest();
    recordRequest()
    try {
      const response = await fetch("https://thumbnails.roblox.com/v1/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          "Cache-Control": "no-cache"
        },
        body: JSON.stringify(initialPayload),
      });

      if (response.status === 429) {
        if (!isRateLimited) {
          isRateLimited = true;
          rateLimitStartTime = Date.now()
           if(updateRateLimitCount) {
              updateRateLimitCount();
            }
           isRateLimitedOnThisRequest = true
          console.warn("Too many initial thumbnail requests, attempting to spam until un-rate-limited.");
        }
        const delay = Math.random() * 10 + 20; 
        await new Promise(resolve => setTimeout(resolve, delay));
        retries++;
        continue
      }
        if (isRateLimited) {
              const timeUnRateLimited = (Date.now() - rateLimitStartTime) / 1000
              isRateLimited = false
              rateLimitStartTime = 0;
        }

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      if (data && data.data && data.data[0] && data.data[0].imageUrl) {
        return data.data[0].imageUrl;
      } else {
        return null;
      }
      retries = maxRetries + 1;
    } catch (error) {
      return null;
    }
  }
}

    let overlayData;
    let isSniping = false;
     let isCancelledRef = { current: false };
    function createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'sniper-overlay';
    overlay.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.7);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
          pointer-events: auto; /* This is important for the overlay itself to be interactive */
      `;

    const contentBox = document.createElement('div');
    contentBox.style.cssText = `
          background-color: rgb(68, 72, 76);
          padding: 20px;
          border-radius: 8px;
          text-align: center;
          box-shadow: 0px 2px 8px rgba(0, 0, 0, 0.2);
          min-width: 400px;
          position: relative; /* Added to contain close button */
           pointer-events: auto;
      `;

     const closeButton = document.createElement('button');
        closeButton.textContent = 'X';
        closeButton.style.cssText = `
            position: absolute;
            top: 5px;
            right: 5px;
            background-color: transparent;
            color: white;
            border: none;
            font-size: 16px;
            cursor: pointer;
            pointer-events: auto;
        `;
        closeButton.onclick = () => {
            overlay.style.display = 'none';
            document.body.style.overflow = 'auto'; 
            document.body.style.pointerEvents = 'auto'; 
            if(overlayData && overlayData.intervalId){
               clearInterval(overlayData.intervalId)
                overlayData.intervalId = null
             }
             isCancelledRef.current = true
          if (overlayData && overlayData.startButton) {
              overlayData.startButton.textContent = 'Start Sniper';
               isSniping = false
            }
        };
     contentBox.appendChild(closeButton);

    const message = document.createElement('p');
    message.textContent = "This finds the server that the chosen user is in.";
    message.style.cssText = `
        color: rgb(255, 255, 255);
        font-size: 20px;
        font-family: 'Gotham Medium', sans-serif;
        font-weight: bold;
         margin-bottom: 10px;
         pointer-events: none;
    `;
    contentBox.appendChild(message)
    const message1 = document.createElement('p');
    message1.textContent = "This does not require you to be friends with them.";
    message1.style.cssText = `
        color: rgb(255, 255, 255);
        font-size: 16px;
        font-family: 'Gotham Medium', sans-serif;
        font-weight: bold;
         margin-bottom: 5px;
        pointer-events: none;
    `;
    contentBox.appendChild(message1)
    const message2 = document.createElement('p');
    message2.textContent = "Bigger games means it will take longer to search.";
    message2.style.cssText = `
        color: rgb(255, 255, 255);
        font-size: 16px;
        font-family: 'Gotham Medium', sans-serif;
        font-weight: bold;
         margin-bottom: 15px;
         pointer-events: none;
    `;
    contentBox.appendChild(message2)

    const inputField = document.createElement('input');
    inputField.type = 'text';
    inputField.placeholder = 'Enter Roblox User ID';
        inputField.style.cssText = `
            margin-bottom: 15px;
            padding: 10px;
            border-radius: 4px;
            border: 1px solid #ccc;
            font-size: 14px;
            color: white;
             pointer-events: auto;
        `;
    contentBox.appendChild(inputField);
    
    const requestCountDisplay = document.createElement('p');
    requestCountDisplay.textContent = 'Servers Searched: 0';
     requestCountDisplay.style.cssText = `
        color: rgb(255, 255, 255);
        font-size: 14px;
        font-family: 'Gotham Medium', sans-serif;
        pointer-events: none;
    `;
    contentBox.appendChild(requestCountDisplay);

    

      const elapsedTimeDisplay = document.createElement('p');
    elapsedTimeDisplay.textContent = 'Time Elapsed: 0s';
    elapsedTimeDisplay.style.cssText = `
        color: rgb(255, 255, 255);
        font-size: 14px;
        font-family: 'Gotham Medium', sans-serif;
         pointer-events: none;
    `;
    contentBox.appendChild(elapsedTimeDisplay);

   const resultsDisplay = document.createElement('div');
    resultsDisplay.style.cssText = `
    pointer-events: none;
    `;
    contentBox.appendChild(resultsDisplay);


    const startButton = document.createElement('button');
    startButton.textContent = 'Start Sniper';
    startButton.style.cssText = `
        padding: 10px 20px;
        background-color: rgb(3, 102, 214);
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 15px;
        font-weight: 600;
        transition: background-color 0.3s, transform 0.3s;
         padding-left: 30px;
         padding-right: 30px;
         background-color: rgb(4, 115, 237);
         margin-bottom: 10px;
          pointer-events: auto;
    `;
    let startTime = 0;
    let requestCount = 0;
     let rateLimitCount = 0;
      let intervalId;

     startButton.onclick = async () => {
          if (isSniping) {
              return;
         }
         isCancelledRef.current = false
        isSniping = true;
          startButton.textContent = 'Sniping User...';
        startTime = Date.now();
        requestCount = 0;
        rateLimitCount = 0;
        resultsDisplay.innerHTML = '';

         if(intervalId){
           clearInterval(intervalId)
           intervalId = null;
       }

         intervalId = setInterval(() => {
           const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
           elapsedTimeDisplay.textContent = `Time Elapsed: ${elapsedTime}s`;
          }, 1000);


        const userId = inputField.value;
        const placeId = getPlaceIdFromUrl();
        if (placeId && userId) {
          fetchInitialThumbnail(userId, () => {
              rateLimitCount++;
              },isCancelledRef).then(initialImageUrl => {
            if (initialImageUrl) {
                 fetchServers(placeId, initialImageUrl, (count) => {
                       requestCountDisplay.textContent = `Servers Searched: ${count}`;
                   }, () => {
                    rateLimitCount++;
                }, (requestId) => { 
                         const serverFound = document.createElement('p');
                           serverFound.textContent = "Server Found!"
                             serverFound.style.cssText = `
                                color: rgb(255, 255, 255);
                                font-size: 16px;
                                font-family: 'Gotham Medium', sans-serif;
                                font-weight: bold;
                                pointer-events: none;
                            `;
                         resultsDisplay.appendChild(serverFound);


                      const joinButton = document.createElement('button');
                      joinButton.textContent = 'Join Server';
                      joinButton.style.cssText = `
                          padding: 10px 20px;
                          background-color: rgb(0, 176, 111);
                          color: white;
                          border: none;
                          margin-bottom: 10px;
                          width: 144.469px;
                          border-radius: 4px;
                           cursor: pointer;
                          font-size: 15px;
                          font-weight: 600;
                            transition: background-color 0.3s, transform 0.3s;
                             padding-left: 30px;
                             padding-right: 30px;
                             margin-top: 5px;
                             pointer-events: auto;
                      `;

                    joinButton.addEventListener('click', () => {
                      window.open(`roblox://experiences/start?placeId=${placeId}&gameInstanceId=${requestId}`, '_blank'); 
                      if(intervalId){
                          clearInterval(intervalId)
                          intervalId = null
                      }
                    isSniping = false;

                   });
                     resultsDisplay.appendChild(joinButton)
                     if(intervalId){
                       clearInterval(intervalId)
                        intervalId = null
                     }
                    startButton.textContent = 'Start Sniper';
                 }, () => {
                         startButton.textContent = 'Start Sniper';
                         isSniping = false;
                     }, isCancelledRef);
            } else{
                startButton.textContent = 'Start Sniper';
                  isSniping = false;
            }
          });
        } else{
           console.error("Invalid User ID or Place ID")
           alert("Invalid User ID or Place ID")
             startButton.textContent = 'Start Sniper';
                isSniping = false;
        }
      };

    contentBox.appendChild(startButton);
    overlay.appendChild(contentBox);
    document.body.appendChild(overlay);

     overlay.style.display = 'flex'; 


      document.body.style.overflow = 'hidden'; 
     document.body.style.pointerEvents = 'none';
   
      overlayData = {overlay, requestCountDisplay, rateLimitCountDisplay, startTime, intervalId, startButton};
    return overlayData; 
}

function createSniperButton() {
  const sniperButton = document.createElement('button');
  sniperButton.textContent = "User Sniper";
    sniperButton.style.padding = "10px 15px";
    sniperButton.style.backgroundColor = '#24292e'
    sniperButton.style.border = '1px solid #444'
    sniperButton.style.borderRadius = "6px";
    sniperButton.style.cursor = "pointer";
    sniperButton.style.fontSize = "15px";
    sniperButton.style.height = "44px";
    sniperButton.style.fontWeight = "600";
    sniperButton.style.color = 'white';
    sniperButton.style.transition = "background-color 0.3s ease, transform 0.3s ease";


    sniperButton.addEventListener('mouseover', () => {
        sniperButton.style.backgroundColor = "#4c5053";
        sniperButton.style.borderRadius = "6px";
        sniperButton.style.borderColor = '#24292e'
        sniperButton.style.transform = "scale(1.05)";
    });

    sniperButton.addEventListener('mouseout', () => {
        sniperButton.style.backgroundColor = '#24292e';
         sniperButton.style.borderRadius = "6px";
        sniperButton.style.borderColor = "#4c5053";
        sniperButton.style.transform = "scale(1)";
    });

  sniperButton.onclick = () => {
    createOverlay();
  }

  return sniperButton;
}

function injectButton() {
    let targetElement = document.querySelector("#running-game-instances-container");
    if (!targetElement) {
        targetElement = document.querySelector("#running-game-instances-container");
        if(!targetElement){
            console.error("Target element not found to inject button");

            const allElements = document.querySelectorAll('*');
            allElements.forEach(element => {
            });
            return
        }
    }
    const sniperButton = createSniperButton();

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        display: inline-flex;
        justify-content: flex-start;
        align-items: center;
    `;
     buttonContainer.appendChild(sniperButton);


     const rbxRunningGames = targetElement.querySelector("#rbx-running-games");
    if(rbxRunningGames){
       targetElement.insertBefore(buttonContainer, rbxRunningGames);
    } else {
       targetElement.appendChild(buttonContainer);
    }
}


injectButton();