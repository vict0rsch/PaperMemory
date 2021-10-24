const __theme = async () => {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get("checkDarkMode", (data) => {
            resolve(data && data["checkDarkMode"]);
        });
    });
};

const darkMode = await __theme();
console.log("darkMode: ", darkMode);

if (darkMode) {
    var link = document.createElement("link");
    link.href = chrome.runtime.getURL("src/popup/popup-css/dark.min.css");
    link.type = "text/css";
    link.rel = "stylesheet";
    document.head.appendChild(link);
}
