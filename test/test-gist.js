const { GistManager } = require("../src/shared/js/utils/gist.js");

const { expect } = require("expect");
const fetch = require("node-fetch-commonjs");
// patch it through to gist.js
global.fetch = fetch;

var storage = {
    gets: {},
    sets: {},
    data: {},
};

resetStorage = () => {
    storage = {
        gets: {},
        sets: {},
        data: {},
    };
};

global.setStorage = async (key, value) => {
    storage.sets[key] =
        typeof storage.sets[key] === "undefined" ? 1 : storage.sets[key] + 1;
    storage.data[key] = value;
};

global.getStorage = async (key) => {
    storage.gets[key] =
        typeof storage.sets[key] === "undefined" ? 1 : storage.sets[key] + 1;
    return storage.data[key];
};

const expectThrowsAsync = async (method, errorMessage) => {
    // https://stackoverflow.com/questions/45466040/verify-that-an-exception-is-thrown-using-mocha-chai-and-async-await
    let error = null;
    try {
        await method();
    } catch (err) {
        error = err;
    }
    expect(error.constructor.name).toEqual("Error");
    if (errorMessage) {
        expect(error.message).toEqual(errorMessage);
    }
};
const expectNotThrowsAsync = async (method) => {
    let error = null;
    try {
        await method();
    } catch (err) {
        error = err;
    }
    expect(error).toBe(null);
};

const PAT = process.env.github_pat ?? process.env.pm_ghp;
const noDelete = !!process.env.noDelete;
const IDENTIFIER = "[test-gist]PaperMemorySync";

