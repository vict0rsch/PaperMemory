/**
 * Find an element by element id, or with class memoryItemClass for paper with a given id
 * @param {string} id The  id for the element to find or the paper in the memory
 * @param {string} memoryItemClass The class of the element to find within the container with id memory-container--{id}. The leading dot is optional.
 * @returns {HTMLElement}
 */
const findEl = (elOrId, memoryItemClass) => {
    if (typeof memoryItemClass === "undefined")
        return typeof elOrId === "string" ? document.getElementById(elOrId) : elOrId;
    if (!memoryItemClass.startsWith(".")) memoryItemClass = "." + memoryItemClass;
    return findEl(`memory-container--${elOrId}`).querySelector(memoryItemClass);
};

/**
 * Fade out an element
 * @param {HTMLElement} el
 * @param {number} duration
 * @param {function} callback
 * @returns {void}
 */
const fadeOut = (el, duration = 250, callback = () => {}) => {
    el = findEl(el);
    el.style.transition = `${duration}ms`;
    el.style.opacity = 0;
    setTimeout(() => {
        el.style.display = "none";
        callback();
    }, duration);
};

/**
 * Fade in an element
 * @param {HTMLElement} el
 * @param {string} display
 * @param {number} duration
 * @param {function} callback
 * @returns {void}
 */
const fadeIn = (el, display = "block", duration = 250, callback = () => {}) => {
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
};

/**
 * Get or set value of an element
 * @param {string | HTMLElement} el
 * @param {string} value
 * @returns {string}
 */
const val = (el, value) => {
    if (typeof el === "string") {
        el = findEl(el);
    }
    if (el instanceof HTMLInputElement && el.type === "checkbox") {
        if (typeof value === "undefined") {
            return el.checked;
        }
        el.checked = value;
    }
    if (typeof value === "undefined") {
        return el ? el.value : "";
    }
    if (el) el.value = value;
};

/** Show an element (or find it with findEl if el is a string)
 *  by setting its display property to the given value (default: "block")
 * @param {string | HTMLElement} el
 * @param {string} display
 * @returns {void}
 * */
const showId = (el, display = "block") => {
    if (typeof el === "string") {
        el = findEl(el);
    }
    if (el) el.style.display = display;
};

/** Hide an element (or find it with findEl if el is a string)
 * by setting its display property to "none"
 * @param {string | HTMLElement} el
 * @returns {void}
 * */
const hideId = (el) => {
    if (typeof el === "string") {
        el = findEl(el);
    }
    if (el) el.style.display = "none";
};

/** Set innerText of an element (or find it with findEl if el is a string)
 * @param {string | HTMLElement} el
 * @param {string} text
 * @returns {void}
 * */
const setTextId = (el, text) => {
    if (typeof el === "string") {
        el = findEl(el);
    }
    if (el) el.innerText = text;
};

/** Set innerHTML of an element (or find it with findEl if el is a string)
 * @param {string | HTMLElement} el
 * @param {string} html
 * @returns {void}
 * */
const setHTML = (el, html) => {
    if (typeof el === "string") {
        el = findEl(el);
    }
    if (el) el.innerHTML = html;
};

/** Dispatch an event on an element (or find it with findEl if el is a string)
 * @param {string | HTMLElement} el
 * @param {string | Event} event
 * @returns {void}
 * */
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

/** Check if an element (or find it with findEl if el is a string)
 * has a given class
 * @param {string | HTMLElement} elOrId
 * @param {string} className
 * @returns {boolean}
 * */
const hasClass = (elOrId, className) => {
    let el;
    if (typeof elOrId === "string") {
        el = findEl(elOrId);
    } else {
        el = elOrId;
    }
    if (el) return el.classList.contains(className);
};

/** Add a class to an element (or find it with findEl if el is a string)
 * @param {string | HTMLElement} elOrId
 * @param {string} className
 * @returns {void}
 * */
const addClass = (elOrId, className) => {
    let el;
    if (typeof elOrId === "string") {
        el = findEl(elOrId);
    } else {
        el = elOrId;
    }

    el && el.classList.add(className);
};

