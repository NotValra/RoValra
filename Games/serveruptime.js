(function() {
    'use strict';

    function detectTheme() {
        return document.body.classList.contains('dark-theme') ? 'dark' : 'light';
    }

    let REGIONS = {};
    let dataCenterCounts = {};
    
    const COUNTRY_CODE_TO_CONTINENT = {
        'AU': 'Oceania',
        'DE': 'Europe',
        'FR': 'Europe',
        'GB': 'Europe',
        'IN': 'Asia',
        'JP': 'Asia',
        'NL': 'Europe',
        'SG': 'Asia',
        'US': 'North America',
        'BR': 'South America'
    };

    const COUNTRY_CODE_TO_FULL_NAME = {
        'AU': 'Australia',
        'DE': 'Germany',
        'FR': 'France',
        'GB': 'UK',
        'IN': 'India',
        'JP': 'Japan',
        'NL': 'Netherlands',
        'SG': 'Singapore',
        'US': 'USA',
        'BR': 'Brazil'
    };

    const COUNTRY_CODE_TO_FLAG = {
        "DE": "Assets/germany.png",
        "BR": "Assets/brazil.png",
        "FR": "Assets/france.png",
        "NL": "Assets/netherlands.png",
        "JP": "Assets/japan.png",
        "SG": "Assets/singapore.png",
        "US": "Assets/unitedstates.png",
        "GB": "Assets/unitedkingdom.png",
        "IN": "Assets/india.png",
        "AU": "Assets/australia.png",
        "UNKNOWN": "Assets/unknown.png"
    };

    const styles = `
        .filter-dropdown-container { position: relative; display: inline-block; margin-left: 10px; }
        .filter-button-alignment { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding-right: 0 !important; }
        .filter-button-alignment::before, .filter-button-alignment::after { content: none !important; display: none !important; }
        .filter-button-alignment svg { width: 16px; height: 16px; }

        .rovalra-filter-dropdown-content { display: none; position: absolute; right: 0; min-width: 240px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); z-index: 9999; border-radius: 8px; padding: 6px; margin-top: 20px; text-align: left; border: 1px solid; }
        .rovalra-filter-dropdown-content.dark { background-color: rgb(39, 41, 48); border-color: rgba(255, 255, 255, 0.15); }
        .rovalra-filter-dropdown-content.light { background-color: #ffffff; border-color: #ccc; }
        .rovalra-filter-dropdown-content.show { display: block; }

        .rovalra-filter-header { display: flex; align-items: center; padding: 4px 8px 10px 8px; margin-bottom: 6px; border-bottom: 1px solid; }
        .rovalra-filter-header .title { font-size: 15px; font-weight: 600; margin: 0; }
        .rovalra-filter-header.dark { border-color: rgba(255, 255, 255, 0.1); color: #ffffff; }
        .rovalra-filter-header.light { border-color: rgba(0, 0, 0, 0.1); color: #392213; }

        .rovalra-filter-list { 
        }

        .rovalra-filter-group-header { 
            padding: 6px 10px;
            font-size: 11px; 
            font-weight: 600; 
            text-transform: uppercase; 
            letter-spacing: 0.5px; 
            border-radius: 5px;
            margin-bottom: 4px;
        }
        .rovalra-filter-group-header:not(:first-child) { 
            margin-top: 8px; 
        }
        .rovalra-filter-group-header.dark { color: #eeeeee; background-color: rgba(255, 255, 255, 0.03); border-color: rgba(255, 255, 255, 0.08); }
        .rovalra-filter-group-header.light { color: #555555; background-color: rgba(0, 0, 0, 0.02); border-color: rgba(0, 0, 0, 0.08); }

        .rovalra-filter-item { 
            padding: 6px 10px; 
            border-radius: 5px; 
            text-decoration: none; 
            display: flex; 
            align-items: center; 
            gap: 10px; 
            font-size: 13px; 
            font-weight: 500; 
            cursor: pointer; 
            transition: background-color 0.15s ease; 
            margin: 0 4px;
        }
        .rovalra-filter-item svg { width: 16px; height: 16px; }
        .rovalra-filter-item.dark { color: #e0e0e0; }
        .rovalra-filter-item.light { color: #333333; }
        .rovalra-filter-item.dark:hover { background-color: rgba(255, 255, 255, 0.08); }
        .rovalra-filter-item.light:hover { background-color: rgba(0, 0, 0, 0.04); }
        .rovalra-filter-item.active.dark { background-color: rgba(255, 255, 255, 0.1); }
        .rovalra-filter-item.active.light { background-color: rgba(0, 0, 0, 0.06); }

        .rovalra-side-panel { display: none; position: absolute; top: 20px; right: calc(-220px - 8px); width: 220px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); z-index: 9998; border-radius: 8px; padding: 6px; border: 1px solid; }
        .rovalra-side-panel.show { display: block; }
        .rovalra-side-panel.dark { background-color: rgb(39, 41, 48); border-color: rgba(255, 255, 255, 0.15); }
        .rovalra-side-panel.light { background-color: #ffffff; border-color: #ccc; }
        .rovalra-side-panel-header { padding: 4px 8px 10px 8px; margin-bottom: 6px; border-bottom: 1px solid; font-size: 15px; font-weight: 600; }
        .rovalra-side-panel-header.dark { border-color: rgba(255, 255, 255, 0.1); color: #ffffff; }
        .rovalra-side-panel-header.light { border-color: rgba(0, 0, 0, 0.1); color: #392213; }
        .rovalra-side-panel-list { max-height: 298px; overflow-y: auto; padding: 0 2px;}
        .rovalra-side-panel-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-radius: 5px; font-size: 14px; font-weight: 600; cursor: pointer; margin-bottom: 4px; }
        .rovalra-side-panel-item .country { font-size: 11px; opacity: 0.7; }
        .rovalra-side-panel-item.dark { color: #e0e0e0; background-color: #393B3D; }
        .rovalra-side-panel-item.light { color: #333333; background-color: #f0f0f0; }
        .rovalra-side-panel-item.dark:hover { background-color: #494b4d; }
        .rovalra-side-panel-item.light:hover { background-color: #e0e0e0; }

        #rovalra-globe-panel {
            display: none;
            flex-direction: column;
            position: absolute;
            top: 20px;
            right: calc(-500px - 8px);
            width: 500px;
            box-shadow: 0 6px 15px rgba(0,0,0,0.2);
            z-index: 9998;
            border-radius: 8px;
            border: 1px solid;
            overflow: hidden;
        }
        #rovalra-globe-panel.show { display: flex; }
        #rovalra-globe-panel.dark { background-color: rgb(39, 41, 48); border-color: rgba(255, 255, 255, 0.15); }
        #rovalra-globe-panel.light { background-color: #ffffff; border-color: #ccc; }

        .rovalra-globe-header {
            padding: 3px 16px;
            border-bottom: 1px solid;
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        .rovalra-globe-header.dark { border-color: rgba(255, 255, 255, 0); background-color: rgb(39, 41, 48); }
        .rovalra-globe-header.light { border-color: rgba(221, 221, 221, 0); background-color: #ffffff; }

        .rovalra-globe-title {
            font-size: 16px;
            font-weight: 700;
            margin: 0 0 6px 0;
        }
        .rovalra-globe-title.dark { color: #ffffff; }
        .rovalra-globe-title.light { color: #333; }

        .rovalra-globe-status {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            font-size: 13px;
            font-weight: 500;
            min-height: 20px;
        }
        .rovalra-globe-status.dark { color: #a0a0a0; }
        .rovalra-globe-status.light { color: #666; }
        .rovalra-globe-status .spinner { width: 16px; height: 16px; }

        #rovalra-globe-container {
            width: 100%;
            height: 500px;
            cursor: grab;
        }
        #rovalra-globe-container:active { cursor: grabbing; }

        #rovalra-globe-tooltip {
            position: fixed;
            display: none;
            background: rgba(10, 10, 10, 0.95);
            color: #e0e0e0;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 400;
            pointer-events: none;
            white-space: nowrap;
            z-index: 10000;
            transform: translate(-50%, -100%);
            margin-top: -12px;
            line-height: 1.6;
            min-width: 160px;
            text-align: center;
        }

        .tooltip-line {
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 2px;
        }
        .tooltip-line span {
            font-size: 13px;
            font-weight: 600;
            color: #ffffff;
        }
        #rovalra-globe-tooltip .flag-icon {
            width: 16px;
            height: 12px;
            margin-right: 8px;
            border-radius: 3px;
            flex-shrink: 0;
        }

        .rovalra-region-count { font-size: 11px; font-weight: 500; padding: 2px 6px; border-radius: 4px; margin-left: 8px; }
        .rovalra-region-count.dark { background-color: rgba(255, 255, 255, 0.1); color: #c8c8c8; }
        .rovalra-region-count.light { background-color: rgba(0, 0, 0, 0.08); color: #555; }
        .rovalra-side-panel-item > div:first-child { display: flex; flex-direction: column; }

        .rovalra-region-stats-bar {
            display: flex;
            align-items: center;
            justify-content: center;
            width: fit-content;
            margin: 0 0 10px 0;
            padding: 6px 10px;
            border-radius: 8px;
            border: 1px solid;
            gap: 14px;
        }
        .rovalra-region-stats-bar.dark { background-color: var(--surface-default); border-color: var(--border-default); }
        .rovalra-region-stats-bar.light { background-color: rgb(247, 247, 248); border-color: rgb(73, 77, 90); }
        .rovalra-stat-item { display: flex; align-items: center; gap: 6px; }
        .rovalra-stat-item .stat-icon { width: 20px; height: 20px; color: var(--text-secondary); }
        .rovalra-stat-item .stat-text { display: flex; flex-direction: column; line-height: 1.2; }
        .rovalra-stat-item .stat-value { font-size: 14px; font-weight: 700; color: var(--text-default); }
        .rovalra-stat-item .stat-label { font-size: 10px; font-weight: 500; color: var(--text-secondary); text-transform: uppercase; }
        .rovalra-stat-divider { width: 1px; height: 24px; }
        .rovalra-stat-divider.dark { background-color: var(--border-default); }
        .rovalra-stat-divider.light { background-color: #E8E8E8; }
        .rovalra-stats-loader { text-align: center; width: 100%; color: var(--text-secondary); font-size: 14px; padding: 10px; }


        .rovalra-side-panel-list::-webkit-scrollbar { width: 8px; }
        .rovalra-side-panel-list::-webkit-scrollbar-track { background: transparent; padding: 2px; }
        .rovalra-side-panel-list.dark::-webkit-scrollbar-thumb { background-color: rgba(255, 255, 255, 0.2); border-radius: 10px; border: 2px solid transparent; background-clip: content-box; }
        .rovalra-side-panel-list.light::-webkit-scrollbar-thumb { background-color: rgba(0, 0, 0, 0.15); border-radius: 10px; border: 2px solid transparent; background-clip: content-box; }

        .rovalra-extra-details { font-size: 11px; margin-top: 4px; line-height: 1.4; color: var(--text-secondary); }

        #rovalra-load-more-btn { display: block; margin: 15px auto; width: 100%; }

        body.rovalra-filter-active .rbx-running-games-load-more {
            display: none !important;
        }

        .rovalra-hidden {
            display: none !important;
        }
        .player-thumbnails-container {
            height: 126px; 
        }
        
    `;

    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    const menuItems = [
        { label: 'Player Count', group: 'Sort by', action: 'togglePlayerCount', svg: '<path fill="none" d="M22 21V19C22 17.1362 20.7252 15.5701 19 15.126M15.5 3.29076C16.9659 3.88415 18 5.32131 18 7C18 8.67869 16.9659 10.1159 15.5 10.7092M17 21C17 19.1362 17 18.2044 16.6955 17.4693C16.2895 16.4892 15.5108 15.7105 14.5307 15.3045C13.7956 15 12.8638 15 11 15H8C6.13623 15 5.20435 15 4.46927 15.3045C3.48915 15.7105 2.71046 16.4892 2.30448 17.4693C2 18.2044 2 19.1362 2 21M13.5 7C13.5 9.20914 11.7091 11 9.5 11C7.29086 11 5.5 9.20914 5.5 7C5.5 4.79086 7.29086 3 9.5 3C11.7091 3 13.5 4.79086 13.5 7Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
        { label: 'Available Space', group: 'Sort by', action: 'availableSpace', svg: '<path fill="none" d="M8.4 3H4.6C4.03995 3 3.75992 3 3.54601 3.10899C3.35785 3.20487 3.20487 3.35785 3.10899 3.54601C3 3.75992 3 4.03995 3 4.6V8.4C3 8.96005 3 9.24008 3.10899 9.45399C3.20487 9.64215 3.35785 9.79513 3.54601 9.89101C3.75992 10 4.03995 10 4.6 10H8.4C8.96005 10 9.24008 10 9.45399 9.89101C9.64215 9.79513 9.79513 9.64215 9.89101 9.45399C10 9.24008 10 8.96005 10 8.4V4.6C10 4.03995 10 3.75992 9.89101 3.54601C9.79513 3.35785 9.64215 3.20487 9.45399 3.10899C9.24008 3 8.96005 3 8.4 3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path fill="none" d="M19.4 3H15.6C15.0399 3 14.7599 3 14.546 3.10899C14.3578 3.20487 14.2049 3.35785 14.109 3.54601C14 3.75992 14 4.03995 14 4.6V8.4C14 8.96005 14 9.24008 14.109 9.45399C14.2049 9.64215 14.3578 9.79513 14.546 9.89101C14.7599 10 15.0399 10 15.6 10H19.4C19.9601 10 20.2401 10 20.454 9.89101C20.6422 9.79513 20.7951 9.64215 20.891 9.45399C21 9.24008 21 8.96005 21 8.4V4.6C21 4.03995 21 3.75992 20.891 3.54601C20.7951 3.35785 20.6422 3.20487 20.454 3.10899C20.2401 3 19.9601 3 19.4 3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path fill="none" d="M19.4 14H15.6C15.0399 14 14.7599 14 14.546 14.109C14.3578 14.2049 14.2049 14.3578 14.109 14.546C14 14.7599 14 15.0399 14 15.6V19.4C14 19.9601 14 20.2401 14.109 20.454C14.2049 20.6422 14.3578 20.7951 14.546 20.891C14.7599 21 15.0399 21 15.6 21H19.4C19.9601 21 20.2401 21 20.454 20.891C20.6422 20.7951 20.7951 20.6422 20.891 20.454C21 20.2401 21 19.9601 21 19.4V15.6C21 15.0399 21 14.7599 20.891 14.546C20.7951 14.3578 20.6422 14.2049 20.454 14.109C20.2401 14 19.9601 14 19.4 14Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path fill="none" d="M8.4 14H4.6C4.03995 14 3.75992 14 3.54601 14.109C3.35785 14.2049 3.20487 14.3578 3.10899 14.546C3 14.7599 3 15.0399 3 15.6V19.4C3 19.9601 3 20.2401 3.10899 20.454C3.20487 20.6422 3.35785 20.7951 3.54601 20.891C3.75992 21 4.03995 21 4.6 21H8.4C8.96005 21 9.24008 21 9.45399 20.891C9.64215 20.7951 9.79513 20.6422 9.89101 20.454C10 20.2401 10 19.9601 10 19.4V15.6C10 15.0399 10 14.7599 9.89101 14.546C9.79513 14.3578 9.64215 14.2049 9.45399 14.109C9.24008 14 8.96005 14 8.4 14Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
        { label: 'Smallest Servers', group: 'Sort by', action: 'smallestServers', svg: '<path fill="none" d="M12 6C12.5523 6 13 5.55228 13 5C13 4.44772 12.5523 4 12 4C11.4477 4 11 4.44772 11 5C11 5.55228 11.4477 6 12 6Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path fill="none" d="M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path fill="none" d="M12 20C12.5523 20 13 19.5523 13 19C13 18.4477 12.5523 18 12 18C11.4477 18 11 18.4477 11 19C11 19.5523 11.4477 20 12 20Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path fill="none" d="M19 6C19.5523 6 20 5.55228 20 5C20 4.44772 19.5523 4 19 4C18.4477 4 18 4.44772 18 5C18 5.55228 18.4477 6 19 6Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path fill="none" d="M19 13C19.5523 13 20 12.5523 20 12C20 11.4477 19.5523 11 19 11C18.4477 11 18 11.4477 18 12C18 12.5523 18.4477 13 19 13Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path fill="none" d="M19 20C19.5523 20 20 19.5523 20 19C20 18.4477 19.5523 18 19 18C18.4477 18 18 18.4477 18 19C18 19.5523 18.4477 20 19 20Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path fill="none" d="M5 6C5.55228 6 6 5.55228 6 5C6 4.44772 5.55228 4 5 4C4.44772 4 4 4.44772 4 5C4 5.55228 4.44772 6 5 6Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path fill="none" d="M5 13C5.55228 13 6 12.5523 6 12C6 11.4477 5.55228 11 5 11C4.44772 11 4 11.4477 4 12C4 12.5523 4.44772 13 5 13Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path fill="none" d="M5 20C5.55228 20 6 19.5523 6 19C6 18.4477 5.55228 18 5 18C4.44772 18 4 18.4477 4 19C4 19.5523 4.44772 20 5 20Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
        { label: 'Random Shuffle', group: 'Sort by', action: 'randomShuffle', svg: '<path fill="none" d="M16.25 7.75H16.255M16.25 11.75H16.255M16.25 16.25H16.255M7.75 7.75H7.755M7.75 11.75H7.755M7.75 16.25H7.755M7.8 21H16.2C17.8802 21 18.7202 21 19.362 20.673C19.9265 20.3854 20.3854 19.9265 20.673 19.362C21 18.7202 21 17.8802 21 16.2V7.8C21 6.11984 21 5.27976 20.673 4.63803C20.3854 4.07354 19.9265 3.6146 19.362 3.32698C18.7202 3 17.8802 3 16.2 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698 4.63803C3 5.27976 3 6.11984 3 7.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21ZM16.5 7.75C16.5 7.88807 16.3881 8 16.25 8C16.1119 8 16 7.88807 16 7.75C16 7.61193 16.1119 7.5 16.25 7.5C16.3881 7.5 16.5 7.61193 16.5 7.75ZM16.5 11.75C16.5 11.8881 16.3881 12 16.25 12C16.1119 12 16 11.8881 16 11.75C16 11.6119 16.1119 11.5 16.25 11.5C16.3881 11.5 16.5 11.6119 16.5 11.75ZM16.5 16.25C16.5 16.3881 16.3881 16.5 16.25 16.5C16.1119 16.5 16 16.3881 16 16.25C16 16.1119 16.1119 16 16.25 16C16.3881 16 16.5 16.1119 16.5 16.25ZM8 7.75C8 7.88807 7.88807 8 7.75 8C7.61193 8 7.5 7.88807 7.5 7.75C7.5 7.61193 7.61193 7.5 7.75 7.5C7.88807 7.5 8 7.61193 8 7.75ZM8 11.75C8 11.8881 7.88807 12 7.75 12C7.61193 12 7.5 11.8881 7.5 11.75C7.5 11.6119 7.61193 11.5 7.75 11.5C7.88807 11.5 8 11.6119 8 11.75ZM8 16.25C8 16.3881 7.88807 16.5 7.75 16.5C7.61193 16.5 7.5 16.3881 7.5 16.25C7.5 16.1119 7.61193 16 7.75 16C7.88807 16 8 16.1119 8 16.25Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
        { label: 'Server Region', group: 'Filter by', action: 'toggleServerRegion', svg: '<path fill="none" d="M15 2.4578C14.053 2.16035 13.0452 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 10.2847 21.5681 8.67022 20.8071 7.25945M17 5.75H17.005M10.5001 21.8883L10.5002 19.6849C10.5002 19.5656 10.5429 19.4502 10.6205 19.3596L13.1063 16.4594C13.3106 16.2211 13.2473 15.8556 12.9748 15.6999L10.1185 14.0677C10.0409 14.0234 9.97663 13.9591 9.93234 13.8814L8.07046 10.6186C7.97356 10.4488 7.78657 10.3511 7.59183 10.3684L2.06418 10.8607M21 6C21 8.20914 19 10 17 12C15 10 13 8.20914 13 6C13 3.79086 14.7909 2 17 2C19.2091 2 21 3.79086 21 6ZM17.25 5.75C17.25 5.88807 17.1381 6 17 6C16.8619 6 16.75 5.88807 16.75 5.75C16.75 5.61193 16.8619 5.5 17 5.5C17.1381 5.5 17.25 5.61193 17.25 5.75Z"  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'},
        { label: 'Newest Servers', group: 'Filter by', action: 'newestServers', svg: '<path fill="none" d="M4.5 22V17M4.5 7V2M2 4.5H7M2 19.5H7M13 3L11.2658 7.50886C10.9838 8.24209 10.8428 8.60871 10.6235 8.91709C10.4292 9.1904 10.1904 9.42919 9.91709 9.62353C9.60871 9.8428 9.24209 9.98381 8.50886 10.2658L4 12L8.50886 13.7342C9.24209 14.0162 9.60871 14.1572 9.91709 14.3765C10.1904 14.5708 10.4292 14.8096 10.6235 15.0829C10.8428 15.3913 10.9838 15.7579 11.2658 16.4911L13 21L14.7342 16.4911C15.0162 15.7579 15.1572 15.3913 15.3765 15.0829C15.5708 14.8096 15.8096 14.5708 16.0829 14.3765C16.3913 14.1572 16.7579 14.0162 17.4911 13.7342L22 12L17.4911 10.2658C16.7579 9.98381 16.3913 9.8428 16.0829 9.62353C15.8096 9.42919 15.5708 9.1904 15.3765 8.91709C15.1572 8.60871 15.0162 8.24209 14.7342 7.50886L13 3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
        { label: 'Oldest Servers', group: 'Filter by', action: 'oldestServers', svg: '<path fill="none" d="M12 2.25V4.75M12 18V22M5.75 12H2.25M21.25 12H19.75M18.4571 18.4571L17.75 17.75M18.6642 5.41579L17.25 6.83M4.92157 19.0784L7.75 16.25M5.12868 5.20868L7.25 7.33" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
    ];

    let gameId = '';
    const MAX_RETRIES = 10;
    const MAX_API_REQUESTS = 9;

    let allFetchedServers = [];
    let displayedServerCount = 0;
    const BATCH_SIZE = 10;
    let isFilterActive = false;
    let refreshButton = null;
    let originalRefreshButtonClickHandler = null;
    let currentlyDisplayedServers = [];
    let originalServerElements = [];

    let currentFetchController;
    let backgroundRegionFetchController = null;

    let globeSearchState = {
        cursor: '',
        completed: false
    };

    let serverIpMap = null;
    let serverLocationsCache = {};
    let csrfToken = null;
    let isGlobeOpen = false;

    let preFetchedServerCounts = null;
    let preFetchedJoinStatus = null; 
    let isPreFetchingGlobeData = false;
    let rovalraApiDataPromise = null;
    async function getGlobalCsrfToken() {
        if (csrfToken) return csrfToken;
        try {
            const response = await fetch('https://auth.roblox.com/v2/logout', { method: 'POST', credentials: 'include' });
            const token = response.headers.get('x-csrf-token');
            if (token) {
                csrfToken = token;
                return token;
            }
        } catch (e) {  }
        try {
            const meta = document.querySelector("meta[name='csrf-token']");
            if (meta) {
                csrfToken = meta.getAttribute('data-token');
                return csrfToken;
            }
        } catch (e) {  }
        return null;
    }
    
    function processApiData(apiData) {
        if (!Array.isArray(apiData)) {
            return;
        }

        const newServerIpMap = {};
        const newRegions = {};
        const newDataCenterCounts = {};

        apiData.forEach(dcGroup => {
            const loc = dcGroup.location;
            if (!loc || !Array.isArray(dcGroup.dataCenterIds)) return;

            dcGroup.dataCenterIds.forEach(id => {
                newServerIpMap[id] = dcGroup;
            });

            const continent = COUNTRY_CODE_TO_CONTINENT[loc.country] || 'Other';

            if (!newRegions[continent]) {
                newRegions[continent] = {};
            }
            
            const regionKey = `${loc.country}-${loc.city.replace(/\s+/g, '')}`;
            
            newDataCenterCounts[regionKey] = dcGroup.dataCenterIds.length;

            if (!newRegions[continent][regionKey]) {
                newRegions[continent][regionKey] = {
                    city: loc.city,
                    country: COUNTRY_CODE_TO_FULL_NAME[loc.country] || loc.country,
                    state: loc.country === 'US' ? loc.region : undefined,
                    coords: {
                        lat: parseFloat(loc.latLong[0]),
                        lon: parseFloat(loc.latLong[1])
                    }
                };
            }
        });

        serverIpMap = newServerIpMap;
        REGIONS = newRegions;
        dataCenterCounts = newDataCenterCounts;
    }
    
    async function loadServerIpMap() {
        if (serverIpMap && Object.keys(serverIpMap).length > 0) return;
    
        try {
            const dataElement = document.getElementById('rovalra-datacenter-data-storage');
            let apiData = null;
    
            if (dataElement && dataElement.textContent) {
                try {
                    apiData = JSON.parse(dataElement.textContent);
                } catch (e) {
                    apiData = null;
                }
            }
    
            if (!apiData) {
            }
    
            processApiData(apiData);
    
        } catch (error) {
            serverIpMap = {}; 
            REGIONS = {};
            dataCenterCounts = {};
        }
    }

    function createUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    async function getServerRegion(serverId, signal) {
        if (serverLocationsCache[serverId]) {
            return serverLocationsCache[serverId];
        }
        if (!gameId) return "??";

        const token = await getGlobalCsrfToken();
        if (!token || !serverIpMap) {
            return "??";
        }

        try {
            const response = await fetch(`https://gamejoin.roblox.com/v1/join-game-instance`, {
                method: 'POST',
                headers: { "Accept": "application/json", "Content-Type": "application/json", "X-Csrf-Token": token },
                body: JSON.stringify({ placeId: parseInt(gameId, 10), gameId: serverId, gameJoinAttemptId: createUUID() }),
                credentials: 'include',
                signal: signal
            });

            const serverInfo = await response.json();

            if (serverInfo && serverInfo.status === 12) {
                const message = serverInfo.message || "";
                let eventToDispatch = null;
                let errorType = "??";

                if (message.includes("Cannot join this non-root place")) {
                    eventToDispatch = 'rovalraSubplaceCannotBeJoined';
                    errorType = "RESTRICTED";
                } else if (message.includes("You need to purchase access")) {
                    eventToDispatch = 'rovalraGameNotOwned';
                    errorType = "PAID_ACCESS";
                }

                if (eventToDispatch) {
                    document.dispatchEvent(new CustomEvent(eventToDispatch));
                    if (backgroundRegionFetchController && !backgroundRegionFetchController.signal.aborted) {
                        backgroundRegionFetchController.abort();
                    }
                    serverLocationsCache[serverId] = errorType;
                    return errorType;
                }
            }

            if (!response.ok) {
                if (signal && !signal.aborted) {
                     serverLocationsCache[serverId] = "??";
                }
                return "??";
            }

            let regionCode = "??";

            if (serverInfo && serverInfo.joinScript) {
                const joinScriptData = typeof serverInfo.joinScript === 'string' ? JSON.parse(serverInfo.joinScript) : serverInfo.joinScript;
                const dataCenterId = joinScriptData?.DataCenterId;

                if (dataCenterId && serverIpMap[dataCenterId]) {
                    const dataCenter = serverIpMap[dataCenterId];
                    const loc = dataCenter.location;
                    regionCode = `${loc.country}-${loc.city.replace(/\s+/g, '')}`;
                }
            }
            serverLocationsCache[serverId] = regionCode;
            return regionCode;

        } catch (error) {
            if (error.name !== 'AbortError') {
                serverLocationsCache[serverId] = "??";
            }
            return "??";
        }
    }

    async function fetchAndDisplayRegionCounts() {}


    function getMaxServerSize() {
        try {
            const gameStats = document.querySelectorAll('.game-stat');
            for (const stat of gameStats) {
                const label = stat.querySelector('.text-label');
                if (label && label.textContent.trim() === 'Server Size') {
                    const value = stat.querySelector('.text-lead');
                    if (value && value.title) return parseInt(value.title, 10);
                }
            }
        } catch (e) {  }
        return 50;
    }

    function updateStatusMessage(message = '', showSpinner = true) {
        const serverListContainer = document.querySelector('#rbx-public-game-server-item-container');
        if (!serverListContainer) return;

        let statusHTML = '';
        if (showSpinner) {
            statusHTML += '<div class="spinner spinner-default" style="margin: 20px auto;"></div>';
        }

        if (message) {
            const padding = showSpinner ? 'padding: 10px 20px 0 20px;' : 'padding: 20px;';
            statusHTML += `<p class="text-info" style="${padding} text-align: center;">${message}</p>`;
        }
        serverListContainer.innerHTML = statusHTML;
    }

    async function fetchPage(url, signal, statusUpdateCallback) {
        const updateStatus = statusUpdateCallback || ((message) => updateStatusMessage(message));

        for (let i = 0; i < MAX_RETRIES; i++) {
            try {
                const response = await fetch(url, { credentials: 'include', signal });
                if (response.ok) {
                    return await response.json();
                }
                if (response.status === 429) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
            } catch (error) {
                if (error.name === 'AbortError') {
                    throw error;
                }
                if (i < MAX_RETRIES - 1) {
                     const delay = (i + 1) * 2000;
                     const message = `Network error. Retrying...`;
                     updateStatus(message);
                     await new Promise(resolve => setTimeout(resolve, delay));
                     continue;
                }
                throw error;
            }
        }
        throw new Error(`Failed to fetch servers after ${MAX_RETRIES} attempts due to rate limiting.`);
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function fetchPaginatedServers(baseUrl, unlimitedRequests = false, singlePage = false, signal) {
        const serverMap = new Map();
        let cursor = '', hasNextPage = true, requestCount = 0;

        const requestLimit = singlePage ? 1 : (unlimitedRequests ? Infinity : MAX_API_REQUESTS);

        while (hasNextPage && requestCount < requestLimit) {
            const url = new URL(baseUrl);
            url.searchParams.set('cursor', cursor);
            const pageData = await fetchPage(url.href, signal);
            requestCount++;

            if (pageData && pageData.data) {
                pageData.data.forEach(server => {
                    if (!serverMap.has(server.id)) {
                        serverMap.set(server.id, server);
                    }
                });

                cursor = pageData.nextPageCursor;
                hasNextPage = !!cursor;
            } else {
                hasNextPage = false;
            }

            if (hasNextPage) {
                await delay(1000); 
            }
        }

        const wasTruncated = hasNextPage;
        if(wasTruncated && !singlePage) {
        }

        const newServers = Array.from(serverMap.values());
        allFetchedServers = newServers;

        return {
            servers: newServers,
            truncated: wasTruncated
        };
    }

async function startSequentialRegionFetch(signal) {
        const statusContainer = document.getElementById('rovalra-globe-status-container');
        const VERIFICATION_ATTEMPTS = 3;
        const VERIFICATION_DELAY = 1000;

        const globeStatusCallback = (message) => {
            if (statusContainer) {
                const spinnerHTML = '<span class="spinner spinner-default" style="width: 14px; height: 14px; margin-right: 8px;"></span>';
                statusContainer.innerHTML = `${spinnerHTML}<span>${message}</span>`;
                statusContainer.classList.remove('rovalra-hidden');
            }
        };

        const removeSpinner = () => {
            const regionFilterItem = document.querySelector('[data-action="toggleServerRegion"]');
            if (regionFilterItem) {
                regionFilterItem.querySelector('.spinner')?.remove();
            }
        };

        if (globeSearchState.completed) {
            if (statusContainer) {
                statusContainer.innerHTML = '<span>Searched All Servers</span>';
                statusContainer.classList.remove('rovalra-hidden');
            }
            removeSpinner();
            const finalCounts = {};
            allFetchedServers.forEach(server => {
                 const regionCode = serverLocationsCache[server.id];
                 if (regionCode && regionCode !== '??') {
                    finalCounts[regionCode] = (finalCounts[regionCode] || 0) + 1;
                 }
            });
            document.dispatchEvent(new CustomEvent('rovalraUpdateGlobeCounts', { detail: finalCounts }));
            return;
        }

        if (statusContainer) {
            statusContainer.innerHTML = '<span>Searching for servers...</span>';
            statusContainer.classList.remove('rovalra-hidden');
        }

        try {
            const liveRegionCounts = {};
            allFetchedServers.forEach(server => {
                const regionCode = serverLocationsCache[server.id];
                if (regionCode && regionCode !== '??') {
                    liveRegionCounts[regionCode] = (liveRegionCounts[regionCode] || 0) + 1;
                }
            });
            document.dispatchEvent(new CustomEvent('rovalraUpdateGlobeCounts', { detail: liveRegionCounts }));

            let hasNextPage = true;
            const baseUrl = `https://games.roblox.com/v1/games/${gameId}/servers/Public`;

            while (hasNextPage && !signal.aborted) {
                try {
                    const url = new URL(baseUrl);
                    url.searchParams.set('limit', '100');
                    url.searchParams.set('sortOrder', '2');
                    url.searchParams.set('excludeFullGames', 'true');
                    url.searchParams.set('cursor', globeSearchState.cursor);

                    const pageData = await fetchPage(url.href, signal, globeStatusCallback);

                    if (pageData && pageData.data && pageData.data.length > 0) {
                        const newServers = pageData.data;
                        const uniqueNewServers = newServers.filter(server => !allFetchedServers.some(s => s.id === server.id));
                        allFetchedServers.push(...uniqueNewServers);

                        const batchSize = 10;
                        for (let i = 0; i < uniqueNewServers.length; i += batchSize) {
                            if (signal.aborted) break;
                            const batch = uniqueNewServers.slice(i, i + batchSize);

                            const regionPromises = batch.map(server =>
                                getServerRegion(server.id, signal).then(regionCode => {
                                    if (signal.aborted) return;
                                    if (regionCode && regionCode !== '??') {
                                        liveRegionCounts[regionCode] = (liveRegionCounts[regionCode] || 0) + 1;
                                    }
                                })
                            );
                            await Promise.all(regionPromises);
                            document.dispatchEvent(new CustomEvent('rovalraUpdateGlobeCounts', { detail: liveRegionCounts }));
                        }

                        if (pageData.nextPageCursor) {
                            globeSearchState.cursor = pageData.nextPageCursor;
                            hasNextPage = true;
                            await delay(1500);
                        } else {
                            let foundNewCursor = false;
                            for (let i = 0; i < VERIFICATION_ATTEMPTS; i++) {
                                if (signal.aborted) break;
                                await delay(VERIFICATION_DELAY);
                                const verificationPageData = await fetchPage(url.href, signal, globeStatusCallback);
                                if (verificationPageData && verificationPageData.nextPageCursor) {
                                    globeSearchState.cursor = verificationPageData.nextPageCursor;
                                    foundNewCursor = true;
                                    break;
                                }
                            }
                            hasNextPage = foundNewCursor;
                        }

                    } else {
                        hasNextPage = false;
                    }
                } catch (error) {
                    if (error.name === 'AbortError') {
                        hasNextPage = false;
                    } else {
                        await delay(5000);
                    }
                }
            }

            if (!hasNextPage && !signal.aborted) {
                globeSearchState.completed = true;
                if (statusContainer) {
                    statusContainer.innerHTML = '<span>Searched All Servers</span>';
                }
                removeSpinner();
            }

        } catch (error) {
            if (error.name !== 'AbortError') {
            }
        }
    }


    async function fetchThumbnailsInBatches(tokens) {
        const uniqueTokens = [...new Set(tokens)];
        if (uniqueTokens.length === 0) return new Map();

        const thumbnailMap = new Map();
        const batchSize = 100;

        try {
            const requests = [];
            for (let i = 0; i < uniqueTokens.length; i += batchSize) {
                const batch = uniqueTokens.slice(i, i + batchSize);
                const requestBody = batch.map(token => ({
                    requestId: `0:${token}:AvatarHeadshot:150x150:webp:regular:`,
                    type: 'AvatarHeadShot',
                    targetId: 0,
                    token: token,
                    format: 'webp',
                    size: '150x150'
                }));

                const requestPromise = fetch('https://thumbnails.roblox.com/v1/batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify(requestBody)
                })
                .then(response => response.ok ? response.json() : Promise.reject(`Thumbnail fetch failed: ${response.status}`))
                .then(result => {
                    if (result.data) {
                        result.data.forEach(item => {
                            const token = item.requestId.split(':')[1];
                            if (item.state === 'Completed' && item.imageUrl) {
                                thumbnailMap.set(token, item.imageUrl);
                            }
                        });
                    }
                });
                requests.push(requestPromise);
            }
            await Promise.all(requests);
        } catch (error) {
            return new Map();
        }
        return thumbnailMap;
    }

async function renderNextBatchOfServers() {
    const serverListContainer = document.querySelector('#rbx-public-game-server-item-container');
    if (!serverListContainer) return;

    const containerParent = serverListContainer.parentElement;

    if (displayedServerCount === 0) {
        serverListContainer.innerHTML = '';
    }

    const start = displayedServerCount;
    const end = start + BATCH_SIZE;
    const batchToRender = currentlyDisplayedServers.slice(start, end);

    if (batchToRender.length === 0 && start === 0) {
        serverListContainer.innerHTML = '<p class="text-info" style="padding: 20px; text-align: center;">No servers found matching this filter.</p>';
        return;
    }

    const playerTokensForBatch = batchToRender
        .filter(server => server.playerTokens)
        .flatMap(server => server.playerTokens.slice(0, 12));
    const thumbnailMap = await fetchThumbnailsInBatches(playerTokensForBatch);

    batchToRender.forEach(server => {
        const isFallbackCard = server.playerTokens === undefined;
        serverListContainer.appendChild(createServerCard(server, thumbnailMap, isFallbackCard));
    });

    displayedServerCount += batchToRender.length;

    let existingButton = document.getElementById('rovalra-load-more-btn');
    if (existingButton) existingButton.remove();

    if (isFilterActive && displayedServerCount < currentlyDisplayedServers.length) {
        const loadMoreButton = document.createElement('button');
        loadMoreButton.id = 'rovalra-load-more-btn';
        loadMoreButton.textContent = 'Load More';
        loadMoreButton.className = 'btn-control-sm rbx-upgrade-now-button';

        loadMoreButton.addEventListener('click', () => {
             loadMoreButton.innerHTML = '<span class="spinner spinner-default"></span>';
             loadMoreButton.disabled = true;
             renderNextBatchOfServers();
        });

        if (containerParent) {
            containerParent.appendChild(loadMoreButton);
        }
    }
}

function createServerCard(server, thumbnailMap, isFallbackCard = false) {
    const listItemClass = 'rbx-public-game-server-item col-md-3 col-sm-4 col-xs-6';
    const serverItem = document.createElement('li');
    serverItem.className = listItemClass;
    const serverId = server.id || server.server_id;
    serverItem.dataset.rovalraServerid = serverId;
    let playerThumbnailsContainerHTML = '';
    let serverDetailsHTML = '';
    let extraDetailsHTML = '';

    const regionCode = serverLocationsCache[serverId];
    let regionInfo = null;
    if (regionCode && regionCode !== '??') {
        for (const continent in REGIONS) {
            if (REGIONS[continent][regionCode]) {
                regionInfo = REGIONS[continent][regionCode];
                break;
            }
        }
    }

    if (regionInfo) {
        let locationString = regionInfo.city;
        if (regionInfo.state) {
             locationString = `${regionInfo.city}, ${regionInfo.state}`;
        }
    } else if (regionCode && regionCode !== '??') {
    }


    if (!isFallbackCard) {
        const playerTokensForBatch = server.playerTokens || [];
        const playerThumbnailsHTML = playerTokensForBatch.slice(0, 12).map(token => {
            const imageUrl = thumbnailMap.get(token);
            const imageContent = imageUrl ? `<img src="${imageUrl}" alt="player thumbnail">` : '';
            return `<span class="avatar avatar-headshot-md player-avatar"><span class="thumbnail-2d-container avatar-card-image">${imageContent}</span></span>`;
        }).join('');
        const remainingPlayers = server.playing - playerTokensForBatch.length;
        const extraPlayersHTML = remainingPlayers > 0 ? `<span class="avatar avatar-headshot-md player-avatar hidden-players-placeholder">+${remainingPlayers}</span>` : '';
        playerThumbnailsContainerHTML = `<div class="player-thumbnails-container">${playerThumbnailsHTML}${extraPlayersHTML}</div>`;

        serverDetailsHTML = `
            <div class="text-info rbx-game-status rbx-public-game-server-status text-overflow">${server.playing} of ${server.maxPlayers} people max</div>
            <div class="server-player-count-gauge border"><div class="gauge-inner-bar border" style="width: ${ (server.playing / server.maxPlayers) * 100}%;"></div></div>`;
    } else {
        playerThumbnailsContainerHTML = `
            <div class="player-thumbnails-container" style="display: flex; align-items: center; justify-content: center; padding: 0px;">
                <div style="background-color: rgba(0,0,0,0.2); border-radius: 6px; padding: 8px 12px; text-align: center;">
                    <span style="color: var(--text-secondary); font-size: 12px; font-weight: 500;">Player info not available.</span>
                </div>
            </div>`;
        serverDetailsHTML = `<div class="text-info rbx-game-status rbx-public-game-server-status text-overflow">Player count unknown</div>
        <div class="server-player-count-gauge border"><div class="gauge-inner-bar border" style="width: ${ (server.playing / server.maxPlayers) * 100}%;"></div></div>`;
    }

    const joinButtonHTML = `<button type="button" class="btn-full-width btn-control-xs rbx-public-game-server-join game-server-join-btn btn-primary-md btn-min-width" onclick="Roblox.GameLauncher.joinGameInstance(${gameId}, '${serverId}')">Join</button>`;

    serverItem.innerHTML = `
        <div class="card-item card-item-public-server">
            ${playerThumbnailsContainerHTML}
            <div class="rbx-public-game-server-details game-server-details">
                ${serverDetailsHTML}
                ${extraDetailsHTML}
                ${joinButtonHTML}
            </div>
        </div>`;
    return serverItem;
}

    async function setupAndRenderServers(serversToDisplay) {
        const serverListContainer = document.querySelector('#rbx-public-game-server-item-container');
        if (!serverListContainer) return;

        document.getElementById('rovalra-load-more-btn')?.remove();

        currentlyDisplayedServers = serversToDisplay;
        displayedServerCount = 0; 
        serverListContainer.innerHTML = '';

        if (currentlyDisplayedServers.length === 0) {
            updateStatusMessage("No servers found matching this filter.", false);
            return;
        }

        await renderNextBatchOfServers();
    }

async function applyFilter(filterAction, filterValue = null, isReset = false) {
    if (currentFetchController) {
        currentFetchController.abort();
    }
    currentFetchController = new AbortController();
    const signal = currentFetchController.signal;

    const paginationContainer = document.querySelector('.rbx-running-games-footer');
    let clearButton = document.getElementById('rovalra-clear-filter-btn');
    const serverListContainer = document.querySelector('#rbx-public-game-server-item-container');

    if (isReset) {
        isFilterActive = false;
        document.body.classList.remove('rovalra-filter-active');
        if (serverListContainer) {
            serverListContainer.removeAttribute('data-rovalra-filter-active'); 
        }
        if (paginationContainer) {
            paginationContainer.style.display = 'block';
        }
        if (clearButton) {
            clearButton.remove();
        }
        return;
    } else {
        if (!isFilterActive) {
            if (serverListContainer) {
                originalServerElements = Array.from(serverListContainer.children);
            }
        }

        isFilterActive = true;
        document.body.classList.add('rovalra-filter-active');
        if (serverListContainer) {
            serverListContainer.setAttribute('data-rovalra-filter-active', 'true'); 
        }
        if (paginationContainer) {
            paginationContainer.style.display = 'none';
        }

        if (!clearButton) {
            const filterControlsContainer = document.getElementById('rovalra-main-controls');

            if (filterControlsContainer) {
                clearButton = document.createElement('div');
                clearButton.className = 'rbx-refresh-button-wrapper';
                clearButton.id = 'rovalra-clear-filter-btn';
                clearButton.style.marginLeft = '10px';

                const buttonElement = document.createElement('button');
                const mainFilterButton = document.querySelector('.filter-dropdown-container button');

                if (mainFilterButton) {
                    buttonElement.className = mainFilterButton.className;
                } else {
                    buttonElement.className = 'btn-control-xs btn-more filter-button-alignment';
                }

                const clearIconSVG = `<svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
                buttonElement.innerHTML = `<span>Clear</span>${clearIconSVG}`;

                buttonElement.addEventListener('click', clearFilter);
                clearButton.appendChild(buttonElement);
                filterControlsContainer.appendChild(clearButton);
            } else {
            }
        }
    }

    if (!serverListContainer) return;

    document.getElementById('rovalra-load-more-btn')?.remove();
    updateStatusMessage('Loading servers...', true);

    try {
        if (!gameId) throw new Error('Could not find Place ID.');

        let servers = [];
        const baseUrl = `https://games.roblox.com/v1/games/${gameId}/servers/Public`;
        const params = new URLSearchParams({ limit: '100' });
        let isSinglePageFilter = false; 

        switch (filterAction) {
            case 'filterByRegion': {
                let targetRegionCode = filterValue;

                const initiallyFoundServers = allFetchedServers.filter(server => {
                    const cachedRegion = serverLocationsCache[server.id];
                    return cachedRegion && cachedRegion === targetRegionCode;
                });

                if (initiallyFoundServers.length > 0) {
                    updateStatusMessage(`Found ${initiallyFoundServers.length} cached servers for ${targetRegionCode}.`, false);
                    await setupAndRenderServers(initiallyFoundServers);
                } else {
                    await continuouslySearchForRegion(targetRegionCode, signal);
                }
                return;
            }
            case 'oldestServers':
            case 'newestServers': {
                const filterName = filterAction === 'newestServers' ? 'newest' : 'oldest';
                // You are allowed to use this API for personal projects only which is limited to open source projects on GitHub, they must be free and you must credit the RoValra repo.
                // You are not allowed to use the API for projects on the chrome web store or any other extension store. If you want to use the API for a website dm be on discord: Valra and we can figure something out.
                // If you want to use the API for something thats specifically said isnt allowed or you might be unsure if its allowed, please dm me on discord: Valra, Ill be happy to check out your stuff and maybe allow you to use it for your project.
                const rovalraEndpoint = `https://apis.rovalra.com/get_${filterName}_servers?place_id=${gameId}`;

                try {
                    const rovalraResponse = await fetch(rovalraEndpoint, { signal });
                    if (!rovalraResponse.ok) throw new Error(`RoValra API request failed for ${filterName} servers.`);
                    const rovalraData = await rovalraResponse.json();
                    if (!rovalraData || !Array.isArray(rovalraData.servers)) {
                        throw new Error(`Invalid data format from ${filterName} servers API.`);
                    }
                    const rovalraServers = rovalraData.servers;

                    const { servers: robloxApiServers } = await fetchPaginatedServers(`${baseUrl}?sortOrder=2&limit=100`, false, false, signal);

                    const robloxServerMap = new Map(robloxApiServers.map(s => [s.id, s]));
                    const mergedServerList = rovalraServers.map(rovalraServer => {
                        const fullData = robloxServerMap.get(rovalraServer.server_id);
                        return fullData || rovalraServer;
                    });

                    await setupAndRenderServers(mergedServerList);

                } catch (err) {
                    if (err.name !== 'AbortError') {
                        updateStatusMessage(`Error: ${err.message}`, false);
                    }
                }
                return; 
            }
            
            case 'smallestServers':
                params.set('sortOrder', '1');
                isSinglePageFilter = true;
                break;
            case 'availableSpace':
                params.set('sortOrder', '2');
                params.set('excludeFullGames', 'true');
                isSinglePageFilter = true;
                break;
            case 'playerCount':
                params.set('sortOrder', '2');
                isSinglePageFilter = true;
                break;
            case 'filterByMaxPlayers': {
                const maxAllowedPlayers = parseInt(filterValue, 10);
                const foundServers = [];
                let cursor = '';
                let hasNextPage = true;
                let requestCount = 0;
                let foundTargetServer = false;

                const searchUrl = new URL(baseUrl);
                searchUrl.searchParams.set('sortOrder', '1'); 
                searchUrl.searchParams.set('limit', '100');
                
                updateStatusMessage(`Searching for servers with ${maxAllowedPlayers} or fewer players...`, true);

                while (hasNextPage && requestCount < MAX_API_REQUESTS && !signal.aborted) {
                    searchUrl.searchParams.set('cursor', cursor);
                    const pageData = await fetchPage(searchUrl.href, signal);

                    if (pageData && pageData.data && pageData.data.length > 0) {
                        let pageContainedServerTooLarge = false;
                        for (const server of pageData.data) {
                            if (server.playing <= maxAllowedPlayers) {
                                if (!foundServers.some(s => s.id === server.id)) {
                                    foundServers.push(server);
                                }
                                if (server.playing === maxAllowedPlayers) {
                                    foundTargetServer = true;
                                }
                            } else {
                                pageContainedServerTooLarge = true;
                            }
                        }
                        
                        updateStatusMessage(`Found ${foundServers.length} servers... continuing search. (Page ${requestCount})`, true);

                        cursor = pageData.nextPageCursor;
                        hasNextPage = !!cursor;

                        if (foundTargetServer && pageContainedServerTooLarge) {
                            hasNextPage = false;
                        }

                    } else {
                        hasNextPage = false;
                    }

                    if (hasNextPage) await delay(1000);
                }

                foundServers.sort((a, b) => b.playing - a.playing);
                await setupAndRenderServers(foundServers);
                return;
            }
            case 'randomShuffle': {
                ({ servers } = await fetchPaginatedServers(`${baseUrl}?sortOrder=2&limit=100`, false, false, signal));
                for (let i = servers.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [servers[i], servers[j]] = [servers[j], servers[i]];
                }
                await setupAndRenderServers(servers);
                return;
            }
            default:
                params.set('sortOrder', '2');
        }
        
        ({ servers } = await fetchPaginatedServers(`${baseUrl}?${params.toString()}`, false, isSinglePageFilter, signal));
        await setupAndRenderServers(servers);

    } catch (error) {
        if (error.name === 'AbortError') {
            return;
        }
        updateStatusMessage(`Error: ${error.message}`, false);
    }
}
    async function continuouslySearchForRegion(targetRegionCode, signal) {
        const serverListContainer = document.querySelector('#rbx-public-game-server-item-container');
        if (!serverListContainer) return;

        const baseUrl = `https://games.roblox.com/v1/games/${gameId}/servers/Public`;
        let hasNextPage = !globeSearchState.completed;
        let requestCount = 0;
        const foundServersList = [];
        const VERIFICATION_ATTEMPTS = 3;
        const VERIFICATION_DELAY = 1000;

        updateStatusMessage(`Searching for servers in ${targetRegionCode}... This may take a moment.`, true);

        while (hasNextPage && !signal.aborted) {
            try {
                updateStatusMessage(`Searching page ${requestCount + 1} for ${targetRegionCode}... Found: ${foundServersList.length}`, true);

                const url = new URL(baseUrl);
                url.searchParams.set('limit', '100');
                url.searchParams.set('sortOrder', '2');
                url.searchParams.set('cursor', globeSearchState.cursor);

                const pageData = await fetchPage(url.href, signal);
                requestCount++;

                if (pageData && pageData.data && pageData.data.length > 0) {
                    const serversOnPage = pageData.data;

                    for (const server of serversOnPage) {
                        if (signal.aborted) break;
                        const region = await getServerRegion(server.id, signal);
                        if (!allFetchedServers.some(s => s.id === server.id)) {
                            allFetchedServers.push(server);
                        }
                        if (region && region === targetRegionCode) {
                            if (!foundServersList.some(s => s.id === server.id)) {
                                foundServersList.push(server);
                            }
                        }
                    }

                    if (pageData.nextPageCursor) {
                        globeSearchState.cursor = pageData.nextPageCursor;
                        hasNextPage = true;
                        if (foundServersList.length > 0) {
                             await setupAndRenderServers(foundServersList);
                             updateStatusMessage(`Searching page ${requestCount + 1} for ${targetRegionCode}... Found: ${foundServersList.length}`, true);
                        }
                        await delay(1000); 
                    } else {
                        let foundNewCursor = false;
                        for (let i = 0; i < VERIFICATION_ATTEMPTS; i++) {
                            if (signal.aborted) break;
                            await delay(VERIFICATION_DELAY);
                            const verificationPageData = await fetchPage(url.href, signal);
                            if (verificationPageData && verificationPageData.nextPageCursor) {
                                globeSearchState.cursor = verificationPageData.nextPageCursor;
                                foundNewCursor = true;
                                break;
                            }
                        }
                        hasNextPage = foundNewCursor;
                        if (!hasNextPage) {
                            globeSearchState.completed = true;
                        }
                    }
                } else {
                    hasNextPage = false;
                    globeSearchState.completed = true;
                }
            } catch (error) {
                if (error.name === 'AbortError') {
                    return;
                }
                updateStatusMessage("An error occurred while searching for servers.", false);
                return;
            }
        }

        if (!signal.aborted) {
            if (foundServersList.length > 0) {
                await setupAndRenderServers(foundServersList);
            } else {
                const endMessage = globeSearchState.completed
                    ? `Search complete. All servers have been checked. No servers were found in ${targetRegionCode}.`
                    : `No servers found in ${targetRegionCode} after searching ${requestCount} pages. You can try again to search further.`;
                updateStatusMessage(endMessage, false);
            }
        }
    }
async function getRovalraApiData(placeId) {
    if (!placeId) return null;

    if (rovalraApiDataPromise) {
        return rovalraApiDataPromise;
    }

    rovalraApiDataPromise = new Promise(async (resolve, reject) => {
        const controller = new AbortController();
        const signal = controller.signal;

        const timeoutId = setTimeout(() => {
            controller.abort();
        }, 7000); 

        try {
            // You are allowed to use this API for personal projects only which is limited to open source projects on GitHub, they must be free and you must credit the RoValra repo.
            // You are not allowed to use the API for projects on the chrome web store or any other extension store. If you want to use the API for a website dm be on discord: Valra and we can figure something out.
            // If you want to use the API for something thats specifically said isnt allowed or you might be unsure if its allowed, please dm me on discord: Valra, Ill be happy to check out your stuff and maybe allow you to use it for your project.
            const response = await fetch(`https://apis.rovalra.com/get_server_counts_by_region?place_id=${placeId}`, {
                signal 
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`API request failed with status: ${response.status}`);
            }
            const data = await response.json();
            if (data.status !== 'success' || !data.counts) {
                throw new Error("API returned an error or invalid data.");
            }
            resolve(data);
        } catch (error) {
            clearTimeout(timeoutId);
            rovalraApiDataPromise = null;
            
            if (error.name === 'AbortError') {
                reject(new Error("RoValra API request timed out."));
            } else {
                reject(error);
            }
        }
    });
    
    return rovalraApiDataPromise;
}
async function clearFilter() {
    if (currentFetchController) {
        currentFetchController.abort();
    }

    await applyFilter(null, null, true);

    document.getElementById('rovalra-load-more-btn')?.remove();

    const serverListContainer = document.querySelector('#rbx-public-game-server-item-container');
    if (serverListContainer) {
        serverListContainer.innerHTML = ''; 

        if (originalServerElements.length > 0) {
            originalServerElements.forEach(element => {
                serverListContainer.appendChild(element);
            });
            originalServerElements = []; 
        } else {
            serverListContainer.innerHTML = '<p class="text-info" style="padding: 20px; text-align: center;">Filter cleared. Please click the original refresh button to reload servers.</p>';
        }
    }

    if (refreshButton) {
        setTimeout(() => {
            refreshButton.click();
        }, 50); 
    }
}
async function preFetchGlobeData() {
    if (isPreFetchingGlobeData || preFetchedJoinStatus) {
        return;
    }
    isPreFetchingGlobeData = true;

    const checkJoinability = async () => {
        let targetServerId = null;
        try {
            const serverListUrl = `https://games.roblox.com/v1/games/${gameId}/servers/Public?limit=10&sortOrder=1`;
            const response = await fetch(serverListUrl, { credentials: 'include' });
            if (response.ok) {
                const pageData = await response.json();
                if (pageData && pageData.data) {
                    const suitableServer = pageData.data.find(server => server.playing < server.maxPlayers);
                    if (suitableServer) targetServerId = suitableServer.id;
                }
            }
        } catch (error) {
            preFetchedJoinStatus = 'SUCCESS';
            return;
        }

        if (!targetServerId) {
            preFetchedJoinStatus = 'SUCCESS';
            return;
        }

        const token = await getGlobalCsrfToken();
        if (!token) {
            preFetchedJoinStatus = 'UNKNOWN';
            return;
        }

        try {
            const response = await fetch(`https://gamejoin.roblox.com/v1/join-game-instance`, {
                method: 'POST',
                headers: { "Accept": "application/json", "Content-Type": "application/json", "X-Csrf-Token": token },
                body: JSON.stringify({ placeId: parseInt(gameId, 10), gameId: targetServerId, gameJoinAttemptId: createUUID() }),
                credentials: 'include',
            });
            const serverInfo = await response.json();
            if (serverInfo && serverInfo.status === 12) {
                const message = serverInfo.message || "";
                if (message.includes("Cannot join this non-root place")) preFetchedJoinStatus = 'RESTRICTED';
                else if (message.includes("You need to purchase access")) preFetchedJoinStatus = 'PAID_ACCESS';
                else preFetchedJoinStatus = 'SUCCESS';
            } else {
                preFetchedJoinStatus = 'SUCCESS';
            }
        } catch (error) {
            preFetchedJoinStatus = 'UNKNOWN';
        }
    };

    await checkJoinability();
    
    isPreFetchingGlobeData = false;
}

function createDropdown() {
    const theme = detectTheme();

    const panelAlignmentStyles = document.createElement('style');
    panelAlignmentStyles.textContent = `
        .rovalra-filter-dropdown-content {
            top: 20px;
            margin-top: 0;
            padding: 8px; 
        }
        .rovalra-filter-item {
            margin: 0;
        }
        .rovalra-side-panel, #rovalra-globe-panel {
            top: 20px;
        }
    `;
    document.head.appendChild(panelAlignmentStyles);


    const mainContainer = document.createElement('div');
    mainContainer.className = 'filter-dropdown-container';

    const controlsWrapper = document.createElement('div');
    controlsWrapper.id = 'rovalra-main-controls';
    controlsWrapper.style.display = 'flex';
    controlsWrapper.style.alignItems = 'center';

    const filterIconSVG = `<svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M6 12H18M3 6H21M9 18H15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
    const button = document.createElement('button');
    button.innerHTML = `<span>Filter</span>${filterIconSVG}`;

    controlsWrapper.appendChild(button);

    const dropdownContent = document.createElement('div');
    dropdownContent.className = `rovalra-filter-dropdown-content ${theme}`;

    const playerCountPanel = document.createElement('div');
    playerCountPanel.id = 'rovalra-player-count-panel';
    playerCountPanel.className = `rovalra-side-panel ${theme}`;
    playerCountPanel.innerHTML = `<div class="rovalra-side-panel-header ${theme}">Select Max Player Count</div><div class="rovalra-side-panel-list ${theme}"></div>`;

    createGlobePanel(mainContainer);

    mainContainer.append(controlsWrapper, dropdownContent, playerCountPanel);

    const header = document.createElement('div');
    header.className = `rovalra-filter-header ${theme}`;
    const iconUrl = chrome.runtime.getURL("Assets/icon-128.png");
    header.innerHTML = `<img src="${iconUrl}" style="width: 22px; height: 22px; margin-right: 8px; vertical-align: middle; cursor: default;"><p class="title">Filter Options</p>`;
    const listContainer = document.createElement('div');
    listContainer.className = `rovalra-filter-list ${theme}`;
    dropdownContent.append(header, listContainer);

    const showErrorOverlay = (overlayMessage, statusMessage) => {
        const globePanel = document.getElementById('rovalra-globe-panel');
        if (globePanel) {
            globePanel.classList.add('show');
        }

        const overlayElement = document.getElementById('rovalra-globe-error-overlay');
        const overlayTextElement = document.getElementById('rovalra-globe-error-overlay-text');
        if (overlayElement && overlayTextElement) {
            overlayTextElement.textContent = overlayMessage;
            overlayElement.style.display = 'flex';
        }

        const statusContainerElement = document.getElementById('rovalra-globe-status-container');
        if (statusContainerElement) {
            statusContainerElement.innerHTML = `<span style="color: var(--text-warning);">${statusMessage}</span>`;
            statusContainerElement.classList.remove('rovalra-hidden');
        }

        const regionFilterItem = document.querySelector('[data-action="toggleServerRegion"]');
        if (regionFilterItem) {
            regionFilterItem.querySelector('.spinner')?.remove();
        }
    };

    const groupedItems = menuItems.reduce((acc, item) => ((acc[item.group] = acc[item.group] || []).push(item), acc), {});
    for (const groupName in groupedItems) {
        const groupHeader = document.createElement('div');
        groupHeader.className = `rovalra-filter-group-header ${theme}`;
        groupHeader.textContent = groupName;
        listContainer.appendChild(groupHeader);
        groupedItems[groupName].forEach(item => {
            const link = document.createElement('a');
            link.className = `rovalra-filter-item ${theme}`;
            link.dataset.action = item.action;
            link.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${item.svg}</svg><span>${item.label}</span>`;
            listContainer.appendChild(link);
        });
    }

    const closeAllPanels = (except = []) => {
        const exceptions = Array.isArray(except) ? except : [except];

        if (!exceptions.includes('dropdown')) {
            dropdownContent.classList.remove('show');
        }
        if (!exceptions.includes('player')) {
            playerCountPanel.classList.remove('show');
            document.querySelector('[data-action="togglePlayerCount"]')?.classList.remove('active');
        }
        if (!exceptions.includes('region')) {
            const globePanel = document.getElementById('rovalra-globe-panel');
            if (globePanel && globePanel.classList.contains('show')) {
                globePanel.classList.remove('show');
                isGlobeOpen = false;
                if (backgroundRegionFetchController && !backgroundRegionFetchController.signal.aborted) {
                    backgroundRegionFetchController.abort();
                }
                const regionFilterItem = document.querySelector('[data-action="toggleServerRegion"]');
                if (regionFilterItem) {
                    regionFilterItem.querySelector('.spinner')?.remove();
                }
            }
            document.querySelector('[data-action="toggleServerRegion"]')?.classList.remove('active');
        }
    };

    button.addEventListener('click', e => {
        e.stopPropagation();
        const isShowing = dropdownContent.classList.toggle('show');
        
        if (isShowing) {
            preFetchGlobeData();
        }
        
        if (!isShowing) closeAllPanels();
    });

    document.addEventListener('rovalraRegionSelected', (e) => {
        if (e.detail && e.detail.regionCode) {
            applyFilter('filterByRegion', e.detail.regionCode);
            closeAllPanels();
        }
    });

    dropdownContent.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = e.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;

        if (action === 'togglePlayerCount') {
            const isActive = target.classList.toggle('active');
            closeAllPanels(['dropdown', 'player']);
            playerCountPanel.classList.toggle('show', isActive);

            const playerCountList = playerCountPanel.querySelector('.rovalra-side-panel-list');
            if (isActive && playerCountList.children.length === 0) {
                const maxPlayers = getMaxServerSize();
                for (let i = maxPlayers - 1; i >= 1; i--) {
                    const option = document.createElement('a');
                    option.className = `rovalra-side-panel-item ${theme}`;
                    option.innerHTML = `<span>${i} players or less</span>`;
                    option.dataset.action = 'filterByMaxPlayers';
                    option.dataset.value = i;
                    playerCountList.appendChild(option);
                }
            }
        } else if (action === 'toggleServerRegion') {
            const globePanel = document.getElementById('rovalra-globe-panel');
            const overlay = document.getElementById('rovalra-globe-error-overlay');
            const isCurrentlyActive = target.classList.contains('active');

            closeAllPanels(['dropdown']);

            if (isCurrentlyActive) {
                target.classList.remove('active');
                isGlobeOpen = false;

                if (globePanel) globePanel.classList.remove('show');
                if (overlay) overlay.style.display = 'none';

                if (backgroundRegionFetchController && !backgroundRegionFetchController.signal.aborted) {
                    backgroundRegionFetchController.abort();
                }
                const regionFilterItem = document.querySelector('[data-action="toggleServerRegion"]');
                if (regionFilterItem) {
                    regionFilterItem.querySelector('.spinner')?.remove();
                }
            } else {
                target.classList.add('active');
                isGlobeOpen = true;

                if (preFetchedJoinStatus === 'RESTRICTED') {
                    showErrorOverlay('The subplace cannot be joined.', 'Join Restricted');
                    return; 
                }
                if (preFetchedJoinStatus === 'PAID_ACCESS') {
                    showErrorOverlay('You need to buy the game.', 'Paid Access');
                    return; 
                }

                if (globePanel) globePanel.classList.add('show');
                if (!backgroundRegionFetchController || backgroundRegionFetchController.signal.aborted) {
                    backgroundRegionFetchController = new AbortController();
                    const signal = backgroundRegionFetchController.signal;
                    startSequentialRegionFetch(signal);
                }
            }
        } else {
            applyFilter(action, target.dataset.value || null);
            closeAllPanels();
        }
    });

    playerCountPanel.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = e.target.closest('[data-action]');
        if(target) {
            applyFilter(target.dataset.action, target.dataset.value || null);
            closeAllPanels();
        }
    });

    return mainContainer;
}
function createGlobePanel(container) {
    const theme = detectTheme();
    const globePanel = document.createElement('div');
    globePanel.id = 'rovalra-globe-panel';
    globePanel.className = theme;

    const globeHeader = document.createElement('div');
    globeHeader.className = `rovalra-globe-header ${theme}`;

    const title = document.createElement('h3');
    title.className = `rovalra-globe-title ${theme}`;
    const iconUrl = chrome.runtime.getURL("Assets/icon-128.png");

    const setTitleContent = (text) => {
        title.innerHTML = `<img src="${iconUrl}" style="width: 24px; height: 24px; margin-right: 8px; vertical-align: middle; cursor: default;">${text}`;
    };

    setTitleContent("RoValra Region Selector"); 

    let iconClickCount = 0;
    let isEasterEggActive = false;

    title.addEventListener('click', (e) => {
        if (e.target.tagName === 'IMG') {
            iconClickCount++;
            if (iconClickCount % 10 === 0) {
                isEasterEggActive = !isEasterEggActive; 

                if (isEasterEggActive) {
                    setTitleContent("Gilbert's in your area!");
                    document.dispatchEvent(new CustomEvent('rovalraGlobeEasterEgg', {
                        detail: { iconUrl: iconUrl }
                    }));
                } else {
                    setTitleContent("RoValra Region Selector");
                    document.dispatchEvent(new CustomEvent('rovalraGlobeEasterEggOff'));
                }
            }
        }
    });

    const statusContainer = document.createElement('div');
    statusContainer.id = 'rovalra-globe-status-container';
    statusContainer.className = `rovalra-globe-status ${theme} rovalra-hidden`;
    statusContainer.innerHTML = ``;

    globeHeader.append(title, statusContainer);

    const globeContainer = document.createElement('div');
    globeContainer.id = 'rovalra-globe-container';

    const tooltip = document.createElement('div');
    tooltip.id = 'rovalra-globe-tooltip';

    const overlay = document.createElement('div');
    overlay.id = 'rovalra-globe-error-overlay';
    Object.assign(overlay.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        display: 'none', 
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: '10',
        textAlign: 'center',
        backdropFilter: 'blur(5px)',
        webkitBackdropFilter: 'blur(5px)',
        backgroundColor: (theme === 'dark') ? 'rgba(28, 30, 36, 0.6)' : 'rgba(255, 255, 255, 0.6)'
    });

    const overlayText = document.createElement('div');
    overlayText.id = 'rovalra-globe-error-overlay-text';
    Object.assign(overlayText.style, {
        fontSize: '22px',
        fontWeight: '700',
        padding: '20px',
        color: (theme === 'dark') ? '#FFFFFF' : '#333333',
        textShadow: '0 1px 3px rgba(0,0,0,0.3)'
    });
    overlay.appendChild(overlayText);

    globePanel.append(globeHeader, globeContainer, tooltip, overlay);
    container.appendChild(globePanel);

    globePanel.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    const showErrorOverlay = (overlayMessage, statusMessage) => {
        const overlayElement = document.getElementById('rovalra-globe-error-overlay');
        const overlayTextElement = document.getElementById('rovalra-globe-error-overlay-text');
        if (overlayElement && overlayTextElement) {
            overlayTextElement.textContent = overlayMessage;
            overlayElement.style.display = 'flex';
        }

        const statusContainerElement = document.getElementById('rovalra-globe-status-container');
        if (statusContainerElement) {
            statusContainerElement.innerHTML = `<span style="color: var(--text-warning);">${statusMessage}</span>`;
            statusContainerElement.classList.remove('rovalra-hidden');
        }

        const regionFilterItem = document.querySelector('[data-action="toggleServerRegion"]');
        if (regionFilterItem) {
            regionFilterItem.querySelector('.spinner')?.remove();
        }
    };

    document.addEventListener('rovalraSubplaceCannotBeJoined', () => {
        showErrorOverlay('The subplace cannot be joined.', 'Join Restricted');
    });

    document.addEventListener('rovalraGameNotOwned', () => {
        showErrorOverlay('You need to buy the game.', 'Paid Access');
    });


    let globeInitialized = false;
    let updateListenerAttached = false;
    let latestServerCounts = {};
    let currentHoveredRegion = null;

    const observer = new MutationObserver(mutations => {
        if (mutations[0].target.classList.contains('show') && !globeInitialized) {
            initGlobe();
            globeInitialized = true;
        } else if (mutations[0].target.classList.contains('show')) {
             document.dispatchEvent(new CustomEvent('rovalraGlobeOpened'));
        }
    });
    observer.observe(globePanel, { attributes: true, attributeFilter: ['class'] });

    const getLocationName = (region) => {
        if (region.city === region.country) {
            return region.city;
        }
        if (region.state) {
            return `${region.city}, ${region.state}, ${region.country}`;
        }
        return `${region.city}, ${region.country}`;
    };

async function initGlobe() {
    let initialApiServerCounts = {};

    const injectScript = (filePath) => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL(filePath);
        script.onload = () => { script.remove(); resolve(); };
        script.onerror = (err) => { script.remove(); reject(new Error(`Failed to load script: ${filePath}`)); };
        (document.head || document.documentElement).appendChild(script);
    });

    try {
        await injectScript('data/Three.js');
        await injectScript('data/OrbitControls.js');
        await injectScript('data/globe_initializer.js');

        const currentTheme = detectTheme();
        const mapTextureFile = currentTheme === 'dark' ? 'data/map_dark.png' : 'data/map_light.png';
        const finalMapUrl = chrome.runtime.getURL(mapTextureFile);

        const initialEventData = {
            REGIONS,
            mapUrl: finalMapUrl,
            theme: currentTheme,
            serverCounts: {},
            dataCenterCounts: dataCenterCounts
        };
        document.dispatchEvent(new CustomEvent('initRovalraGlobe', { detail: initialEventData }));

        const fetchApiCountsInBackground = async () => {
            try {
                const data = await getRovalraApiData(gameId);
                if (data && data.counts && data.counts.regions) {
                    const normalizedCounts = {};
                    for (const key in data.counts.regions) {
                        normalizedCounts[key.toUpperCase()] = data.counts.regions[key];
                    }
                    initialApiServerCounts = normalizedCounts;
                }
            } catch (e) {
            }
        };


        fetchApiCountsInBackground();

        if (!updateListenerAttached) {
            document.addEventListener('rovalraUpdateGlobeCounts', (e) => {
                latestServerCounts = e.detail;
                document.dispatchEvent(new CustomEvent('rovalraGlobe_UpdateData', {
                    detail: { serverCounts: latestServerCounts }
                }));
            });
            updateListenerAttached = true;
        }

        const tooltipEl = document.getElementById('rovalra-globe-tooltip');
        const tooltipObserver = new MutationObserver(() => {
            if (tooltipEl.style.display !== 'none') {
                const textContent = tooltipEl.textContent || "";
                let foundRegion = null;

                for (const continent in REGIONS) {
                    for (const regionCode in REGIONS[continent]) {
                        const regionData = REGIONS[continent][regionCode];
                        if (textContent.includes(regionData.city) && textContent.includes(regionData.country)) {
                            foundRegion = { ...regionData, code: regionCode };
                            break;
                        }
                    }
                    if (foundRegion) break;
                }

                if (foundRegion) {
                    const realServerCount = latestServerCounts[foundRegion.code] || 0;
                    const dcCount = dataCenterCounts[foundRegion.code] || 0;
                    const countryCode = foundRegion.code.split('-')[0].toUpperCase();
                    const stateCodeKey = foundRegion.state ? `${countryCode}-${foundRegion.state.toUpperCase()}` : null;

                    let apiCount = 0;
                    if (stateCodeKey && initialApiServerCounts[stateCodeKey]) {
                        apiCount = initialApiServerCounts[stateCodeKey];
                    } else if (initialApiServerCounts[countryCode]) {
                        apiCount = initialApiServerCounts[countryCode];
                    }

                    const flagCountryCode = foundRegion.code.split('-')[0];
                    const flagPath = COUNTRY_CODE_TO_FLAG[flagCountryCode] || COUNTRY_CODE_TO_FLAG['UNKNOWN'];
                    const flagUrl = chrome.runtime.getURL(flagPath);
                    const flagHTML = `<img src="${flagUrl}" class="flag-icon">`;
                    const locationName = getLocationName(foundRegion);

                    const newTooltipHTML = `
                        <div class="tooltip-line">${flagHTML}<span>${locationName}</span></div>
                        Servers: ${realServerCount} / ${apiCount}<br>
                        Data Centers: ${dcCount}
                    `;

                    if (tooltipEl.innerHTML !== newTooltipHTML) {
                       tooltipEl.innerHTML = newTooltipHTML;
                    }
                }
            }
        });

        tooltipObserver.observe(tooltipEl, {
            attributes: true, attributeFilter: ['style'], childList: true, subtree: true
        });

    } catch (error) {
        globeContainer.innerHTML = `<div class="rovalra-stats-loader text-error">Error initializing globe.<br>Check console for details.</div>`;
    }
}
}


