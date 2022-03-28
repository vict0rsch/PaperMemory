const adjustCss = () => {
    const container = document.getElementById("memory-filters");
    const searchBar = document.getElementById("memory-search");
    searchBar.style.width = `${0.4 * container.clientWidth}px`;
};

(async () => {
    await initState();
    makeMemoryHTML();
    addListener("memory-search-clear-icon", "click", handleClearSearch);
    // set default sort to lastOpenDate
    val("memory-select", "lastOpenDate");
    // set default sort direction arrow down
    setMemorySortArrow("down");
    adjustCss();
})();
