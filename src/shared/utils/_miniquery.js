/**
 * Find an element by element id, or with class memoryItemClass for paper with a given id
 * @param {string} id The  id for the element to find or the paper in the memory
 * @param {string} memoryItemClass The class of the element to find within the container with id^
 * @returns {HTMLElement}
 */
const findEl = (id, memoryItemClass) => {
    if (typeof memoryItemClass === "undefined")
        return typeof id === "string" ? document.getElementById(id) : id;
    return findEl(`memory-container--${id}`).querySelector(`.${memoryItemClass}`);
};

function fadeOut(el, duration = 250, callback = () => {}) {
    el = findEl(el);
    el.style.transition = `${duration}ms`;
    el.style.opacity = 0;
    setTimeout(() => {
        el.style.display = "none";
        callback();
    }, duration);
}
function fadeIn(el, display = "block", duration = 250, callback = () => {}) {
    el = findEl(el);
    el.style.opacity = 0;
    if (el.style.display === "none") {
        el.style.display = display;
    }
    setTimeout(() => {
        // 0 timeout: https://stackoverflow.com/a/34764787/3867406
        el.style.transition = `${duration}ms`;
        el.style.opacity = 1;
        setTimeout(() => {
            callback();
        }, duration);
    }, 0);
}

const val = (el, value) => {
    if (el instanceof HTMLInputElement && el.type === "checkbox") {
        if (typeof value === "undefined") {
            return el.checked;
        }
        el.checked = value;
    }
    if (typeof el === "string") {
        el = findEl(el);
    }
    if (typeof value === "undefined") {
        return el ? el.value : "";
    }
    if (el) el.value = value;
};

const showId = (id, display) => {
    if (typeof display === "undefined") display = "block";
    let el = findEl(id);
    if (el) el.style.display = display;
};

const hideId = (id) => {
    el = findEl(id);
    if (el) el.style.display = "none";
};

const setTextId = (id, text) => {
    let el = findEl(id);
    if (el) el.innerText = text;
};

const setHTML = (el, html) => {
    if (typeof el === "string") {
        el = findEl(el);
    }
    if (el) el.innerHTML = html;
};

const dispatch = (el, event) => {
    if (typeof el === "string") {
        el = findEl(el);
    }
    if (typeof event === "string") {
        if (event === "focus") {
            el.focus();
            return;
        } else if (event === "blur") {
            el.blur();
            return;
        }
        event = new Event(event);
    }
    el && el.dispatchEvent(event);
};

const hasClass = (elOrId, className) => {
    let el;
    if (typeof elOrId === "string") {
        el = findEl(elOrId);
    } else {
        el = elOrId;
    }

    if (el) return el.classList.contains(className);
};

const addClass = (elOrId, className) => {
    let el;
    if (typeof elOrId === "string") {
        el = findEl(elOrId);
    } else {
        el = elOrId;
    }

    el && el.classList.add(className);
};

const removeClass = (elOrId, className) => {
    let el;
    if (typeof elOrId === "string") {
        el = findEl(elOrId);
    } else {
        el = elOrId;
    }

    if (el) el.classList.remove(className);
};

const addListener = (el, event, listener) => {
    if (typeof el === "string") {
        el = findEl(el);
    }
    el && el.addEventListener(event, listener);
};

const setPlaceholder = (el, text) => {
    if (typeof el === "string") {
        el = findEl(el);
    }
    if (el && typeof el.placeholder !== "undefined") el.placeholder = text;
};

const setStyle = (el, key, value) => {
    if (typeof el === "string") {
        el = findEl(el);
    }
    if (el) el.style[key] = value;
};

const disable = (el, isDisabled = true) => {
    if (typeof el === "string") {
        el = findEl(el);
    }
    if (el) el.disabled = isDisabled;
};

// https://w3bits.com/labs/javascript-slidetoggle/
const slideUp = (el, duration = 250, complete = () => {}) => {
    if (typeof el === "string") {
        el = findEl(el);
    }
    if (!el) return;
    el.style.transitionProperty = "height, margin, padding";
    el.style.transitionDuration = duration + "ms";
    // el.style.boxSizing = "border-box";
    el.style.height = el.offsetHeight + "px";
    el.offsetHeight;
    el.style.overflow = "hidden";
    el.style.height = 0;
    el.style.paddingTop = 0;
    el.style.paddingBottom = 0;
    el.style.marginTop = 0;
    el.style.marginBottom = 0;
    window.setTimeout(() => {
        el.style.display = "none";
        el.style.removeProperty("height");
        el.style.removeProperty("padding-top");
        el.style.removeProperty("padding-bottom");
        el.style.removeProperty("margin-top");
        el.style.removeProperty("margin-bottom");
        el.style.removeProperty("overflow");
        el.style.removeProperty("transition-duration");
        el.style.removeProperty("transition-property");
        el.style.removeProperty("box-sizing");
        complete();
        //alert("!");
    }, duration);
};

// https://w3bits.com/labs/javascript-slidetoggle/
const slideDown = (el, duration = 500, complete = () => {}) => {
    if (typeof el === "string") {
        el = findEl(el);
    }
    if (!el) return;
    el.style.removeProperty("display");
    let display = window.getComputedStyle(el).display;

    if (display === "none") display = "block";

    el.style.display = display;
    let height = el.offsetHeight;
    el.style.overflow = "hidden";
    el.style.height = 0;
    el.style.paddingTop = 0;
    el.style.paddingBottom = 0;
    el.style.marginTop = 0;
    el.style.marginBottom = 0;
    el.offsetHeight;
    // el.style.boxSizing = "border-box";
    el.style.transitionProperty = "height, margin, padding";
    el.style.transitionDuration = duration + "ms";
    el.style.height = height + "px";
    el.style.removeProperty("padding-top");
    el.style.removeProperty("padding-bottom");
    el.style.removeProperty("margin-top");
    el.style.removeProperty("margin-bottom");
    window.setTimeout(() => {
        el.style.removeProperty("height");
        el.style.removeProperty("overflow");
        el.style.removeProperty("transition-duration");
        el.style.removeProperty("transition-property");
        complete();
    }, duration);
};

// https://w3bits.com/labs/javascript-slidetoggle/
const slideToggle = (el, duration = 500, complete = () => {}) => {
    if (window.getComputedStyle(el).display === "none") {
        return slideDown(el, duration, complete);
    } else {
        return slideUp(el, duration, complete);
    }
};
