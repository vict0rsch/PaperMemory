class GistManager {
    constructor({ pat, appName = "PaperMemorySync" }) {
        if (!pat) {
            throw new Error("GistManager: `pat` argument is required");
        }
        this.pat = pat;
        this.appName = appName;

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
    getIdentifierFilename() {
        return `DO_NO_EDIT__${this.appName}.json`;
    }
    findMemoryInfo(gists) {
        const pmGist = gists.find(
            (g) =>
                !!Object.values(g.files).find(
                    (f) => f.filename === this.getIdentifierFilename()
                )
        );
        if (pmGist) {
            return this.makeInfo(pmGist);
        }
        return pmGist;
    }
    makeInfo(gist) {
        return {
            id: gist.id,
            html: gist.html_url,
            url: gist.url,
        };
    }
    async getGists() {
        return this.get("/gists");
    }
    makeFileRequestBody({ content }) {
        const filename = this.getIdentifierFilename();
        return {
            description: "Automated PaperMemory sync Gist. Do not edit manually.",
            public: false,
            files: {
                [filename]: {
                    content,
                    type: "application/json",
                },
            },
        };
    }
    updateFromGist(gist) {
        this.info = this.makeInfo(gist);
        this.file = Object.values(gist.files)[0];
        if (this.file.filename !== this.getIdentifierFilename()) {
            this.valid = false;
            throw new Error(
                "GistManager: Gist file name is invalid. Expected " +
                    this.getIdentifierFilename() +
                    ", got " +
                    this.file.filename
            );
        }
        this.data = JSON.parse(this.file.content);
    }
    async createGist() {
        const res = await this.post(
            "/gists",
            this.makeFileRequestBody({ content: "{}" })
        );
        if (res.ok) {
            const json = await res.json();
            const info = this.makeInfo(json);
            await setStorage("syncGistInfo", info);
            return info;
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
            this.info = this.findMemoryInfo(gists);
            if (!this.info) {
                this.info = await this.createGist();
            } else {
                await this.pull(true);
            }
            this.valid = !!this.info;
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
            this.updateFromGist(gist);
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
        this.updateFromGist(gist);
    }
}
