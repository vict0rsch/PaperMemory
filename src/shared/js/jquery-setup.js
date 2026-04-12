import $ from "jquery";
window.$ = window.jQuery = $;
import select2 from "select2";
if (typeof select2 === "function") {
    select2(window, $);
}
