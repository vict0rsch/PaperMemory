class GistManager {
    constructor({ pat, identifier }) {
        if (!pat) {
            throw new Error("GistManager: `pat` argument is required");
        }
        if (!identifier) {
            throw new Error("GistManager: `identifier` argument is required");
        }
        this.pat = pat;
        this.identifier = identifier;

        this.apiURL = "https://api.github.com";
        this.valid = false;
        this.info = null;
        this.file = null;
        this.data = null;
    }
    url(path) {
        if (path.startsWith("http")) return path;
        const p = path.startsWith("/") ? path : "/" + path;
        return this.apiURL + p;
    }
    get(path) {
        const url = this.url(path);
        return fetch(url, {
            headers: {
                Authorization: "token " + this.pat,
            },
        });
    }
    post(path, body) {
        const url = this.url(path);
        return fetch(url, {
            method: "POST",
            headers: {
                Authorization: "token " + this.pat,
            },
            body: JSON.stringify(body),
        });
    }
    patch(path, body) {
        if (!this.valid) {
            throw new Error("GistManager: Gist is not valid");
        }
        const url = this.url(path);
        return fetch(url, {
            method: "PATCH",
            headers: {
                Authorization: "token " + this.pat,
            },
            body: JSON.stringify(body),
        });
    }
    get identifierFilename() {
        return `DO_NO_EDIT__${this.identifier}.json`;
    }
    findMemoryGist(gists) {
        return gists.find(
            (g) =>
                !!Object.values(g.files).find(
                    (f) => f.filename === this.identifierFilename
                )
        );
    }
    makeInfo(gist) {
        if (!gist || !gist.id || !gist.url || !gist.html_url) {
            throw new Error(
                "GistManager: Gist is invalid. Expected {id, html_url, url}, received " +
                    JSON.stringify(gist)
            );
        }
        return {
            id: gist.id,
            html_url: gist.html_url,
            url: gist.url,
        };
    }
    async getGists() {
        return this.get("/gists");
    }
    makeFileRequestBody({ content }) {
        return {
            description: "Automated PaperMemory sync Gist. Do not edit manually.",
            public: false,
            files: {
                [this.identifierFilename]: {
                    content,
                    type: "application/json",
                },
            },
        };
    }
    async updateFromGist(gist) {
        this.info = this.makeInfo(gist);
        this.file = Object.values(gist.files)[0];
        if (this.file.filename !== this.identifierFilename) {
            this.valid = false;
            throw new Error(
                "GistManager: Gist file name is invalid. Expected " +
                    this.identifierFilename +
                    ", got " +
                    this.file.filename
            );
        }
        this.data = JSON.parse(this.file.content);
        await setStorage("syncGistInfo", this.info);
    }
    async createGist() {
        const res = await this.post(
            "/gists",
            this.makeFileRequestBody({ content: "{}" })
        );
        if (res.ok) {
            const json = await res.json();
            return json;
        }
    }
    async init(reset = false) {
        const info = await getStorage("syncGistInfo");
        if (!info || reset) {
            const res = await this.getGists();
            if (!res.ok) {
                return;
            }
            const gists = await res.json();
            let gist = this.findMemoryGist(gists);
            if (!gist) {
                gist = await this.createGist();
            }
            this.valid = !!gist;
            if (this.valid) {
                await this.updateFromGist(gist);
            }
        } else {
            this.info = info;
            await this.pull(true);
        }
    }
    async pull(init = false) {
        if (!init && !this.valid) {
            throw new Error("GistManager: Gist is not valid");
        }
        const res = await this.get(this.info.url);
        if (res.ok) {
            const gist = await res.json();
            await this.updateFromGist(gist);
            this.valid = true;
        }
    }

    async overwrite(data) {
        if (!this.valid) {
            throw new Error("GistManager: Gist is not valid");
        }
        const content = typeof data !== "string" ? JSON.stringify(data) : data;
        const res = await this.patch(
            this.info.url,
            this.makeFileRequestBody({ content })
        );
        const gist = await res.json();
        await this.updateFromGist(gist);
    }

    async delete(force = false, verbose = false) {
        if (!this.valid && !force) {
            throw new Error("GistManager: Gist is not valid");
        }
        const res = await fetch(this.info.url, {
            method: "DELETE",
            headers: {
                Authorization: "token " + this.pat,
            },
        });
        if (res.ok) {
            await setStorage("syncGistInfo", null);
            this.valid = false;
            verbose &&
                console.log(`GistManager: Gist deleted (${JSON.stringify(this.info)})`);
        }
    }
}

if (typeof module !== "undefined" && module.exports != null) {
    var dummyModule = module;
    dummyModule.exports = { GistManager };
}
