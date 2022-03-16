// $(() => {
//     const url = window.location.href;
//     // info("Executing Paper Memory content script");
//     if (
//         Object.values(global.knownPaperPages)
//             .reduce((a, b) => a.concat(b), [])
//             .some((d) => url.includes(d))
//     ) {
//         info("Running contentScriptMain for", url);
//         contentScriptMain(url);
//     }

//     chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
//         // listen for messages sent from background.js
//         if (request.message === "tabUrlUpdate") {
//             info("Running content_script for url update");
//             console.log(request.url); // new url is now in content scripts!
//             contentScriptMain(request.url);
//         }
//     });
// });
