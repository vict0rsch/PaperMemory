// use in the log() function util
var LOGTRACE = false;
if (typeof module !== "undefined" && module.exports != null) {
    var dummyModule = module;
    dummyModule.exports = {
        LOGTRACE,
    };
}
