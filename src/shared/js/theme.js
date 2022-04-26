(async () => {
    const theme = async () => {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get("checkDarkMode", (data) => {
                resolve(data && data["checkDarkMode"]);
            });
        });
    };

    const darkMode = await theme();

    if (darkMode) {
        var link = document.createElement("link");
        link.href = chrome.runtime.getURL("src/popup/min/dark.min.css");
        link.type = "text/css";
        link.rel = "stylesheet";
        setTimeout(() => {
            document.head.appendChild(link);
        }, 1);

        if (window.location.href.includes("options.html")) {
            var optLink = document.createElement("link");
            optLink.href = chrome.runtime.getURL(
                "src/options/github-dark-dimmed.min.css"
            );
            optLink.type = "text/css";
            optLink.rel = "stylesheet";
            setTimeout(() => {
                document.head.appendChild(optLink);
            }, 1);
        }
    }
})();
