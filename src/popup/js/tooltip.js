// Tooltips of icon-only controls: the action strip's look (.pm-tip: name + key), one floating
// element for the whole page. A control opts in with data-tip="Name" (and data-tip-key="p");
// its accessible name stays its aria-label. Shown on hover and on keyboard focus, below the
// control (above when there is no room), always inside the popup (450×600) or the window.
let tip = null;
let shownFor = null;

const MARGIN = 6;

/** The visible frame: the popup shell when there is one, else the window */
const frame = () => {
    const shell = document.getElementById("pm-shell")?.getBoundingClientRect();
    return {
        left: Math.max(0, shell?.left ?? 0),
        right: Math.min(window.innerWidth, shell?.right ?? Infinity),
        top: Math.max(0, shell?.top ?? 0),
        bottom: Math.min(window.innerHeight, shell?.bottom ?? Infinity),
    };
};

export const hideTooltip = () => {
    shownFor = null;
    if (tip) tip.hidden = true;
};

/** Shows the tooltip of a control (its data-tip / data-tip-key) */
export const showTooltip = (el) => {
    const text = el?.dataset?.tip;
    if (!text || !el.isConnected) return hideTooltip();
    if (!tip) {
        tip = document.createElement("span");
        tip.className = "pm-tip pm-tip-float";
        tip.setAttribute("aria-hidden", "true"); // the control's aria-label already names it
        document.body.append(tip);
    }
    tip.textContent = text;
    if (el.dataset.tipKey) {
        const kbd = document.createElement("span");
        kbd.className = "pm-kbd";
        kbd.textContent = el.dataset.tipKey;
        tip.append(" ", kbd);
    }
    tip.hidden = false;
    shownFor = el;
    const f = frame();
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    // centred under the control, pushed back inside the frame at its edges
    const left = Math.min(
        Math.max(r.left + r.width / 2 - t.width / 2, f.left + MARGIN),
        f.right - MARGIN - t.width,
    );
    let top = r.bottom + MARGIN;
    if (top + t.height > f.bottom - MARGIN) top = r.top - MARGIN - t.height;
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(Math.max(top, f.top + MARGIN))}px`;
};

let ready = false;
/** Delegated listeners, set once per page */
export const setupTooltips = () => {
    if (ready) return;
    ready = true;
    const target = (e) => e.target?.closest?.("[data-tip]");
    document.addEventListener("mouseover", (e) => {
        const el = target(e);
        if (el && el !== shownFor) showTooltip(el);
        else if (!el && shownFor) hideTooltip();
    });
    document.addEventListener("focusin", (e) => {
        const el = target(e);
        if (el && el === e.target && el.matches(":focus-visible")) showTooltip(el);
        else hideTooltip();
    });
    document.addEventListener("focusout", hideTooltip);
    document.addEventListener("mousedown", hideTooltip, true);
    document.addEventListener("keydown", hideTooltip, true);
    document.addEventListener("scroll", hideTooltip, true);
    window.addEventListener("blur", hideTooltip);
};
