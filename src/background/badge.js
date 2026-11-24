// The toolbar badge (background.js): Gist sync's states, shown until it clears them, over
// the number of pairing requests waiting for the user (agentAccess.js), shown while
// there are any.

const RED = "rgb(195, 40, 56)";

/**
 * The badge's states, on the browser's action API.
 * @param {object} actionApi chrome.action (Firefox MV2: browserAction)
 * @returns {object} badgeOk, badgeWait(text), badgeError and badgeClear(preventTimeout)
 * for sync; setPairingBadge(count) for Agent access
 */
export const createBadge = (actionApi) => {
    let syncShown = false; // a sync state is on the badge
    let pairingRequests = 0;

    const show = (text, color) => {
        actionApi.setBadgeText({ text });
        actionApi.setBadgeBackgroundColor({ color });
    };
    // no sync state: the pairing requests' count, if any
    const showPairing = () => {
        if (pairingRequests) show(String(pairingRequests), RED);
        else actionApi.setBadgeText({ text: "" });
    };
    const showSync = (text, color) => {
        syncShown = true;
        show(text, color);
    };
    const clearSync = () => {
        syncShown = false;
        showPairing();
    };

    return {
        badgeOk: () => showSync("OK!", "rgb(68, 164, 68)"),
        badgeWait: (text) => showSync(text, "rgb(189, 127, 10)"),
        badgeError: () => showSync("Error", RED),
        badgeClear: (preventTimeout = false) => {
            if (preventTimeout) clearSync();
            else setTimeout(clearSync, 2000);
        },
        setPairingBadge: (count) => {
            pairingRequests = count;
            if (!syncShown) showPairing();
        },
    };
};
