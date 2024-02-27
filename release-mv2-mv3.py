import json
import os
import sys
from pathlib import Path
from shutil import copy2, copytree, make_archive, rmtree


def copy_files(root, out_dir, folders, files):
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    for folder in folders:
        copytree(root / folder, out_dir / folder)
    for file in files:
        copy2(root / file, out_dir / file)


def zip_dir(out_dir, version):
    candidate = out_dir.parent / f"{out_dir.name}-{version}"
    if Path(str(candidate) + ".zip").exists():
        abort = input(f"{candidate}.zip already exists. Overwrite? [y/N] ")
        if abort.lower() != "y":
            rmtree(out_dir)
            sys.exit(1)
    make_archive(candidate, "zip", out_dir)
    rmtree(out_dir)


def update_ffx_manifest(manifest, out_dir):
    manifest["background"] = {
        "scripts": [
            "src/shared/min/utils.min.js",
            manifest["background"]["service_worker"],
        ],
    }
    manifest["content_security_policy"] = manifest["content_security_policy"][
        "extension_pages"
    ]
    manifest["browser_action"] = manifest["action"]
    del manifest["action"]
    manifest["web_accessible_resources"] = manifest["web_accessible_resources"][0][
        "resources"
    ]
    manifest["manifest_version"] = 2
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))


if __name__ == "__main__":

    folders = ["icons", "src"]
    files = ["LICENSE", "manifest.json"]

    root = Path(__file__).parent.resolve()
    out = root / "extra" / "archives"

    manifest = json.loads((root / "manifest.json").read_text())
    version = manifest["version"]

    manifest_chr = manifest.copy()
    manifest_ffx = manifest.copy()

    out_chr = out / "chrome"
    out_ffx = out / "firefox"

    os.system("gulp build")

    copy_files(root, out_chr, folders, files)
    zip_dir(out_chr, version)

    copy_files(root, out_ffx, folders, files)
    update_ffx_manifest(manifest_ffx, out_ffx)
    zip_dir(out_ffx, version)

    print(f"Done in {out}")
