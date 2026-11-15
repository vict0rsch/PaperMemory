// Confirmations and choices on the options page: one <dialog id="o-dialog"> (index.html).
// Text is set with textContent, so user data (tag names, file names) needs no escaping.

/**
 * Opens the dialog and resolves with the value of the button used, or null (Cancel, Esc).
 * @param {object} opts
 * @param {string} opts.title
 * @param {(string | Node)[]} opts.body Paragraphs (strings) or nodes
 * @param {{label: string, value: string, kind?: "primary" | "danger" | "ghost"}[]} opts.actions
 *   Buttons, left to right; a Cancel button is added first
 * @param {string} [opts.cancel] Label of the Cancel button
 * @returns {Promise<string | null>}
 */
export const askDialog = ({ title, body = [], actions, cancel = "Cancel" }) => {
    const dialog = document.getElementById("o-dialog");
    document.getElementById("o-dialog-title").textContent = title;
    const content = document.getElementById("o-dialog-body");
    content.textContent = "";
    for (const part of body) {
        if (typeof part === "string") {
            const p = document.createElement("p");
            p.textContent = part;
            content.append(p);
        } else content.append(part);
    }
    const foot = document.getElementById("o-dialog-foot");
    foot.textContent = "";
    const button = (label, value, kind) => {
        const b = document.createElement("button");
        b.className = `pm-btn${kind ? ` pm-btn-${kind}` : ""}`;
        b.value = value;
        b.textContent = label;
        return b;
    };
    const cancelBtn = button(cancel, "", "ghost");
    foot.append(cancelBtn);
    const spacer = document.createElement("span");
    spacer.className = "pm-spacer";
    foot.prepend(spacer);
    for (const a of actions) foot.append(button(a.label, a.value, a.kind));
    dialog.returnValue = "";
    dialog.showModal();
    // the safe choice has the focus: ↵ never confirms a destructive action by accident
    cancelBtn.focus();
    return new Promise((resolve) =>
        dialog.addEventListener("close", () => resolve(dialog.returnValue || null), {
            once: true,
        }),
    );
};

/**
 * Yes / no confirmation
 * @param {object} opts {title, body, confirm: label of the confirming button, danger}
 * @returns {Promise<boolean>}
 */
export const confirmDialog = async ({
    title,
    body,
    confirm = "Confirm",
    danger = false,
}) =>
    (await askDialog({
        title,
        body,
        actions: [
            { label: confirm, value: "ok", kind: danger ? "danger-solid" : "primary" },
        ],
    })) === "ok";
