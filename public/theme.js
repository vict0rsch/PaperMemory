(async () => {
    const theme = async () => {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get("prefs", ({ prefs }) => {
                resolve(prefs && prefs.checkDarkMode);
            });
        });
    };

    const darkMode = await theme();

    if (darkMode) {
        var link = document.createElement("link");
        link.href = chrome.runtime.getURL("dark.css");
        link.type = "text/css";
        link.rel = "stylesheet";
        setTimeout(() => {
            document.head.appendChild(link);
        }, 1);

        if (window.location.href.includes("options.html")) {
            var optLink = document.createElement("link");
            optLink.href = chrome.runtime.getURL("github-dark-dimmed.css");
            optLink.type = "text/css";
            optLink.rel = "stylesheet";
            setTimeout(() => {
                document.head.appendChild(optLink);
            }, 1);
        }
    }
})();