describe("Testing GistManager", function () {
    var gm = new GistManager({ pat: PAT, identifier: IDENTIFIER });
    this.timeout(60e3);
    this.slow(120e3);
    describe("Testing #constructor", function () {
        it("Should have a pat", function () {
            expect(gm.pat).toEqual(PAT);
        });
        it("Should have an identifier", function () {
            expect(gm.identifier).toEqual(IDENTIFIER);
        });
        it("Should have an apiURL", function () {
            expect(gm.apiURL).toEqual("https://api.github.com");
        });
        it("Should be invalid initially", function () {
            expect(gm.valid).toBe(false);
        });
        it("Should throw an error without `identifier`", function () {
            expect(() => new GistManager({ pat: PAT })).toThrowError();
        });
        it("Should throw an error without `pat`", function () {
            expect(() => new GistManager({ identifier: IDENTIFIER })).toThrowError();
        });
    });
    describe("Testing #url", function () {
        it("Should return the same url if it starts with http", function () {
            expect(gm.url("https://api.github.com")).toEqual("https://api.github.com");
        });
        it("Should prepend relative paths with #apiURL", function () {
            expect(gm.url("something").startsWith(gm.apiURL)).toBe(true);
        });
        it("Should handle leading `/` in relative paths", function () {
            expect(gm.url("something")).toEqual(gm.url("/something"));
        });
    });
    describe("Testing #identifierFilename", function () {
        it("Should return a filename with the identifier", function () {
            expect(gm.identifierFilename).toEqual(`DO_NO_EDIT__${IDENTIFIER}.json`);
        });
    });
    describe("Testing #findMemoryGist", function () {
        it("Should return undefined from empty list", async function () {
            const gists = [];
            const pmGist = gm.findMemoryGist(gists);
            expect(pmGist).toBeUndefined();
        });
        it("Should return undefined from list without a match", async function () {
            const gists = [{ files: { "test.txt": { filename: "test.txt" } } }];
            const pmGist = gm.findMemoryGist(gists);
            expect(pmGist).toBeUndefined();
        });
        it("Should return an Object from list with a match", async function () {
            const gists = [
                {
                    files: {
                        [gm.identifierFilename]: {
                            filename: gm.identifierFilename,
                        },
                        "test.txt": { filename: "test.txt" },
                    },
                },
                {
                    files: {
                        "test2.txt": { filename: "test2.txt" },
                    },
                },
            ];
            const pmGist = gm.findMemoryGist(gists);
            expect(pmGist).toBeInstanceOf(Object);
            expect(
                Object.keys(pmGist.files).find((f) => f === gm.identifierFilename)
            ).toEqual(gm.identifierFilename);
        });
    });
    describe("Testing #getGists", function () {
        it("Should return a Response", async function () {
            const res = await gm.getGists();
            expect(res.constructor.name).toEqual("Response");
        });
        it("Response should be ok with valid token", async function () {
            const res = await gm.getGists();
            expect(res.ok).toBe(true);
        });
        it("Response should not be ok with invalid token", async function () {
            const ggm = new GistManager({ pat: PAT + "z", identifier: IDENTIFIER });
            const res = await ggm.getGists();
            expect(res.ok).toBe(false);
        });
        it("JSON should be an Array", async function () {
            const res = await gm.getGists();
            const gists = await res.json();
            expect(gists).toBeInstanceOf(Array);
        });
        it("JSON data should be an Array of Objects with attributes `files, id, html_url, url`", async function () {
            const res = await gm.getGists();
            const gists = await res.json();
            if (gists.length > 0) {
                expect(gists[0].files).toBeInstanceOf(Object);
                expect(gists[0].id.constructor.name).toEqual("String");
                expect(gists[0].html_url.constructor.name).toEqual("String");
                expect(gists[0].url.constructor.name).toEqual("String");
            }
        });
    });
    describe("Testing #updateFromGist", function () {
        it("Requires `id`, `html_url`, `api`, `files`", function () {
            const id = "123";
            const url = "https://api.github.com/gists/123";
            const html_url = "https://gist.github.com/123";
            const files = {
                [gm.identifierFilename]: {
                    filename: gm.identifierFilename,
                    content: "{}",
                },
            };
            expectThrowsAsync(() => gm.updateFromGist({}));
            expectThrowsAsync(() => gm.updateFromGist({ id, url, html_url }));
            expectThrowsAsync(() => gm.updateFromGist({ id, url, files }));
            expectThrowsAsync(() => gm.updateFromGist({ id, html_url, files }));
            expectThrowsAsync(() => gm.updateFromGist({ url, html_url, files }));
            expectNotThrowsAsync(() => gm.updateFromGist({ url, html_url, files, id }));
        });
        it("Requires `filename` to match `identifierFilename`", function () {
            const id = "123";
            const url = "https://api.github.com/gists/123";
            const html_url = "https://gist.github.com/123";
            const files = {
                ["test.json"]: {
                    filename: "test.json",
                    content: "{}",
                },
            };
            expectThrowsAsync(() => gm.updateFromGist({ url, html_url, files, id }));
        });
        it("Requires the file to contain JSON-parsable data", function () {
            const id = "123";
            const url = "https://api.github.com/gists/123";
            const html_url = "https://gist.github.com/123";
            const files_not_json = {
                [gm.identifierFilename]: {
                    filename: gm.identifierFilename,
                    content: "not json",
                },
            };
            const files_json = {
                [gm.identifierFilename]: {
                    filename: gm.identifierFilename,
                    content: '{"not json": false}',
                },
            };
            expectThrowsAsync(() =>
                gm.updateFromGist({ url, html_url, files: files_not_json, id })
            );
            expectNotThrowsAsync(() =>
                gm.updateFromGist({ url, html_url, files: files_json, id })
            );
        });
        it("Updates the Manager's attributes", async function () {
            const id = "123";
            const url = "https://api.github.com/gists/123";
            const html_url = "https://gist.github.com/123";
            const files = {
                [gm.identifierFilename]: {
                    filename: gm.identifierFilename,
                    content: '{"not json": false}',
                },
            };
            await gm.updateFromGist({ url, html_url, files, id });
            expect(gm.info).toBeInstanceOf(Object);
            expect(gm.info.id).toEqual(id);
            expect(gm.info.url).toEqual(url);
            expect(gm.info.html_url).toEqual(html_url);
            expect(gm.data).toEqual({ "not json": false });
        });
        it("Writes to storage", async function () {
            const id = "123";
            const url = "https://api.github.com/gists/123";
            const html_url = "https://gist.github.com/123";
            const files = {
                [gm.identifierFilename]: {
                    filename: gm.identifierFilename,
                    content: '{"not json": false}',
                },
            };
            await setStorage("syncGistInfo", null);
            await gm.updateFromGist({ url, html_url, files, id });
            const stored = await getStorage("syncGistInfo");
            expect(stored).toBeInstanceOf(Object);
            expect(Object.keys(stored)).toContain("id");
            expect(Object.keys(stored)).toContain("url");
            expect(Object.keys(stored)).toContain("html_url");
        });
    });
    describe("Testing #makeFileRequestBody", function () {
        it("Expects a {content} arg", function () {
            expect(() => gm.makeFileRequestBody({ content: "" })).not.toThrowError();
            expect(() => gm.makeFileRequestBody()).toThrowError();
        });
        it("Returns an Object", function () {
            expect(gm.makeFileRequestBody({ content: "" })).toBeInstanceOf(Object);
        });
        it("Returns an Object with keys `description`, `public`, `files`", function () {
            const body = gm.makeFileRequestBody({ content: "" });
            expect(body.public).toBe(false);
            expect(body.description.constructor.name).toEqual("String");
            expect(body.files.constructor.name).toEqual("Object");
        });
        it("Returns an Object with a `files` key that contains a single Object with a key matching `identifierFilename`", function () {
            const body = gm.makeFileRequestBody({ content: "" });
            expect(body.files[gm.identifierFilename]).toBeInstanceOf(Object);
            expect(Object.keys(body.files).length).toEqual(1);
            expect(Object.keys(body.files)[0]).toEqual(gm.identifierFilename);
        });
    });
    describe("Testing #createGist", function () {
        var new_gist;
        it("Creates a gist", async function () {
            const gists = await (await gm.getGists()).json();
            new_gist = await gm.createGist();
            const updated_gists = await (await gm.getGists()).json();
            expect(updated_gists.length).toEqual(gists.length + 1);
        });
        it("Returns an object with keys `id, url, html_url, files`", async function () {
            expect(new_gist).toBeInstanceOf(Object);
            expect(Object.keys(new_gist)).toContain("id");
            expect(Object.keys(new_gist)).toContain("url");
            expect(Object.keys(new_gist)).toContain("html_url");
            expect(Object.keys(new_gist)).toContain("files");
        });
        it("Creates a gist with a single file", function () {
            expect(Object.keys(new_gist.files).length).toEqual(1);
        });
        it("Creates a gist with the appropriate identifierFilename", function () {
            expect(Object.keys(new_gist.files)[0]).toEqual(gm.identifierFilename);
        });
        after(async function () {
            if (!noDelete) {
                gm.updateFromGist(new_gist);
                await gm.delete(true);
            }
        });
    });
    describe("Testing #init", function () {
        it("Creates a gist if none exists", async function () {
            gm = new GistManager({ pat: PAT, identifier: IDENTIFIER });
            const gists = await (await gm.getGists()).json();
            await gm.init();
            const updated_gists = await (await gm.getGists()).json();
            expect(updated_gists.length).toEqual(gists.length + 1);
        });
        it("2 instances are associated with the same Gist", async function () {
            gm = new GistManager({ pat: PAT, identifier: IDENTIFIER });
            await gm.init();
            ggm = new GistManager({ pat: PAT, identifier: IDENTIFIER });
            await ggm.init();
            expect(ggm.info).toEqual(gm.info);
        });
        it("Writes its info to storage", async function () {
            gm = new GistManager({ pat: PAT, identifier: IDENTIFIER });
            await gm.init();
            expect(await getStorage("syncGistInfo")).toEqual(gm.info);
        });
        it("Does not create a gist if one exists", async function () {
            gm = new GistManager({ pat: PAT, identifier: IDENTIFIER });
            await gm.init();
            ggm = new GistManager({ pat: PAT, identifier: IDENTIFIER });
            const gists = await (await ggm.getGists()).json();
            await ggm.init();
            const updated_gists = await (await ggm.getGists()).json();
            expect(updated_gists.length).toEqual(gists.length);
        });
        it("Pulls the appropriate data", async function () {
            const testData = { test: "data", nested: { yes: true } };
            gm = new GistManager({ pat: PAT, identifier: IDENTIFIER });
            await gm.init();
            await gm.overwrite(testData);
            ggm = new GistManager({ pat: PAT, identifier: IDENTIFIER });
            await ggm.init();
            expect(ggm.data).toEqual(testData);
        });
        afterEach(async function () {
            if (!noDelete) {
                await gm.delete(true);
            }
        });
    });
    describe("Testing #overwrite & #pull", function () {
        it("Overwrites and updates the files' contents", async function () {
            const testData1 = { test: "data", nested: { yes: true } };
            const testData2 = { tetest: "data", nested: { no: true } };
            gm = new GistManager({ pat: PAT, identifier: IDENTIFIER });
            ggm = new GistManager({ pat: PAT, identifier: IDENTIFIER });
            await gm.init();
            await ggm.init();
            await gm.overwrite(testData1);
            expect(gm.data).toEqual(testData1);
            await ggm.pull();
            expect(ggm.data).toEqual(testData1);

            await ggm.overwrite(testData2);
            expect(ggm.data).toEqual(testData2);
            await gm.pull();
            expect(gm.data).toEqual(testData2);
        });
        afterEach(async function () {
            if (!noDelete) {
                await gm.delete(true);
            }
        });
    });
    describe("Testing #init", function () {});
    after(async function () {
        gm.valid && !noDelete && (await gm.delete());
    });
});
