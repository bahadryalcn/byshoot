#!/usr/bin/env python3
"""Collect installed upstream notices for the locked Windows release dependencies.

Run after `pnpm install --frozen-lockfile` and a Cargo build. By default this
reads local packages and previously embedded upstream snapshots. Initial
generation may require --fetch-missing to read exact upstream license sources.
It refuses to silently omit packages without legal texts.
It preserves upstream alternative-license texts rather than selecting a license.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import urllib.request
import zipfile


ROOT = Path(__file__).resolve().parents[1]
LEGAL_PREFIXES = ("license", "licence", "copying", "copyright", "notice", "unlicense")
LEGAL_DIRS = {"license", "licenses", "licence", "licences"}
# These published tarballs omit the repository's legal documents. Only exact
# repository revisions recorded in their own .cargo_vcs_info.json are used.
UPSTREAM_LICENSE_PATHS = {
    "alloc-stdlib": ["LICENSE"],
    "clipboard-win": ["LICENSE"],
    "defmt-parser": ["LICENSE-APACHE", "LICENSE-MIT"],
    "tauri-plugin": ["LICENSE-APACHE-2.0", "LICENSE-MIT", "LICENSE.spdx"],
    "webview2-com": ["LICENSE"],
    "webview2-com-macros": ["LICENSE"],
    "webview2-com-sys": ["LICENSE"],
}


def legal_files(directory: Path, declared: str | None = None) -> list[Path]:
    files = set()
    for child in directory.iterdir():
        if child.is_file() and child.name.lower().startswith(LEGAL_PREFIXES):
            files.add(child)
        elif child.is_dir() and child.name.lower() in LEGAL_DIRS:
            files.update(path for path in child.rglob("*") if path.is_file())
    if declared:
        path = Path(declared)
        if not path.is_absolute():
            path = directory / path
        if path.is_file():
            files.add(path)
    return sorted(files, key=lambda path: path.as_posix().lower())


def previous_upstream_snapshots() -> dict[str, str]:
    output = ROOT / "THIRD_PARTY_NOTICES.txt"
    if not output.exists():
        return {}
    content = output.read_text(encoding="utf-8")
    documents = dict(re.findall(
        r"^----- BEGIN LEGAL TEXT (L\d+) -----\n(.*?)\n----- END LEGAL TEXT \1 -----$",
        content, flags=re.MULTILINE | re.DOTALL,
    ))
    return {url: documents[identifier] for url, identifier in re.findall(
        r"^Legal document: (https://\S+) -> (L\d+)$",
        content, flags=re.MULTILINE,
    ) if identifier in documents}


def cargo_components(target: str, fetch_missing: bool) -> list[dict]:
    result = subprocess.run(
        ["cargo", "metadata", "--manifest-path", str(ROOT / "src-tauri/Cargo.toml"),
         "--format-version", "1", "--locked", "--offline", "--filter-platform", target],
        check=True, capture_output=True, encoding="utf-8",
    )
    metadata = json.loads(result.stdout)
    nodes = {node["id"]: node for node in metadata["resolve"]["nodes"]}
    pending = [metadata["resolve"]["root"]]
    included = set()
    while pending:
        package_id = pending.pop()
        if package_id in included:
            continue
        included.add(package_id)
        for dependency in nodes[package_id]["deps"]:
            if any(kind["kind"] != "dev" for kind in dependency["dep_kinds"]):
                pending.append(dependency["pkg"])
    components = []
    snapshots = previous_upstream_snapshots()
    for package in metadata["packages"]:
        if package["id"] not in included or package["id"] == metadata["resolve"]["root"]:
            continue
        directory = Path(package["manifest_path"]).parent
        component = {
            "name": package["name"], "version": package["version"],
            "ecosystem": "Cargo", "license": package.get("license") or "See upstream notices",
            "source": f'https://crates.io/crates/{package["name"]}/{package["version"]}',
            "archive": f'https://crates.io/api/v1/crates/{package["name"]}/{package["version"]}/download',
            "directory": directory,
            "files": legal_files(directory, package.get("license_file")),
            "extra_documents": [],
        }
        if not component["files"] and package["name"] in UPSTREAM_LICENSE_PATHS:
            vcs = json.loads((directory / ".cargo_vcs_info.json").read_text(encoding="utf-8"))
            repository = package["repository"].removeprefix("https://github.com/")
            revision = vcs["git"]["sha1"]
            if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository) or not re.fullmatch(r"[0-9a-f]{40}", revision):
                raise RuntimeError(f"Unexpected upstream repository identity: {package['name']}")
            for filename in UPSTREAM_LICENSE_PATHS[package["name"]]:
                url = f"https://raw.githubusercontent.com/{repository}/{revision}/{filename}"
                text = snapshots.get(url)
                if text is None:
                    if not fetch_missing:
                        raise RuntimeError(f"Missing pinned notice snapshot; rerun with --fetch-missing: {url}")
                    request = urllib.request.Request(url, headers={"User-Agent": "ByShoot-license-notices"})
                    with urllib.request.urlopen(request, timeout=30) as response:
                        text = response.read().decode("utf-8-sig")
                    snapshots[url] = text
                component["extra_documents"].append((url, text))
        elif not component["files"] and package["name"] == "selectors" and package["license"] == "MPL-2.0":
            # Stylo supplies MPL headers, but no complete MPL text in its repo.
            # Preserve that actual header and share the identical standard MPL
            # text included by the locked cssparser package.
            source = (directory / "lib.rs").read_text(encoding="utf-8")
            header = source.split("*/", 1)[0] + "*/"
            if "Mozilla Public" not in header or "2.0" not in header:
                raise RuntimeError("selectors license header needs review")
            mpl_package = next(p for p in metadata["packages"] if p["name"] == "cssparser" and p["license"] == "MPL-2.0")
            mpl = Path(mpl_package["manifest_path"]).parent / "LICENSE"
            component["extra_documents"] = [
                ("lib.rs (upstream MPL-2.0 header)", header),
                (f'MPL-2.0 full text from cssparser {mpl_package["version"]}/LICENSE', mpl.read_text(encoding="utf-8")),
            ]
        components.append(component)
    return components


def npm_components() -> list[dict]:
    project = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    pending = [(name, ROOT) for name in project.get("dependencies", {})]
    included = set()
    components = []
    while pending:
        name, requesting_directory = pending.pop()
        directory = None
        for ancestor in [requesting_directory, *requesting_directory.parents]:
            candidate = ancestor / "node_modules" / name
            if (candidate / "package.json").is_file():
                directory = candidate.resolve()
                break
        if directory is None:
            raise RuntimeError(f"Install the locked npm dependencies first: {name}")
        if directory in included:
            continue
        included.add(directory)
        package = json.loads((directory / "package.json").read_text(encoding="utf-8"))
        components.append({
            "name": package["name"], "version": package["version"], "ecosystem": "npm",
            "license": package.get("license") or "See upstream notices",
            "source": f'https://www.npmjs.com/package/{package["name"]}/v/{package["version"]}',
            "directory": directory, "files": legal_files(directory),
        })
        pending.extend((dependency, directory) for dependency in package.get("dependencies", {}))
    return components


def webview_loader_component(components: list[dict], fetch_missing: bool) -> list[dict]:
    bindings = next((component for component in components if component["name"] == "webview2-com-sys"), None)
    if bindings is None:
        return []
    # The pinned webview2-rs update-bindings/src/main.rs identifies this SDK;
    # the shipped WebView2Loader.dll reports the same product/file version.
    versions = {"0.39.1": "1.0.3800.47"}
    if bindings["version"] not in versions:
        raise RuntimeError("Review the bundled WebView2 native loader's SDK version and notices")
    version = versions[bindings["version"]]
    archive = f"https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/{version}/microsoft.web.webview2.{version}.nupkg"
    snapshots = previous_upstream_snapshots()
    filenames = ["LICENSE.txt", "NOTICE.txt"]
    if any(f"{archive}#{filename}" not in snapshots for filename in filenames):
        if not fetch_missing:
            raise RuntimeError("Missing WebView2 loader license snapshots; rerun with --fetch-missing")
        request = urllib.request.Request(archive, headers={"User-Agent": "ByShoot-license-notices"})
        with urllib.request.urlopen(request, timeout=45) as response:
            package = zipfile.ZipFile(io.BytesIO(response.read()))
        for filename in filenames:
            snapshots[f"{archive}#{filename}"] = package.read(filename).decode("utf-8-sig")
    return [{
        "name": "Microsoft.Web.WebView2 (native loader)", "version": version,
        "ecosystem": "NuGet", "license": "See SDK LICENSE.txt and NOTICE.txt below",
        "source": f"https://www.nuget.org/packages/Microsoft.Web.WebView2/{version}",
        "archive": archive, "files": [],
        "extra_documents": [(f"{archive}#{filename}", snapshots[f"{archive}#{filename}"]) for filename in filenames],
    }]


def generate(target: str, fetch_missing: bool = False) -> tuple[str, int, int]:
    rust_components = cargo_components(target, fetch_missing)
    components = sorted(rust_components + npm_components() + webview_loader_component(rust_components, fetch_missing),
                        key=lambda component: (component["ecosystem"], component["name"], component["version"]))
    missing = [f'{c["ecosystem"]}: {c["name"]} {c["version"]}' for c in components if not c["files"] and not c.get("extra_documents")]
    if missing:
        raise RuntimeError("Missing upstream legal texts; notices were not written:\n" + "\n".join(missing))
    texts = {}
    for component in components:
        component["documents"] = []
        documents = [(path.relative_to(component["directory"]).as_posix(), path.read_text(encoding="utf-8-sig")) for path in component["files"]]
        documents.extend(component.get("extra_documents", []))
        for relative, text in documents:
            text = text.replace("\r\n", "\n").strip()
            if not text:
                continue
            digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
            if digest not in texts:
                texts[digest] = {"id": f"L{len(texts) + 1:03d}", "text": text, "uses": []}
            label = f'{component["ecosystem"]}: {component["name"]} {component["version"]} / {relative}'
            texts[digest]["uses"].append(label)
            component["documents"].append((relative, texts[digest]["id"]))
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    lines = [
        f"ByShoot {version} - Third-Party Notices", "=" * 72, "",
        f"Scope: locked Cargo dependency graph for {target}, including runtime",
        "and build dependencies, plus installed production npm dependencies.",
        "The Microsoft native WebView2 loader distributed through the Rust bindings",
        "is included separately with its corresponding SDK LICENSE and NOTICE texts.",
        "Development-only npm packages and Cargo dev-only dependency edges are excluded.",
        "Build dependencies are included conservatively; listing does not imply every",
        "component is linked into the executable. This inventory does not cover separate",
        "platform release binaries. Regenerate with --target for another target.", "",
        "Upstream license expressions and supplied legal texts are reproduced below.",
        "Alternative license texts are retained as supplied; identical legal texts are",
        "printed once and referenced by identifier. Copyright notices remain in those",
        "texts. ByShoot's own MIT license is in LICENSE.", "",
        "The listed Cargo source archives identify the corresponding upstream package",
        "sources, including MPL-2.0 components. No third-party package source changes",
        "are made by this project. FFmpeg is an optional external executable and is",
        "not bundled or covered by this notice inventory. The operating system's",
        "WebView runtime is also installed and licensed separately.", "",
        "Generated by scripts/third-party-notices.py from local installed packages.",
        "Where a tarball omits legal files, upstream repository notices are pinned to",
        "the exact revision from that tarball's VCS metadata. Their source URLs are",
        "included below, and these embedded snapshots support offline regeneration.", "",
        "COMPONENT INVENTORY", "=" * 72, "",
    ]
    for component in components:
        lines.extend([
            f'{component["ecosystem"]}: {component["name"]} {component["version"]}',
            f'License expression: {component["license"]}',
            f'Package: {component["source"]}',
        ])
        if "archive" in component:
            lines.append(f'Source archive: {component["archive"]}')
        for filename, document_id in component["documents"]:
            lines.append(f"Legal document: {filename} -> {document_id}")
        lines.append("")
    lines.extend(["UPSTREAM LEGAL TEXTS", "=" * 72, ""])
    for document in texts.values():
        lines.extend([document["id"], "-" * 72, "Applies to:"])
        lines.extend("  " + usage for usage in document["uses"])
        lines.extend(["", f'----- BEGIN LEGAL TEXT {document["id"]} -----',
                      document["text"], f'----- END LEGAL TEXT {document["id"]} -----',
                      "", "=" * 72, ""])
    return "\n".join(lines), len(components), len(texts)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", default="x86_64-pc-windows-msvc")
    parser.add_argument("--check", action="store_true", help="Check without changing the notice file")
    parser.add_argument("--fetch-missing", action="store_true", help="Read missing license files from exact upstream GitHub revisions")
    args = parser.parse_args()
    try:
        content, components, documents = generate(args.target, args.fetch_missing)
        output = ROOT / "THIRD_PARTY_NOTICES.txt"
        if args.check:
            if not output.is_file() or output.read_text(encoding="utf-8") != content:
                raise RuntimeError("THIRD_PARTY_NOTICES.txt needs regeneration")
        else:
            output.write_text(content, encoding="utf-8", newline="\n")
        print(f"{'Checked' if args.check else 'Wrote'} notices: {components} components, {documents} distinct legal texts")
        return 0
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        if isinstance(error, subprocess.CalledProcessError) and error.stderr:
            print(error.stderr, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
