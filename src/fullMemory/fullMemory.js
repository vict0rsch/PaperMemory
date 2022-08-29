var REFRESH_INTERVAL_SECS = 5 * 60;
// var REFRESH_INTERVAL_SECS = 20;

const adjustCss = () => {
    const container = document.getElementById("memory-filters");
    const searchBar = document.getElementById("memory-search");
    searchBar.style.width = `${0.4 * container.clientWidth}px`;
};

const autoRefresh = () => {
    if (window.location.href.includes("?noRefresh=true")) return;
    info(`Enabling auto refresh if inactive for ${REFRESH_INTERVAL_SECS} seconds.`);
    const reload = () => {
        window.location.reload();
    };

    var time;

    const resetTimer = () => {
        clearTimeout(time);
        time = setTimeout(reload, REFRESH_INTERVAL_SECS * 1000);
    };
    var events = ["click", "keypress", "touchstart"];
    events.forEach(function (name) {
        document.addEventListener(name, resetTimer, true);
    });
    resetTimer();
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
})();
