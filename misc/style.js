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
        color: white;
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
  .region-button {
    padding: 10px 15px;
    background-color: #24292e;
    border: 1px solid #444;
    border-radius: 6px;
    cursor: pointer;
    font-size: 15px;
    font-weight: 600;
    color: white;
    flex: 1;
    min-width: 100px;
    margin: 4px;
    text-align: center;
    transition: background-color 0.3s ease, transform 0.3s ease;
        height: 44px;
}
.region-button:hover {
        background-color: #4c5053;
         border-radius: 6px;
         border-color: #24292e;
         transform: scale(1.05);
}
  /* Region Button Styles (Light Mode)*/
    .region-button.light-mode {
        background-color: #e1e4e8;
         border: 1px solid #d1d5da;
        color: #24292e;
    }
    .region-button.light-mode:hover {
        background-color: #f0f3f6;
         border-color: #c6cbd1;
    }
      /*Filter Button Styles (Dark Mode)*/
.filter-button {
        padding: 10px 15px;
        background-color: #0366d6;
        border: 1px solid #0366d6;
        border-radius: 6px;
        cursor: pointer;
        font-size: 15px;
        font-weight: 600;
        color: White;
         flex: 1 1 0%;
        min-width: 80px;
        margin: 0px;
         margin-top: 5px;
        text-align: center;
        transition: background-color 0.3s, transform 0.3s;
        transform: scale(1);
          height: 44px;
}
.filter-button:hover {
    background-color: #0366d6;
    border-radius: 6px;
    border-color: #0366d6;
    transform: scale(1.05);
}
 /* Filter Button Styles (Light Mode)*/
   .filter-button.light-mode {
         background-color: #e1e4e8;
         border: 1px solid #d1d5da;
         color: #24292e;
   }
    .filter-button.light-mode:hover {
        background-color: #f0f3f6;
          border-color: #c6cbd1;
   }
    /* Dropdown Styles (Dark Mode) */
.filter-dropdown{
     display: none;
    position: absolute;
    top: calc(100% + 3px);
    left: 0;
    background-color: #393b3d;
    border: 1px solid #444;
    border-radius: 6px;
    z-index: 1001;
    padding: 5px;
     width: 160px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
    /* Dropdown Styles (Light Mode) */
.filter-dropdown.light-mode{
     background-color: #f0f3f6;
     border: 1px solid #c6cbd1;
    }

   /* Dropdown Option Styles (Dark Mode) */
.filter-dropdown-option {
     display: block;
    width: 100%;
    padding: 8px;
    border: none;
    background-color: #24292e;
    color: white;
    cursor: pointer;
     text-align: left;
    font-size: 15px;
    font-weight: 600;
      transition: background-color 0.3s ease;
}
.filter-dropdown-option:hover {
    background-color: #4c5053;
     border-radius: 6px;
      border-color: #24292e;
}
   /* Dropdown Option Styles (Light Mode) */
  .filter-dropdown-option.light-mode {
        background-color: #e1e4e8;
        color: #24292e;
    }
  .filter-dropdown-option.light-mode:hover {
        background-color: #f0f3f6;
        border-color: #c6cbd1;
    }
 /* Dropdown Tooltip Styles (Dark Mode) */
 .filter-dropdown-option-tooltip {
    position: absolute;
    left: 105%;
    top: 0;
     padding: 5px;
    background-color: #212323;
     border: 1px solid #444;
     border-radius: 6px;
     display: none;
    width: 150%;
}
  /* Dropdown Tooltip Styles (Light Mode) */
 .filter-dropdown-option-tooltip.light-mode {
        background-color: #f0f3f6;
        border: 1px solid #c6cbd1;
        color: #24292e;
}
.server-buttons-container {
   display: flex;
   flex-wrap: wrap;
   gap: 9px;
   margin-top: 10px;
   padding: 8px;
   background-color: #393b3d;
    border-radius: 6px;
   box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
   margin-bottom: 8px;
}
/* Buttons Container Light Mode */
 .server-buttons-container.light-mode {
     background-color: #f0f3f6;
     border: 1px solid #c6cbd1;
}
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