// use in the log() function util
// 0 => no trace
// 1 => trace errors
// 2 => trace warnings
// 3 => trace info
// 4 => trace debug
// 5 => trace all
var LOGTRACE = 0;

if (typeof module !== "undefined" && module.exports != null) {
    var dummyModule = module;
    dummyModule.exports = {
        LOGTRACE,
    };
}
