// region.js (helper functions)
export const defaultRegions = [
    "HK", "FR", "NL", "GB", "AU", "IN", "DE", "PL", "JP", "SG", "BR",
    "US-OR", "US-IL", "US-CA", "US-NY", "US-LA", "US-DC", "US-VA", "US-TX", "US-GA", "US-FL"
  ];
  
  export async function getRobloxCookie() {
    return new Promise((resolve, reject) => {
      chrome.cookies.get({ url: "https://www.roblox.com", name: ".ROBLOSECURITY" }, (cookie) => {
        if (cookie) {
          resolve(cookie.value);
        } else {
          reject("No .ROBLOSECURITY cookie found");
        }
      });
    });
  }
  // Function to fetch server information and geolocate it
  export async function getServerInfo(placeId, robloxCookie, regions) {
    const regionCounts = {};
    const url = `https://games.roblox.com/v1/games/${placeId}/servers/Public?excludeFullGames=true&limit=100`;
  
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Roblox/WinInet",
          "Referer": `https://www.roblox.com/games/${placeId}/`,
          "Origin": "https://roblox.com",
          "Authorization": `Bearer ${robloxCookie}`,
        },
      });
  
      if (response.status !== 200) {
        console.error(`Failed to fetch servers, status code: ${response.status}`);
        return;
      }
  
      const servers = await response.json();
  
      if (!servers.data || servers.data.length === 0) {
        console.log("No servers found");
        return;
      }
  
      for (const server of servers.data) {
        await handleServer(server, placeId, robloxCookie, regionCounts, regions);
      }
  
      // Log the results
      for (const [region, count] of Object.entries(regionCounts)) {
        console.log(`${region}: ${count} servers`);
      }
    } catch (error) {
      console.error("Error fetching server data:", error);
    }
  }
  
  // Function to handle each server's geolocation
  export async function handleServer(server, placeId, robloxCookie, regionCounts, regions) {
    const serverId = server.id;
  
    try {
      const serverInfo = await fetch(`https://gamejoin.roblox.com/v1/join-game-instance`, {
        method: 'POST',
        headers: {
          "User-Agent": "Roblox/WinInet",
          "Referer": `https://www.roblox.com/games/${placeId}/`,
          "Origin": "https://roblox.com",
          "Authorization": `Bearer ${robloxCookie}`,
        },
        body: JSON.stringify({
          placeId,
          isTeleport: false,
          gameId: serverId,
          gameJoinAttemptId: serverId,
        }),
      });
  
      const ipData = await serverInfo.json();
      const ip = ipData?.joinScript?.UdmuxEndpoints[0]?.Address;
  
      if (!ip) {
        console.log(`No IP found for server ${serverId}`);
        return;
      }
  
      // Delay 50ms before making geolocation request
      await new Promise(resolve => setTimeout(resolve, 50));
  
      const geolocationData = await fetchGeolocation(ip);
  
      if (!geolocationData) {
        return;
      }
  
      const countryCode = mapStateToRegion(geolocationData);
  
      if (regions.includes(countryCode)) {
        console.log(`Server ${serverId} matches region ${countryCode}`);
        regionCounts[countryCode] = (regionCounts[countryCode] || 0) + 1;
        regionServerMap[countryCode] = server; // Store server by region
      }
    } catch (error) {
      console.error(`Error fetching server info for server ${server.id}:`, error);
    }
  }
  
  // Function to fetch geolocation data for an IP
  export async function fetchGeolocation(ip) {
    // Primary geolocation service
    try {
      const response = await fetch(`http://ip-api.com/json/${ip}`);
      if (response.status === 200) {
        const data = await response.json();
        if (data.status === "success") {
          return data;  // Return geolocation data if successful
        }
      }
    } catch (error) {
      console.error("Error fetching geolocation from ip-api:", error);
    }
  
    // Fallback geolocation service
    try {
      console.log("Attempting to fetch geolocation using fallback service...");
      const response = await fetch(`http://ipinfo.io/${ip}/json`);
      if (response.status === 200) {
        const data = await response.json();
        return data;  // Return geolocation data from fallback service
      }
    } catch (error) {
      console.error("Error fetching geolocation from ipinfo.io:", error);
    }
  
    return null;  // Return null if both services fail
  }
  
  // Function to map geolocation data to a region
  export function mapStateToRegion(data) {
    let countryCode = data.countryCode;
  
    if (countryCode === "US") {
      const state = data.regionName ? data.regionName.toLowerCase() : '';
      const stateMapping = {
        "oregon": "US-OR", "illinois": "US-IL", "california": "US-CA",
        "new york": "US-NY", "louisiana": "US-LA", "district of columbia": "US-DC",
        "virginia": "US-VA", "texas": "US-TX", "georgia": "US-GA", "florida": "US-FL"
      };
  
      countryCode = stateMapping[state] || countryCode;
    }
  
    return countryCode;
  }
  