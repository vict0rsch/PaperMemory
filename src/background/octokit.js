/**
 * npm install @octokit/request
 * npm install -g browserify
 * npm install esmify
 * browserify src/background/octokit.js -p esmify -o src/shared/js/utils/gist.js
 */
const { request } = require("@octokit/request");
if (typeof window === "undefined") {
    window = global;
} else {
    global = window;
}
global.octokitRequest = request;
