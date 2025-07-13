// I dont like this script, i dont like doign stuff like this i dont like hazelnut
const style = document.createElement('style');
style.textContent = `
   
    .tab-button {
        margin-left: 10px;
        padding: 5px 10px;
        background-color: #444;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
    }
     .tab-button:hover {
        background-color: #555;
    }
      .active-tab {
        background-color: #666;
    }
     .game-item {
        background-color: #333;
        color: white;
        padding: 10px;
        margin: 5px 0;
        border-radius: 5px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: pointer;
        transition: box-shadow 0.3s ease-in-out;
    }
    .game-name {
        display: inline-block;
    }
    .game-item:hover {
        box-shadow: 0 0 15px 5px rgba(255, 255, 255, 0.7);
    }
    .game-item a {
        display: none;
    }
    .hidden-games-list {
        margin-top: 20px;
    }
    .rate-limited-message{
      color:red;
    }
    /* Sniper Button Styles (Dark Mode) */
    .snipe-button {
        padding: 10px 15px;
        background-color: #24292e;
        border: 1px solid #444;
        border-radius: 6px;
        cursor: pointer;
        font-size: 15px;
        font-weight: 600;
        color: white;
        flex-grow: 1;
        flex-shrink: 1;
        min-width: 50px;
        text-align: center;
        transition: background-color 0.3s ease, transform 0.3s ease;
    }
    .snipe-button:hover {
        background-color: #4c5053;
        border-color: #24292e;
        transform: scale(1.05);
    }
        /* Sniper Button Styles (Light Mode) */
    .snipe-button.light-mode {
        background-color: #e1e4e8;
         border: 1px solid #d1d5da;
        color: #24292e;
    }
     .snipe-button.light-mode:hover {
         background-color: #f0f3f6;
         border-color: #c6cbd1;
    }

    /* Confirmation Overlay Button Styles (Dark Mode)*/
    .confirm-button {
        padding: 10px 15px;
        background-color: #24292e;
        border: 1px solid #444;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13.4px;
        font-weight: 600;
        color: white;
        flex-grow: 0;
        flex-shrink: 0;
        min-width: 50px;
        text-align: center;
        transition: background-color 0.3s ease, transform 0.3s ease;
        width: auto;
        border-color: #4c5053;
    }
    .confirm-button:hover {
         background-color: #4c5053;
        border-radius: 6px;
         border-color: #24292e;
        transform: scale(1.05);
    }
    .cancel-button {
        padding: 10px 15px;
        background-color: #24292e;
        border: 1px solid #444;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13.4px;
        font-weight: 600;
        color: white;
         flex-grow: 0;
        flex-shrink: 0;
        min-width: 50px;
         text-align: center;
        transition: background-color 0.3s ease, transform 0.3s ease;
       width: auto;
       border-color: #4c5053;
    }
     .cancel-button:hover {
          background-color: #4c5053;
         border-radius: 6px;
          border-color: #24292e;
         transform: scale(1.05);
    }
     /* Confirmation Overlay Button Styles (Light Mode)*/
    .confirm-button.light-mode {
        background-color: #e1e4e8;
        border: 1px solid #d1d5da;
        color: #24292e;
    }
    .confirm-button.light-mode:hover {
        background-color: #f0f3f6;
        border-color: #c6cbd1;
    }
        .cancel-button.light-mode {
         background-color: #e1e4e8;
        border: 1px solid #d1d5da;
        color: #24292e;
    }
     .cancel-button.light-mode:hover {
        background-color: #f0f3f6;
        border-color: #c6cbd1;
    }
    
    /* Region Button Styles (Dark Mode)*/
  
`;
document.head.appendChild(style);

function toggleLightMode(enable) {
    const snipeButtons = document.querySelectorAll('.snipe-button');
    const confirmButtons = document.querySelectorAll('.confirm-button');
    const cancelButtons = document.querySelectorAll('.cancel-button');
    const regionButtons = document.querySelectorAll('.region-button');
     const filterButtons = document.querySelectorAll('.filter-button');
     const filterDropdowns = document.querySelectorAll('.filter-dropdown');
     const filterDropdownOptions = document.querySelectorAll('.filter-dropdown-option')
     const filterDropdownTooltips = document.querySelectorAll('.filter-dropdown-option-tooltip');
    const buttonContainers = document.querySelectorAll(".server-buttons-container")
    const elements = [snipeButtons, confirmButtons, cancelButtons, regionButtons, filterButtons,filterDropdowns,filterDropdownOptions,filterDropdownTooltips,buttonContainers];
    elements.forEach(elementList => {
    elementList.forEach(element => {
      if (enable) {
          element.classList.add('light-mode');
      } else {
           element.classList.remove('light-mode');
      }
     });
    })
  }

(function() {
    const prefersLightMode = window.matchMedia('(prefers-color-scheme: light)').matches;
    toggleLightMode(prefersLightMode);

    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (event) => {
        toggleLightMode(event.matches);
});
})();