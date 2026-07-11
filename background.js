chrome.runtime.onInstalled.addListener(() => {
  if (chrome.action && chrome.action.setBadgeText) {
    chrome.action.setBadgeText({ text: '' });
  }
});
