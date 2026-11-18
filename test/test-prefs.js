// Unit tests for the prefs helpers in src/shared/js/utils/data.js: serialized patch writes
// (no lost updates), cached state.prefs, theme migration from checkDarkMode.
// Runs in Node with an in-memory, deliberately slow and asynchronous chrome.storage stub.
import { expect } from "expect";
import { loadPaperMemoryUtils } from "./utilsForTests.js";

await loadPaperMemoryUtils();

const makeChromeStub = () => {
    const store = {};
    const listeners = [];
    const later = (fn) => setTimeout(fn, Math.random() * 5);
    return {
        store,
        storage: {
            local: {
                get: (key, cb) =>
                    later(() => {
                        const keys = typeof key === "string" ? [key] : key;
                        const out = {};
                        for (const k of keys) {
                            if (k in store) out[k] = structuredClone(store[k]);
                        }
                        cb(out);
                    }),
                set: (obj, cb) =>
                    later(() => {
                        for (const [k, v] of Object.entries(obj)) {
                            const oldValue = store[k];
                            store[k] = structuredClone(v);
                            for (const l of listeners) {
                                l(
                                    { [k]: { oldValue, newValue: structuredClone(v) } },
                                    "local",
                                );
                            }
                        }
                        cb && cb();
                    }),
            },
            onChanged: { addListener: (l) => listeners.push(l) },
        },
        runtime: { getURL: (p) => `chrome-extension://test/${p}` },
    };
};

describe("Preferences (data.js)", function () {
    let data, state, stub, previousChrome;

    beforeEach(function () {
        data = PMUtils.data;
        state = PMUtils.config.state;
        previousChrome = global.chrome;
        stub = makeChromeStub();
        global.chrome = stub;
        state.prefs = undefined;
    });

    afterEach(function () {
        global.chrome = previousChrome;
        state.prefs = undefined;
    });

    describe("#updatePrefs", function () {
        it("does not lose concurrent changes (theme + checkbox)", async function () {
            stub.store.prefs = { theme: "light", checkDarkMode: false, checkBib: true };
            state.prefs = { ...stub.store.prefs };
            await Promise.all([
                data.updatePrefs({ theme: "dark", checkDarkMode: true }),
                data.updatePrefs({ checkBib: false }),
                data.updatePrefs({ checkMd: false }),
            ]);
            expect(stub.store.prefs).toEqual({
                theme: "dark",
                checkDarkMode: true,
                checkBib: false,
                checkMd: false,
            });
            expect(state.prefs).toEqual(stub.store.prefs);
        });

        it("only patches the given keys of the currently stored prefs", async function () {
            // a stale cache must not overwrite a theme written by another page
            state.prefs = { theme: "light", checkBib: true };
            stub.store.prefs = { theme: "dark", checkBib: true };
            await data.updatePrefs({ checkBib: false });
            expect(stub.store.prefs).toEqual({ theme: "dark", checkBib: false });
        });

        it("computes function patches against stored prefs; {} writes nothing", async function () {
            stub.store.prefs = { checkBib: true };
            const before = stub.store.prefs;
            await data.updatePrefs(() => ({}));
            expect(stub.store.prefs).toBe(before); // untouched object: no write happened
            await data.updatePrefs((stored) => ({ checkMd: !stored.checkBib }));
            expect(stub.store.prefs).toEqual({ checkBib: true, checkMd: false });
        });

        it("deletes keys patched with undefined", async function () {
            stub.store.prefs = { checkOfficialRepos: true, checkBib: true };
            await data.updatePrefs({ checkOfficialRepos: undefined });
            expect(stub.store.prefs).toEqual({ checkBib: true });
        });
    });

    describe("#onPrefsChange", function () {
        it("keeps state.prefs in sync with writes made elsewhere", async function () {
            state.prefs = { theme: "light", checkBib: true };
            let seen;
            data.onPrefsChange((prefs) => (seen = prefs));
            await new Promise((resolve) =>
                chrome.storage.local.set(
                    { prefs: { theme: "dark", checkBib: true } },
                    resolve,
                ),
            );
            expect(state.prefs.theme).toBe("dark");
            expect(seen.theme).toBe("dark");
        });
    });

    describe("#isDarkTheme / #themeFromPrefs", function () {
        it("maps legacy checkDarkMode and defaults new users to system", function () {
            expect(data.themeFromPrefs({ checkDarkMode: true })).toBe("dark");
            expect(data.themeFromPrefs({ checkDarkMode: false })).toBe("light");
            expect(data.themeFromPrefs({})).toBe("system");
            expect(data.themeFromPrefs({ theme: "system", checkDarkMode: true })).toBe(
                "system",
            );
        });

        it("keeps the stored value for system where matchMedia is unavailable", function () {
            expect(global.matchMedia).toBeUndefined();
            expect(data.isDarkTheme("system", true)).toBe(true);
            expect(data.isDarkTheme("system", false)).toBe(false);
            expect(data.isDarkTheme("dark", false)).toBe(true);
            expect(data.isDarkTheme("light", true)).toBe(false);
        });
    });

    describe("#getPrefs", function () {
        const settle = () => data.updatePrefs(() => ({})); // waits for queued writes

        it("migrates checkDarkMode to theme and keeps the other prefs", async function () {
            stub.store.prefs = { checkDarkMode: true, checkBib: false };
            const prefs = await data.getPrefs();
            await settle();
            expect(prefs.theme).toBe("dark");
            expect(stub.store.prefs).toEqual({
                checkDarkMode: true,
                checkBib: false,
                theme: "dark",
            });
        });

        it("gives brand-new users the system theme", async function () {
            const prefs = await data.getPrefs();
            await settle();
            expect(prefs.theme).toBe("system");
            expect(stub.store.prefs.theme).toBe("system");
            expect(stub.store.prefs.checkBib).toBe(true);
        });

        it("does not rewrite checkDarkMode for system without matchMedia", async function () {
            stub.store.prefs = { theme: "system", checkDarkMode: true };
            const prefs = await data.getPrefs();
            await settle();
            expect(prefs.checkDarkMode).toBe(true);
            expect(stub.store.prefs).toEqual({ theme: "system", checkDarkMode: true });
        });
    });
});
