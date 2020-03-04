$(() => {

    var h = null;
    $("h2").each((idx, el) => {
        if ($(el).html() === "Download:") {
            h = $(el)
        }
    });
    const id = document.title.slice(1, 11);
    const pdfUrl = "https://arxiv.org/pdf/" + id + ".pdf";
    const fileName = id + " - " + document.title.split(" ").slice(1).join(" ") + ".pdf"
    const button = `
    <div id="arxiv-container">
        <button id="arxiv-button" class="arxiv-learn-more">
            <span class="arxiv-circle" aria-hidden="true">
                <span class="arxiv-icon arxiv-arrow"></span>
            </span>
            <span class="arxiv-button-text">Download</span>
        </button>
    </div>
    `
    const ul = h.parent().append(button)
    $("#arxiv-button").click(() => {
        console.log("click")
        var link = document.createElement('a');
        link.href = pdfUrl;
        link.download = fileName;
        link.dispatchEvent(new MouseEvent('click'));
    })

})