import jQuery from "jquery";
import select2Factory from "select2";

// Only initialize Select2 in contexts with a DOM (skip in service workers)
if (typeof jQuery.fn !== "undefined") {
    select2Factory(undefined, jQuery);
}

export default jQuery;
export { jQuery as $ };
