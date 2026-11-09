#!/usr/bin/env sh
# Development host only. Never run on a pupil's computer.
# Run from the repository root with Docker installed:
# docker run --rm -v "$PWD:/repo" -w /repo python:3.12-alpine sh scripts/build-nicegui.sh
set -eu
python - <<'PY'
import urllib.request
from pathlib import Path
commit = '026ad0642846a930a4f1f37dcf27d20156ca1812'
url = f'https://github.com/evnchn/nicegui-pyodide/archive/{commit}.zip'
target = Path('/tmp/nicegui-pyodide-source.zip')
urllib.request.urlretrieve(url, target)
PY
python -m pip install --disable-pip-version-check nicegui==3.18.0 /tmp/nicegui-pyodide-source.zip
nicegui-pyodide-build nicegui-dist --self-hosted
# Copy upstream attribution alongside the served assets.
python - <<'PY'
from pathlib import Path
import importlib.metadata as metadata
import zipfile
out = Path('nicegui-dist/licenses')
out.mkdir(exist_ok=True)
with zipfile.ZipFile('/tmp/nicegui-pyodide-source.zip') as source:
    for name in source.namelist():
        if name.endswith(('/LICENSE', '/NOTICE')) and name.count('/') == 1:
            (out / ('nicegui-pyodide-' + name.rsplit('/', 1)[1])).write_bytes(source.read(name))
dist = metadata.distribution('nicegui')
for file in dist.files:
    if 'licenses' in file.parts:
        (out / ('nicegui-' + file.name)).write_bytes(dist.locate_file(file).read_bytes())
PY
# After the container exits: node scripts/prepare-nicegui.mjs
