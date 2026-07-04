// background.js
chrome.runtime.onInstalled.addListener(() => {
  // Enables the side panel to open upon clicking the extension icon
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));
});
