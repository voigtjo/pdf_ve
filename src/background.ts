// Service Worker: öffnet beim ersten Installieren den Editor.

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    void chrome.tabs.create({ url: chrome.runtime.getURL('editor/index.html') });
  }
});
