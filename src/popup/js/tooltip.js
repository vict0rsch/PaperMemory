// Tooltips of the popup (action strip and icon-only controls) and fullMemory: one floating
// element (.pm-tip look: name + key) for the whole page. A control opts in with data-tip="Name"
// (and data-tip-key="p"); its accessible name stays its aria-label.
// - Shown on hover / keyboard focus after a short delay; once one is visible (or was a moment
//   ago), the next control's shows at once, as native tooltips do. Hidden at once on leave,
//   blur, click, a key, a scroll.
// - One line at its natural width, below the control (above when there is no room), shifted
//   sideways to stay inside the popup (450×600) or the window; never shrunk. Only a tip wider
//   than the max width (long URLs) wraps.
let tip = null;
let shownFor = null; // the control whose tip is visible
let pending = null; // {el, timer}: a tip waiting for its delay
let lastShown = 0; // when a visible tip was last hidden by moving on (handoff window)
let clicked = null; // a control just clicked: no tip until the pointer leaves it

export const SHOW_DELAY = 400; // ms
const HANDOFF = 300; // ms after a tip hides during which the next one shows at once
const MARGIN = 6;
const MAX_WIDTH = 320;

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

const cancelPending = () => {
    clearTimeout(pending?.timer);
    pending = null;
};

/** Hides the tip now; handoff: the next tip within HANDOFF ms shows without the delay */
export const hideTooltip = ({ handoff = false } = {}) => {
    cancelPending();
    if (shownFor && handoff) lastShown = Date.now();
    if (!handoff) lastShown = 0;
    shownFor = null;
    if (tip) tip.hidden = true;
};

/** Shows the tooltip of a control now (its data-tip / data-tip-key) */
export const showTooltip = (el) => {
    cancelPending();
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
        tip.append(" ", kbd); // the space: textContent reads "Delete ⌫"
    }
    // measured at the frame's origin, on one line: a previous position never narrows it
    const f = frame();
    tip.classList.remove("is-long");
    tip.style.maxWidth = "";
    tip.style.left = "0px";
    tip.style.top = "0px";
    tip.hidden = false;
    const maxWidth = Math.min(MAX_WIDTH, f.right - f.left - 2 * MARGIN);
    if (tip.getBoundingClientRect().width > maxWidth) {
        tip.classList.add("is-long");
        tip.style.maxWidth = `${maxWidth}px`;
    }
    shownFor = el;
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    // centred under the control, shifted (not shrunk) to stay inside the frame
    const left = Math.max(
        f.left + MARGIN,
        Math.min(r.left + r.width / 2 - t.width / 2, f.right - MARGIN - t.width),
    );
    let top = r.bottom + MARGIN;
    if (top + t.height > f.bottom - MARGIN) top = r.top - MARGIN - t.height;
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(Math.max(top, f.top + MARGIN))}px`;
};

/** Shows a control's tip after the delay, or at once when another tip is (just) visible */
const scheduleTooltip = (el) => {
    if (el === shownFor || el === pending?.el) return;
    const warm = !!shownFor || Date.now() - lastShown < HANDOFF;
    if (warm) return showTooltip(el);
    cancelPending();
    pending = { el, timer: setTimeout(() => showTooltip(el), SHOW_DELAY) };
};

let ready = false;
/** Delegated listeners, set once per page */
export const setupTooltips = () => {
    if (ready) return;
    ready = true;
    const target = (e) => e.target?.closest?.("[data-tip]");
    document.addEventListener("mouseover", (e) => {
        const el = target(e);
        if (el && el === clicked) return;
        clicked = null;
        if (el) scheduleTooltip(el);
        else if (shownFor || pending) hideTooltip({ handoff: true });
    });
    document.addEventListener("focusin", (e) => {
        const el = target(e);
        if (el && el === e.target && el.matches(":focus-visible")) scheduleTooltip(el);
        else if (!el || el !== shownFor) hideTooltip({ handoff: true });
    });
    document.addEventListener("focusout", () => hideTooltip({ handoff: true }));
    document.addEventListener(
        "mousedown",
        (e) => {
            clicked = target(e);
            hideTooltip();
        },
        true,
    );
    // a key hides the tip; Tab hands off to the next control's
    document.addEventListener("keydown", () => hideTooltip({ handoff: true }), true);
    document.addEventListener("scroll", () => hideTooltip(), true);
    window.addEventListener("blur", () => hideTooltip());
};
