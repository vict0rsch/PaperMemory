const makeBarChart = (data, labels, label, rgbColors, id, noXlabel = false) => {
    const config = {
        type: "bar",
        data: {
            datasets: [
                {
                    label,
                    data,
                    backgroundColor: `rgba(${rgbColors}, 0.6)`,
                    borderColor: `rgba(${rgbColors}, 1)`,
                    borderWidth: 1,
                },
            ],
            labels,
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true,
                },
                x: {
                    display: !noXlabel,
                },
            },
        },
    };
    const ctx = document.getElementById(id).getContext("2d");
    const chart = new Chart(ctx, config);
};

const makeSourcesChart = async () => {
    let sources = {};

    for (const paper of global.state.sortedPapers) {
        if (!sources.hasOwnProperty(paper.source)) {
            sources[paper.source] = 0;
        }
        sources[paper.source] += 1;
    }

    const entries = Object.entries(sources).sort((a, b) => b[1] - a[1]);
    console.log("entries: ", entries);

    makeBarChart(
        entries.map(([source, count]) => count),
        entries.map(([source, count]) => source),
        "Number of papers for each source",
        "163, 23, 23",
        "sources-count"
    );
};
const makeVisitsChart = async () => {
    let counts = global.state.sortedPapers.map((paper) => paper.count);
    let titles = global.state.sortedPapers.map((paper) => paper.title);

    let entries = counts
        .map((count, i) => [titles[i], count])
        .sort((a, b) => b[1] - a[1]);

    makeBarChart(
        entries.map(([source, count]) => count),
        entries.map(([source, count]) => source),
        "Number of visits per paper",
        "75, 192, 192",
        "visits-count",
        true
    );
};

(async () => {
    await initState();
    makeSourcesChart();
    makeVisitsChart();
})();
