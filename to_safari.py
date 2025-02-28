import json
import os
from pathlib import Path
from shutil import copy2, copytree, rmtree

from rich.console import Console

console = Console()
print = console.print

root = Path(__file__).resolve().parent


def adjust_manifest(manifest_path: Path):
    with open(manifest_path, "r") as f:
        manifest = json.load(f)
    manifest["permissions"].remove("downloads")
    manifest["permissions"].remove("downloads.open")
    manifest["options_ui"].pop("open_in_tab")

    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)


def build_safari_extension(extension_path: Path, project_path: Path):
    is_empty = not list(project_path.iterdir())
    cmd = f"xcrun safari-web-extension-converter {extension_path} --copy-resources --project-location {project_path} --macos-only --app-name PaperMemorySafari"
    if not is_empty:
        if "y" in input("The project is not empty. Overwrite? (y/n): "):
            cmd += " --force"
        else:
            print("Aborting.")
            return
    os.system(cmd)


def custom_copy_function(src, dst):
    src = str(src)
    dst = str(dst)
    if "/node_modules/" in src or "/.git/" in src:
        return
    return copy2(src, dst)


def main():
    src_dir = root
    dst_dir = root.parent / "papermemory-safari"
    dst_pm = dst_dir / "papermemory"
    dst_safari = dst_dir / "safari"

    dst_dir.mkdir(parents=True, exist_ok=True)
    dst_pm.mkdir(parents=True, exist_ok=True)
    dst_safari.mkdir(parents=True, exist_ok=True)

    with console.status("Copying files..."):
        copytree(
            src_dir, dst_pm, dirs_exist_ok=True, copy_function=custom_copy_function
        )
    with console.status("Removing node_modules..."):
        rmtree(dst_pm / "node_modules")
    with console.status("Adjusting manifest..."):
        adjust_manifest(dst_pm / "manifest.json")
    with console.status("Building Safari extension..."):
        build_safari_extension(dst_pm, dst_safari)


if __name__ == "__main__":
    main()