let hasAttemptedStatsBarInit = false;

async function initGlobalStatsBar() {
    if (hasAttemptedStatsBarInit) {
        return;
    }

    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
        if (typeof pageObserver !== 'undefined' && pageObserver) {
            pageObserver.disconnect();
        }
        return;
    }

    let settings;
    try {
        settings = await new Promise((resolve, reject) => {
            chrome.storage.local.get(['TotalServersEnabled'], result => {
                if (chrome.runtime.lastError) {
                    return reject(chrome.runtime.lastError);
                }
                resolve(result);
            });
        });
    } catch (error) {
        if (error.message.includes('Extension context invalidated')) {
            if (typeof pageObserver !== 'undefined' && pageObserver) {
                pageObserver.disconnect();
            }
        } else {
        }
        return;
    }

    if (settings.TotalServersEnabled !== true) {
        return;
    }

    const serverListContainer = document.getElementById('rbx-public-running-games');
    if (!serverListContainer || serverListContainer.querySelector('.rovalra-region-stats-bar')) {
        return;
    }

    const header = serverListContainer.querySelector('.container-header');
    if (!header) return;

    hasAttemptedStatsBarInit = true;

    const theme = detectTheme();
    const statsBar = document.createElement('div');
    statsBar.className = `rovalra-region-stats-bar ${theme}`;
    statsBar.innerHTML = `<div class="rovalra-stats-loader"></span> Loading server stats...</div>`;

    header.insertAdjacentElement('afterend', statsBar);

   (async () => {
        try {
            const placeId = serverListContainer.dataset.placeid;
            if (!placeId) throw new Error("Could not find data-placeid attribute.");

            const data = await getRovalraApiData(placeId);

            if (!data || data.status !== 'success' || !data.counts) {
                throw new Error("API returned an error or invalid data.");
            }

            const counts = data.counts;
            const hasRegions = counts.regions && Object.keys(counts.regions).length > 0;
            if (counts.total_servers === 0 || !hasRegions) {
                statsBar.remove();
                return;
            }

            const createStatItem = (icon, label, value) => `
                <div class="rovalra-stat-item">
                    <div class="stat-icon">${icon}</div>
                    <div class="stat-text">
                        <span class="stat-value">${value.toLocaleString()}</span>
                        <span class="stat-label">${label}</span>
                    </div>
                </div>`;

            const totalIcon = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M6 6H6.01M6 18H6.01M5.2 10H18.8C19.9201 10 20.4802 10 20.908 9.78201C21.2843 9.59027 21.5903 9.28431 21.782 8.90798C22 8.48016 22 7.92011 22 6.8V5.2C22 4.0799 22 3.51984 21.782 3.09202C21.5903 2.71569 21.2843 2.40973 20.908 2.21799C20.4802 2 19.9201 2 18.8 2H5.2C4.07989 2 3.51984 2 3.09202 2.21799C2.71569 2.40973 2.40973 2.71569 2.21799 3.09202C2 3.51984 2 4.07989 2 5.2V6.8C2 7.92011 2 8.48016 2.21799 8.90798C2.40973 9.28431 2.71569 9.59027 3.09202 9.78201C3.51984 10 4.0799 10 5.2 10ZM5.2 22H18.8C19.9201 22 20.4802 22 20.908 21.782C21.2843 21.5903 21.5903 21.2843 21.782 20.908C22 20.4802 22 19.9201 22 18.8V17.2C22 16.0799 22 15.5198 21.782 15.092C21.5903 14.7157 21.2843 14.4097 20.908 14.218C20.4802 14 19.9201 14 18.8 14H5.2C4.07989 14 3.51984 14 3.09202 14.218C2.71569 14.4097 2.40973 14.7157 2.21799 15.092C2 15.5198 2 16.0799 2 17.2V18.8C2 19.9201 2 20.4802 2.21799 20.908C2.40973 21.2843 2.71569 21.5903 3.09202 21.782C3.51984 22 4.0799 22 5.2 22Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
        
            const statsHTML = createStatItem(totalIcon, 'Total Servers', counts.total_servers);
            statsBar.innerHTML = statsHTML;

        } catch (error) {
            statsBar.remove(); 
        }
    })(); 
}


    async function init() {
       if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
        if (typeof pageObserver !== 'undefined' && pageObserver) {
            pageObserver.disconnect();
        }
        return;
    }
    // R​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​o​​​​​​​---V​​​​​​​​a​​​​​​​​​​​​​​​​​​​​​​​a​​​​​​​​​lra
    let settings;
    try {
        settings = await new Promise((resolve, reject) => {
            chrome.storage.local.get(['ServerFilterEnabled'], result => {
                if (chrome.runtime.lastError) {
                    return reject(chrome.runtime.lastError);
                }
                resolve(result);
            });
        });
    } catch (error) {
        if (error.message.includes('Extension context invalidated')) {
            if (typeof pageObserver !== 'undefined' && pageObserver) {
                pageObserver.disconnect();
            }
        } else {
        }
        return;
    }

    if (settings.ServerFilterEnabled !== true) {
        return;
    }


    const placeIdMatch = window.location.pathname.match(/\/games\/(\d+)\//);
    if (placeIdMatch) {
        gameId = placeIdMatch[1];
    } else {
        return;
    }

    await loadServerIpMap();

    // --- START: MODIFIED LOGIC ---

    const runningGamesContainer = document.getElementById('rbx-public-running-games');
    if (!runningGamesContainer) {
        console.log('RoValra: Main container with ID "rbx-public-running-games" was not found. Aborting init.');
        return;
    }

    // Check if our filter is already on the page to prevent re-injection
    if (runningGamesContainer.querySelector('.filter-dropdown-container')) {
        return;
    }

    // Find a stable element to determine where to insert our UI.
    // The refresh button is a good candidate.
    const refreshButton = runningGamesContainer.querySelector('.rbx-refresh');
    const robloxFilter = runningGamesContainer.querySelector('.rbx-filter');

    // Determine the exact element to insert our filter BEFORE.
    const insertionPoint = robloxFilter || refreshButton;

    if (insertionPoint && insertionPoint.parentNode) {
        // THIS IS THE KEY FIX:
        // Get the parent directly from the element we are inserting before.
        // This guarantees the parent-child relationship is valid.
        const parentNode = insertionPoint.parentNode;

        const filterDropdown = createDropdown();
        const filterButton = filterDropdown.querySelector('button');

        // Style our button to look like the others
        if (refreshButton) {
            filterButton.className = refreshButton.className;
            originalRefreshButtonClickHandler = refreshButton.onclick;
        } else {
            filterButton.className = "btn-control-xs btn-more";
        }
        filterButton.classList.add('filter-button-alignment');
        filterButton.classList.remove('rbx-refresh');

        // Perform the insertion on the GUARANTEED correct parent.
        parentNode.insertBefore(filterDropdown, insertionPoint);
        console.log("RoValra: Filter UI successfully inserted.");

    } else {
        console.log("RoValra: Could not find a suitable insertion point (Roblox filter or refresh button).");
    }

    // This function can be called after insertion to ensure correct visual order if needed.
    reorderFilterIfNecessary();

        if (!targetHeader || targetHeader.querySelector('.filter-dropdown-container')) return;

        refreshButton = targetHeader.querySelector('.rbx-refresh');

        if (insertionPoint) {
            const filterDropdown = createDropdown();
            const filterButton = filterDropdown.querySelector('button');
            if (refreshButton) {
                filterButton.className = refreshButton.className;
                originalRefreshButtonClickHandler = refreshButton.onclick;
            } else {
                filterButton.className = "btn-control-xs btn-more";
            }
            filterButton.classList.add('filter-button-alignment');
            filterButton.classList.remove('rbx-refresh');
            targetHeader.insertBefore(filterDropdown, insertionPoint);
        }
    }

    function reorderFilterIfNecessary() {
        const ourFilter = document.querySelector('.filter-dropdown-container');
        if (!ourFilter) return;
        const parentHeader = ourFilter.parentElement;
        const robloxFilter = parentHeader?.querySelector('.rbx-filter');
        if (!robloxFilter) return;
        if (robloxFilter.previousSibling !== ourFilter) {
            parentHeader.insertBefore(ourFilter, robloxFilter);
        }
    }

    window.addEventListener('click', () => {
        document.querySelector('.rovalra-filter-dropdown-content.show')?.classList.remove('show');
        document.querySelector('#rovalra-player-count-panel.show')?.classList.remove('show');

        const globePanel = document.getElementById('rovalra-globe-panel');
        if (globePanel?.classList.contains('show')) {
            globePanel.classList.remove('show');
            isGlobeOpen = false;
             if (backgroundRegionFetchController) {
                 backgroundRegionFetchController.abort();
             }
             const regionFilterItem = document.querySelector('[data-action="toggleServerRegion"]');
             if (regionFilterItem) {
                regionFilterItem.querySelector('.spinner')?.remove();
             }
        }

        document.querySelector('.rovalra-filter-item.active')?.classList.remove('active');
    });

    const observer = new MutationObserver(() => {
        init(); 
        initGlobalStatsBar(); 
    });
    observer.observe(document.body, { childList: true, subtree: true });

    init();
    initGlobalStatsBar();

})();