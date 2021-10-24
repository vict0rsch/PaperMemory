/**
 * Find an element by element id, or with class memoryItemClass for paper with a given id
 * @param {string} id The  id for the element to find or the paper in the memory
 * @param {string} memoryItemClass The class of the element to find within the container with id^
 * @returns {HTMLElement}
 */
const findEl = (id, memoryItemClass) => {
    if (typeof memoryItemClass === "undefined") return document.getElementById(id);
    return findEl(`memory-container--${id}`).querySelector(`.${memoryItemClass}`);
};

const val = (element, value) => {
    if (element instanceof HTMLInputElement && element.type === "checkbox") {
        if (typeof value === "undefined") {
            return element.checked;
        }
        element.checked = value;
    }
    if (typeof element === "string") {
        element = findEl(element);
    }
    if (typeof value === "undefined") {
        return element ? element.value : "";
    }
    if (element) element.value = value;
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

const setHTMLEl = (el, html) => {
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
        }
        event = new Event(event);
    }
    el.dispatchEvent(event);
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

    if (el) el.classList.add(className);
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
    if (!el) return;

    el.addEventListener(event, listener);
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
    if (!el) return;
    el.style[key] = value;
    console.log(el, key, value);
};

const disable = (el, isDisabled = true) => {
    if (typeof el === "string") {
        el = findEl(el);
    }
    if (!el) return;
    el.disabled = isDisabled;
};

// https://w3bits.com/labs/javascript-slidetoggle/
const slideUp = (target, duration = 250, complete = () => {}) => {
    if (typeof target === "string") {
        target = findEl(target);
    }
    target.style.transitionProperty = "height, margin, padding";
    target.style.transitionDuration = duration + "ms";
    // target.style.boxSizing = "border-box";
    target.style.height = target.offsetHeight + "px";
    target.offsetHeight;
    target.style.overflow = "hidden";
    target.style.height = 0;
    target.style.paddingTop = 0;
    target.style.paddingBottom = 0;
    target.style.marginTop = 0;
    target.style.marginBottom = 0;
    window.setTimeout(() => {
        target.style.display = "none";
        target.style.removeProperty("height");
        target.style.removeProperty("padding-top");
        target.style.removeProperty("padding-bottom");
        target.style.removeProperty("margin-top");
        target.style.removeProperty("margin-bottom");
        target.style.removeProperty("overflow");
        target.style.removeProperty("transition-duration");
        target.style.removeProperty("transition-property");
        target.style.removeProperty("box-sizing");
        complete();
        //alert("!");
    }, duration);
};

// https://w3bits.com/labs/javascript-slidetoggle/
const slideDown = (target, duration = 500, complete = () => {}) => {
    if (typeof target === "string") {
        target = findEl(target);
    }
    target.style.removeProperty("display");
    let display = window.getComputedStyle(target).display;

    if (display === "none") display = "block";

    target.style.display = display;
    let height = target.offsetHeight;
    target.style.overflow = "hidden";
    target.style.height = 0;
    target.style.paddingTop = 0;
    target.style.paddingBottom = 0;
    target.style.marginTop = 0;
    target.style.marginBottom = 0;
    target.offsetHeight;
    // target.style.boxSizing = "border-box";
    target.style.transitionProperty = "height, margin, padding";
    target.style.transitionDuration = duration + "ms";
    target.style.height = height + "px";
    target.style.removeProperty("padding-top");
    target.style.removeProperty("padding-bottom");
    target.style.removeProperty("margin-top");
    target.style.removeProperty("margin-bottom");
    window.setTimeout(() => {
        target.style.removeProperty("height");
        target.style.removeProperty("overflow");
        target.style.removeProperty("transition-duration");
        target.style.removeProperty("transition-property");
        complete();
    }, duration);
};

// https://w3bits.com/labs/javascript-slidetoggle/
const slideToggle = (target, duration = 500, complete = () => {}) => {
    if (window.getComputedStyle(target).display === "none") {
        return slideDown(target, duration, complete);
    } else {
        return slideUp(target, duration, complete);
    }
};
