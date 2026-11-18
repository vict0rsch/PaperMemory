// The ⓘ panel of a Memory row and of the paper view:
// opens on click (and `d` on a row), floats over the content without changing the row's height,
// opens upward when there is no room below, closes on a click outside, a second click, `d`
// again, Escape, or the focus moving elsewhere. One panel at a time.
import { state } from "@pmu/config.js";
import { getInfoPanelHTML } from "@pm/popup/js/templates.js";

let current = null; // {host, button, panel}

/** Whether a panel is open (and still in the page: rows are re-rendered freely) */
export const infoPanelIsOpen = () => !!current?.panel.isConnected;

/** Closes the open panel, if any */
export const closeInfoPanel = () => {
    if (!current) return;
    const { host, button, panel } = current;
    current = null;
    panel.remove();
    button?.setAttribute("aria-expanded", "false");
    host.removeAttribute("aria-describedby");
};

/** The visible area the panel must stay in: its scroller, the popup (450×600) and the window */
const visibleBounds = (host) => {
    const boxes = [host.closest("#memory-scroll, .pm-pv-main"), document.getElementById("pm-shell")]
        .filter(Boolean)
        .map((el) => el.getBoundingClientRect());
    return {
        top: Math.max(0, ...boxes.map((r) => r.top)),
        bottom: Math.min(window.innerHeight, ...boxes.map((r) => r.bottom)),
    };
};

const MARGIN = 8; // px kept between the panel and the edge of the visible area
const MIN_HEIGHT = 80;

/**
 * Below its button by default; upward when it would leave the visible area and there is more
 * room above. Taller than the room on the chosen side: capped to it, the fields scroll inside.
 * @param {HTMLElement} host
 * @param {HTMLElement} panel
 */
const placePanel = (host, panel) => {
    const bounds = visibleBounds(host);
    const down = panel.getBoundingClientRect();
    const roomDown = bounds.bottom - MARGIN - down.top;
    if (down.height <= roomDown) return;
    panel.classList.add("is-up");
    const up = panel.getBoundingClientRect();
    const roomUp = up.bottom - (bounds.top + MARGIN);
    if (up.height <= roomUp) return;
    if (roomDown > roomUp) panel.classList.remove("is-up");
    panel.style.maxHeight = `${Math.max(MIN_HEIGHT, Math.max(roomDown, roomUp))}px`;
    panel.tabIndex = 0; // a scrolling region is reachable from the keyboard
};

/**
 * Opens the panel of a paper in host (a row, or the paper view's status line)
 * @param {HTMLElement} host Positioned container of the panel
 * @param {HTMLElement} button Its ⓘ button
 * @param {string} id The paper's id
 */
export const openInfoPanel = (host, button, id) => {
    const paper = state.papers[id];
    if (!paper || !host || !button) return;
    closeInfoPanel();
    const panelId = button.getAttribute("aria-controls") || `${host.id}--info`;
    button.setAttribute("aria-controls", panelId);
    const tpl = document.createElement("template");
    tpl.innerHTML = getInfoPanelHTML(paper, panelId);
    const panel = tpl.content.firstElementChild;
    host.append(panel);
    placePanel(host, panel);
    button.setAttribute("aria-expanded", "true");
    host.setAttribute("aria-describedby", panelId);
    current = { host, button, panel };
};

/** Opens or closes the panel of host */
export const toggleInfoPanel = (host, button, id) =>
    infoPanelIsOpen() && current.host === host
        ? closeInfoPanel()
        : openInfoPanel(host, button, id);

let ready = false;
/** Clicks outside the panel and focus moving elsewhere close it. Set once per page. */
export const setupInfoPanel = () => {
    if (ready) return;
    ready = true;
    document.addEventListener("mousedown", (e) => {
        if (!current) return;
        const t = e.target;
        if (current.panel.contains(t) || current.button.contains(t)) return;
        closeInfoPanel();
    });
    document.addEventListener("focusin", (e) => {
        if (!current) return;
        if (!current.panel.isConnected) return closeInfoPanel();
        if (!current.host.contains(e.target)) closeInfoPanel();
    });
};
