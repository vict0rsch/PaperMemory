"""
This script is used to release the extension for Chrome and Firefox.

It will copy the files from the root directory to the output directory and
zip the output directory into a zip file.

The output directory is ``{root}/extra/archives``.

The Chrome zip file is written to ``{out_dir}/chrome-{version}.zip``.
The Firefox zip file is written to ``{out_dir}/firefox-{version}.zip``.

Only the files in the ``src`` directory are copied to the output directory.

The ``LICENSE`` file and the ``manifest.json`` file are copied to the output
directory.

The ``icons`` directory is copied to the output directory.
"""

import json
import os
import sys
import tempfile
from argparse import ArgumentParser
from pathlib import Path
from shutil import copy2, copytree, make_archive, rmtree

os.environ["PYTHONBREAKPOINT"] = "ipdb.set_trace"


def copy_files(root, out_dir, folders, files):
    """Copy files from ``{root}/{folder}`` to ``{out_dir}/{folder}`` and
    ``{root}/{file}`` to ``{out_dir}/{file}``.

    Parameters
    ----------
    root : Path
        Root directory.
    out_dir : Path
        Output directory.
    folders : list[str]
        Folders to copy.
    files : list[str]
        Files to copy.
    """
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    for folder in folders:
        copytree(root / folder, out_dir / folder)
    for file in files:
        copy2(root / file, out_dir / file)


def zip_dir(out_dir, version):
    """Zip ``{out_dir}`` into ``{out_dir}-{version}.zip``.

    Parameters
    ----------
    out_dir : Path
        Output directory.
    version : str
        Version.

    Returns
    -------
    Path
        Path to the zip file.
    """
    candidate = out_dir.parent / f"{out_dir.name}-{version}"
    if Path(str(candidate) + ".zip").exists():
        abort = input(f"{candidate}.zip already exists. Overwrite? [y/N] ")
        if abort.lower() != "y":
            rmtree(out_dir)
            sys.exit(1)
    make_archive(candidate, "zip", out_dir)
    return Path(str(candidate) + ".zip")


def update_ffx_manifest(manifest, out_dir):
    """Update the manifest from v3 to v2 for Firefox.

    Parameters
    ----------
    manifest : dict
        Manifest.
    out_dir : Path
        Output directory.
    """
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
    del manifest["host_permissions"]
    manifest["commands"]["_execute_browser_action"] = manifest["commands"][
        "_execute_action"
    ].copy()
    del manifest["commands"]["_execute_action"]
    manifest["permissions"].append("<all_urls>")

    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    parser = ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Force overwrite")
    args = parser.parse_args()

    # folders which will be copied from ``{root}/{folder}`` to ``{out}/{folder}``
    folders = ["icons", "src"]
    # files which will be copied from ``{root}/{file}`` to ``{out}/{file}``
    files = ["LICENSE", "manifest.json"]

    root = Path(__file__).parent.resolve()
    out = root / "extra" / "archives"

    manifest = json.loads((root / "manifest.json").read_text())
    version = manifest["version"]

    manifest_chr = manifest.copy()
    manifest_ffx = manifest.copy()

    out_chr = out / "chrome"
    out_ffx = out / "firefox"

    out_chr.mkdir(parents=True, exist_ok=True)
    out_ffx.mkdir(parents=True, exist_ok=True)

    os.system("gulp build")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp) / "chrome"
        copy_files(root, tmp_dir, folders, files)
        tmp_archive = zip_dir(tmp_dir, version)
        chr_candidate = out_chr / tmp_archive.name
        if chr_candidate.exists():
            if not args.force:
                if "y" not in input(
                    f"{chr_candidate} already exists. Overwrite? [y/N] "
                ):
                    sys.exit(1)
            chr_candidate.unlink()
        tmp_archive.rename(chr_candidate)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp) / "firefox"
        copy_files(root, tmp_dir, folders, files)
        update_ffx_manifest(manifest_ffx, tmp_dir)
        tmp_archive = zip_dir(tmp_dir, version)
        ffx_candidate = out_ffx / tmp_archive.name
        if ffx_candidate.exists():
            if not args.force:
                if "y" not in input(
                    f"{ffx_candidate} already exists. Overwrite? [y/N] "
                ):
                    sys.exit(1)
            ffx_candidate.unlink()
        tmp_archive.rename(ffx_candidate)

    print(f"\nDone in {out}")
