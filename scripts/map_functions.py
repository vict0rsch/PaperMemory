"""
This scripts is used to discover missing imports in the codebase.
It will print recommendations for imports to add to the top of the file.

To run:
python scripts/map_functions.py
"""

import re
from pathlib import Path

JS_BUILTINS = set(
    [
        "console",
        "window",
        "document",
        "location",
        "history",
        "navigator",
        "performance",
        "XMLHttpRequest",
        "fetch",
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "setImmediate",
        "clearImmediate",
        "Promise",
        "Object",
        "Array",
        "Set",
        "Map",
        "WeakMap",
        "WeakSet",
        "Symbol",
        "BigInt",
        "BigInt64Array",
        "BigUint64Array",
        "String",
        "Number",
        "Boolean",
        "Date",
        "RegExp",
        "Error",
        "if",
        "else",
        "for",
        "while",
        "do",
        "switch",
        "case",
        "includes",
        "indexOf",
        "lastIndexOf",
        "startsWith",
        "endsWith",
        "substring",
        "slice",
        "join",
        "split",
        "trim",
        "toLowerCase",
        "toUpperCase",
        "includes",
        "indexOf",
        "map",
        "filter",
        "reduce",
        "forEach",
        "find",
        "findIndex",
        "some",
        "every",
        "concat",
        "push",
        "pop",
        "shift",
        "unshift",
        "reverse",
        "replace",
        "replaceAll",
        "resolve",
        "Blob",
        "catch",
        "parse",
        "parseFloat",
        "parseInt",
        "isNaN",
        "isFinite",
        "isNaN",
    ]
)

KNOWN_IGNORES = {
    "src/shared/js/utils/data.js": ["cb"],
    "src/shared/js/utils/logTrace.js": ["log"],
    "src/shared/js/entry-points/popup-entry.js": ["state"],
}

ROOT_DIR = Path(__file__).resolve().parent.parent


def get_config_constants():
    file_path = ROOT_DIR / "src/shared/js/utils/config.js"
    with open(file_path, "r") as file:
        content = file.read()

    # find export const ...:
    matches = re.findall(r"export\s+const\s+(\w+)\s*=\s*", content, re.I)
    return set(matches)


def ignore_file(file_path):
    str_path = str(file_path)
    return ".min." in str_path or "bundle" in str_path


def extract_functions(file_path):
    with open(file_path, "r") as file:
        content = file.read()

    # Find all function javascript definitions
    function_defs = re.findall(
        r"function\s+(\w+)\s*\(.*\)\s*\{", content, re.I
    ) + re.findall(r"const\s+(\w+)\s*=\s*(async\s*)?\(.*\)\s*=>", content, re.I)
    return [f[0] if isinstance(f, (list, tuple)) else f for f in function_defs]


def get_file_string(file_path):
    return str(file_path.relative_to(ROOT_DIR))


def map_functions():
    functions = {"file_to_func": {}, "func_to_file": {}}
    for file_path in ROOT_DIR.glob("src/**/*.js"):
        fs = get_file_string(file_path)
        if ignore_file(fs):
            continue
        functions["file_to_func"][fs] = []
        function_defs = extract_functions(file_path)
        for func in function_defs:
            functions["file_to_func"][fs].append(func)
            functions["func_to_file"][func] = fs
    return functions


def extract_function_calls(file_path) -> set[str]:
    with open(file_path, "r") as file:
        content = file.read()

    function_calls = re.findall(r'(\.?"?\w+)\(', content, re.I)
    function_calls = [
        f[0] if isinstance(f, (list, tuple)) else f for f in function_calls
    ]
    return set(
        [
            f
            for f in function_calls
            if f not in JS_BUILTINS
            and not f.startswith(".")
            and not f.startswith('"')
            and f not in KNOWN_IGNORES.get(get_file_string(file_path), [])
        ]
    )


def extract_imports(file_path):
    with open(file_path, "r") as file:
        content = file.read()
    # Match imports that may span multiple lines
    # Use re.MULTILINE and re.DOTALL to handle newlines
    # Capture the content between curly braces
    # Split on commas and clean up each item
    matches = re.findall(
        r"import\s*{([^}]*)}\s*from", content, re.MULTILINE | re.DOTALL
    )

    imported_items = []
    for match in matches:
        # Split on commas and clean up whitespace/newlines for each item
        items = [item.strip() for item in match.split(",") if item.strip()]
        imported_items.extend(items)

    return set(imported_items)


def find_missing_imports(file_path, functions, config_constants):
    function_calls = extract_function_calls(file_path)
    constants_used = find_config_constants(file_path, config_constants)
    imports = extract_imports(file_path)
    file_defined_functions = set(functions["file_to_func"][get_file_string(file_path)])

    return (function_calls | constants_used) - imports - file_defined_functions


def find_function_defined_not_used(file_path, functions) -> set[str]:
    function_calls = extract_function_calls(file_path)
    file_defined_functions = set(functions["file_to_func"][get_file_string(file_path)])
    return file_defined_functions - function_calls


def find_config_constants(file_path, config_constants):
    with open(file_path, "r") as file:
        content = file.read()
    constants_used = []
    fs = get_file_string(file_path)
    for constant in config_constants:
        if constant in content and constant not in KNOWN_IGNORES.get(fs, []):
            constants_used.append(constant)
    return set(constants_used)


def recommend_imports(file_path, functions, config_constants):
    recommendations = ""

    missing_imports = find_missing_imports(file_path, functions, config_constants)

    if not missing_imports:
        return recommendations

    recommended_imports = {}
    for func_or_const in missing_imports:
        file = None
        if func_or_const in functions["func_to_file"]:
            file = functions["func_to_file"][func_or_const]
        elif func_or_const in config_constants and "config.js" not in str(file_path):
            file = "src/shared/js/utils/config.js"
        if file:
            if file not in recommended_imports:
                recommended_imports[file] = []
            recommended_imports[file].append(func_or_const)

    for file, missing_funcs in recommended_imports.items():
        missing_funcs = ", ".join(missing_funcs)
        file = file.replace("src/shared/js/utils/", "@pmu/").replace("src/", "@pm/")
        recommendations += "import { " + missing_funcs + ' } from "' + file + '";\n'
    return recommendations


def main():
    functions = map_functions()
    config_constants = get_config_constants()
    for file in ROOT_DIR.glob("src/**/*.js"):
        if ignore_file(file):
            continue
        recommendations = recommend_imports(file, functions, config_constants)
        if recommendations:
            print("-" * 100)
            print(get_file_string(file))
            print("-" * 100)
            print(recommendations)
            print("\n\n")
        else:
            print(f"No recommendations for {get_file_string(file)}")


if __name__ == "__main__":
    main()
