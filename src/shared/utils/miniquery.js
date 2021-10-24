const val = (element, value) => {
    if (element instanceof HTMLInputElement && element.type === "checkbox") {
        if (typeof value === "undefined") {
            return element.checked;
        }
        element.checked = value;
    }
    if (typeof element === "string") {
        element = document.getElementById(element);
    }
    if (typeof value === "undefined") {
        return element ? element.value : "";
    }
    if (element) element.value = value;
};

const showId = (id, display) => {
    if (typeof display === "undefined") display = "block";
    let el = document.getElementById(id);
    if (el) el.style.display = display;
};

const hideId = (id) => {
    el = document.getElementById(id);
    if (el) el.style.display = "none";
};

const setTextId = (id, text) => {
    let el = document.getElementById(id);
    if (el) el.innerText = text;
};

const setHTMLEl = (el, html) => {
    if (typeof el === "string") {
        el = document.getElementById(el);
    }
    if (el) el.innerHTML = html;
};

const dispatch = (el, event) => {
    if (typeof el === "string") {
        el = document.getElementById(el);
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
        el = document.getElementById(elOrId);
    } else {
        el = elOrId;
    }

    if (el) return el.classList.contains(className);
};

const addClass = (elOrId, className) => {
    let el;
    if (typeof elOrId === "string") {
        el = document.getElementById(elOrId);
    } else {
        el = elOrId;
    }

    if (el) el.classList.add(className);
};

const removeClass = (elOrId, className) => {
    let el;
    if (typeof elOrId === "string") {
        el = document.getElementById(elOrId);
    } else {
        el = elOrId;
    }

    if (el) el.classList.remove(className);
};

const addListener = (el, event, listener) => {
    if (typeof el === "string") {
        el = document.getElementById(el);
    }
    if (!el) return;

    el.addEventListener(event, listener);
};

const setPlaceholder = (el, text) => {
    if (typeof el === "string") {
        el = document.getElementById(el);
    }
    if (el && typeof el.placeholder !== "undefined") el.placeholder = text;
};

const setStyle = (el, key, value) => {
    if (typeof el === "string") {
        el = document.getElementById(el);
    }
    if (!el) return;
    el.style[key] = value;
    console.log(el, key, value);
};

const disable = (el, isDisabled = true) => {
    if (typeof el === "string") {
        el = document.getElementById(el);
    }
    if (!el) return;
    el.disabled = isDisabled;
};
