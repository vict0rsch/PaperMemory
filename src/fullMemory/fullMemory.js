var REFRESH_INTERVAL_SECS = 5 * 60;
// var REFRESH_INTERVAL_SECS = 20;

const adjustCss = () => {
    const container = document.getElementById("memory-filters");
    const searchBar = document.getElementById("memory-search");
    searchBar.style.width = `${0.4 * container.clientWidth}px`;
};

const autoRefresh = () => {
    if (window.location.href.includes("?noRefresh=true")) {
        warn("No auto refresh");
        return;
    }
    info(`Enabling auto refresh if inactive for ${REFRESH_INTERVAL_SECS} seconds.`);
    const reload = () => {
        window.location.reload();
    };

    let time;

    const resetTimer = () => {
        clearTimeout(time);
        time = setTimeout(reload, REFRESH_INTERVAL_SECS * 1000);
    };
    const events = ["click", "keypress", "touchstart"];
    events.forEach(function (name) {
        document.addEventListener(name, resetTimer, true);
    });
    resetTimer();
};

const syncOnBlur = async () => {
    if (!(await shouldSync())) return;
    window.addEventListener(
        "blur",
        delay(async () => {
            info("Syncing back and forth...");
            await pushToRemote();
            await initSyncAndState();
        }, 10e3)
    );
};

(async () => {
    await initSyncAndState();
    makeMemoryHTML();
    addListener("memory-search-clear-icon", "click", handleClearSearch);
    addListener(document, "scroll", displayOnScroll(false));
    // set default sort to lastOpenDate
    val("memory-select", "lastOpenDate");
    // set default sort direction arrow down
    setMemorySortArrow("down");
    adjustCss();
    autoRefresh();
    syncOnBlur();
})();
