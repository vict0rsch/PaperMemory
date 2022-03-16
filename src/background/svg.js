/**
 * Centralizes HTML svg codes
 * @param {string} name svg type
 * @returns {string} the HTML code for a specific svg
 */
const svg = (name) => {
    switch (name) {
        case "download":
            return /*html*/ `<svg width="52px" height="42px" viewBox="0 0 22 16">
                <path
                    d="M2,10 L6,13 L12.8760559,4.5959317 C14.1180021,3.0779974 16.2457925,2.62289624 18,3.5 L18,3.5 C19.8385982,4.4192991 21,6.29848669 21,8.35410197 L21,10 C21,12.7614237 18.7614237,15 16,15 L1,15"
                    id="check"
                ></path>
                <polyline points="4.5 8.5 8 11 11.5 8.5" class="svg-out"></polyline>
                <path d="M8,1 L8,11" class="svg-out"></path>
            </svg>`;
        case "clipboard-default":
            return /*html*/ `<svg
                class="copy-feedback tabler-icon"
                xmlns="http://www.w3.org/2000/svg"
                width="64"
                height="32"
                viewBox="0 0 24 24"
                stroke-width="1.25"
                stroke="rgb(0, 119, 255)"
                fill="none"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <path
                    d="M9 5H7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2V7a2 2 0 0 0 -2 -2h-2"
                />
                <rect x="9" y="3" width="6" height="4" rx="2" />
                <line x1="9" y1="12" x2="9.01" y2="12" />
                <line x1="13" y1="12" x2="15" y2="12" />
                <line x1="9" y1="16" x2="9.01" y2="16" />
                <line x1="13" y1="16" x2="15" y2="16" />
            </svg>`;

        case "clipboard-default-ok":
            return /*html*/ `<svg
                xmlns="http://www.w3.org/2000/svg"
                class="tabler-icon copy-feedback-ok"
                style="display:none"
                width="64" height="64" viewBox="0 0 24 24"
                stroke-width="1.25" stroke="rgb(0, 200, 84)" fill="none"
                stroke-linecap="round" stroke-linejoin="round"
            >
                <path stroke="none" d="M0 0h24v24H0z"/>
                <path d="M9 5H7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2V7a2 2 0 0 0 -2 -2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="2" />
                <path d="M9 14l2 2l4 -4" />
            </svg>`;

        case "notif-cancel":
            return /*html*/ `<svg
                width="25"
                height="25"
                viewBox="0 0 24 24"
                stroke-width="1"
                fill="none"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke="white"
            >
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
                <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
                <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
            </svg>`;

        default:
            break;
    }
};
