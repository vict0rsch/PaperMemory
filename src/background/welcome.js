// First run: the welcome page (src/entrypoints/welcome) opens once, when the extension is
// installed; never on an update of PaperMemory or of the browser.

/**
 * runtime.onInstalled listener
 * @param {{reason: string}} details
 */
export const openWelcomeOnInstall = ({ reason }) => {
    if (reason !== "install") return;
    chrome.tabs.create({ url: chrome.runtime.getURL("/welcome.html") });
};