/** Remove a class from an element (or find it with findEl if el is a string)
 * @param {string | HTMLElement} elOrId
 * @param {string} className
 * @returns {void}
 * */
const removeClass = (elOrId, className) => {
    let el;
    if (typeof elOrId === "string") {
        el = findEl(elOrId);
    } else {
        el = elOrId;
    }

    if (el) el.classList.remove(className);
};

/** Add an event listener to an element (or find it with findEl if el is a string)
 * @param {string | HTMLElement} el
 * @param {string} event
 * @param {function} listener
 * @returns {void}
 * */
const addListener = (el, event, listener) => {
    if (typeof el === "string") {
        el = findEl(el);
    }
    el && el.addEventListener(event, listener);
};

/** Set placeholder of an element (or find it with findEl if el is a string)
 * @param {string | HTMLElement} el
 * @param {string} text
 * @returns {void}
 * */
const setPlaceholder = (el, text) => {
    if (typeof el === "string") {
        el = findEl(el);
    }
    if (el && typeof el.placeholder !== "undefined") el.placeholder = text;
};

/** Get or set style of an element (or find it with findEl if el is a string)
 * @param {string | HTMLElement} el
 * @param {string} key
 * @param {string} value
 * @returns {string}
 * */
const style = (el, key, value) => {
    if (typeof el === "string") {
        el = findEl(el);
    }
    if (el) {
        if (typeof value === "undefined") {
            return el.style[key];
        }
        el.style[key] = value;
    }
};

/** Disable an element (or find it with findEl if el is a string)
 * @param {string | HTMLElement} el
 * @param {boolean} isDisabled
 * @returns {void}
 * */
const disable = (el, isDisabled = true) => {
    if (typeof el === "string") {
        el = findEl(el);
    }
    if (el) el.disabled = isDisabled;
};

/** Slide up an element (or find it with findEl if el is a string)
 *  https://w3bits.com/labs/javascript-slidetoggle/
 * @param {string | HTMLElement} el
 * @param {number} duration
 * @param {function} complete
 * @returns {void}
 * */
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

/** Slide down an element (or find it with findEl if el is a string)
 *  https://w3bits.com/labs/javascript-slidetoggle/
 * @param {string | HTMLElement} el
 * @param {number} duration
 * @param {function} complete
 * @returns {void}
 * */
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

/**
 * Get all elements matching selector within dom or document if dom is not provided
 * in form of an array
 * @param {string} selector
 * @param {HTMLElement} dom
 * @returns {HTMLElement[]}
 */
const queryAll = (selector, dom) =>
    dom
        ? [...dom.querySelectorAll(selector)]
        : [...document.querySelectorAll(selector)];

/** Create an element from an HTML string
 * @param {string} htmlString
 * @returns {HTMLElement}
 * */
const createElementFromHTML = (htmlString) => {
    var div = document.createElement("div");
    div.innerHTML = htmlString.trim();

    // Change this to div.childNodes to support multiple top-level nodes.
    return div.firstChild;
};

/** Add an event listener to all elements with a given class
 * @param {string} className
 * @param {string} eventName
 * @param {function} fn
 * @returns {void}
 * */
const addEventToClass = (className, eventName, fn) => {
    if (!className.startsWith(".")) className = "." + className;
    document.querySelectorAll(className).forEach((el) => {
        el.addEventListener(eventName, fn);
    });
};

// ----------------------------------------------------
// -----  TESTS: modules for node.js environment  -----
// ----------------------------------------------------
if (typeof module !== "undefined" && module.exports != null) {
    var dummyModule = module;
    dummyModule.exports = {
        findEl,
        fadeOut,
        fadeIn,
        val,
        showId,
        hideId,
        setTextId,
        setHTML,
        dispatch,
        hasClass,
        addClass,
        removeClass,
        addListener,
        setPlaceholder,
        style,
        disable,
        slideUp,
        slideDown,
        queryAll,
        addEventToClass,
        createElementFromHTML,
    };
}
