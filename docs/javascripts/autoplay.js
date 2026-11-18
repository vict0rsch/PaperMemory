// Instant navigation swaps the page in without a reload; start the muted loops again.
document$.subscribe(() => {
    document.querySelectorAll("video[autoplay]").forEach((v) => v.play().catch(() => {}));
});
