/**
 * Find an element by element id (may be the element itself,
 * in which case it its returned directly), or by finding the element
 * with the class `memoryItemClass` inside the Memory container with
 * id `memory-container--{paperId}`
 * @param {object} options
 * @param {string} options.element The id of the element to find or the element itself
 * @param {string} options.paperId The id of the paper in the memory to find the element within
 * @param {string} options.memoryItemClass The class of the element to find within the
 *   container with id memory-container--{paperId}. The leading dot is optional.
 * @returns {HTMLElement}
 */
const findEl = ({ element, paperId, memoryItemClass }) => {
    if (element)
        return typeof element === "string" ? document.getElementById(element) : element;
    if (!memoryItemClass.startsWith(".")) memoryItemClass = "." + memoryItemClass;
    return findEl({ element: `memory-container--${paperId}` })?.querySelector(
        memoryItemClass
    );
};

/**
 * Fade out an element
 * @param {HTMLElement} el
 * @param {number} duration
 * @param {function} callback
 * @returns {void}
 */
const fadeOut = (el, duration = 250, callback = () => {}) => {
    el = findEl({ element: el });
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
    el = findEl({ element: el });
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
        el = findEl({ element: el });
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
        el = findEl({ element: el });
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
        el = findEl({ element: el });
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
        el = findEl({ element: el });
    }
    if (el) el.innerText = text;
};

/** Set innerHTML of an element (or find it with findEl if el is a string)
 * @param {string | HTMLElement} el
 * @param {string} html
 * @returns {void}
 * */
const setHTML = (el, html) => {
    el = findEl({ element: el });
    if (el) el.innerHTML = html;
};

/** Dispatch an event on an element (or find it with findEl if el is a string)
 * @param {string | HTMLElement} el
 * @param {string | Event} event
 * @returns {void}
 * */
const dispatch = (el, event) => {
    el = findEl({ element: el });
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
const hasClass = (el, className) => {
    el = findEl({ element: el });
    return el ? el.classList.contains(className) : false;
};

/** Add a class to an element (or find it with findEl if el is a string)
 * @param {string | HTMLElement} elOrId
 * @param {string} className
 * @returns {void}
 * */
const addClass = (el, className) => {
    el = findEl({ element: el });
    el && el.classList.add(className);
};

/** Remove a class from an element (or find it with findEl if el is a string)
 * @param {string | HTMLElement} elOrId
 * @param {string} className
 * @returns {void}
 * */
const removeClass = (el, className) => {
    el = findEl({ element: el });
    el && el.classList.remove(className);
};

/** Add an event listener to an element (or find it with findEl if el is a string)
 * @param {string | HTMLElement} el
 * @param {string} event
 * @param {function} listener
 * @returns {void}
 * */
const addListener = (el, event, listener) => {
    el = findEl({ element: el });
    el && el.addEventListener(event, listener);
};

/** Set placeholder of an element (or find it with findEl if el is a string)
 * @param {string | HTMLElement} el
 * @param {string} text
 * @returns {void}
 * */
const setPlaceholder = (el, text) => {
    el = findEl({ element: el });
    if (el && typeof el.placeholder !== "undefined") el.placeholder = text;
};

/** Get or set style of an element (or find it with findEl if el is a string)
 * @param {string | HTMLElement} el
 * @param {string} key
 * @param {string} value
 * @returns {string}
 * */
const style = (el, key, value) => {
    el = findEl({ element: el });
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
    el = findEl({ element: el });
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
    el = findEl({ element: el });
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
    el = findEl({ element: el });
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

/**
 * Get first element matching selector within dom or document if dom is not provided
 * @param {string} selector
 * @param {HTMLElement} dom
 * @returns {HTMLElement}
 */
const querySelector = (selector, dom) =>
    dom ? dom.querySelector(selector) : document.querySelector(selector);

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
    queryAll(className).forEach((el) => {
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
        querySelector,
        createElementFromHTML,
        addEventToClass,
    };
}
