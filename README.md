# Web File Explorer

Static web file explorer with configurable icons and generated file indexing.

## Project Layout

```text
.
|-- Index.html
|-- config.sarr
|-- vercel.json
|-- Files/
|-- Assets/
|   |-- CSS/style.css
|   `-- JS/
|       |-- app.js
|       `-- files-data.js
`-- Scripts/
    |-- build.ps1
    |-- build.sh
    |-- generate-file-index.ps1
    |-- generate-file-index.sh
    `-- publish-to-github.sh
```

## Quick Start

1. Add files/folders inside `Files/`.
2. Build the index.
3. Open `Index.html`.

### Build Commands

Windows (PowerShell):

```powershell
& "Scripts/build.ps1"
```

macOS/Linux:

```bash
./Scripts/build.sh
```

## Index Generation

Regenerate only `Assets/JS/files-data.js`:

Windows (PowerShell):

```powershell
& "Scripts/generate-file-index.ps1"
```

macOS/Linux:

```bash
./Scripts/generate-file-index.sh
```

### Watch Mode (Auto Regen While Editing)

Windows (PowerShell):

```powershell
& "Scripts/generate-file-index.ps1" -Watch
```

macOS/Linux:

```bash
./Scripts/generate-file-index.sh --watch
```

Notes:
- `.sh` watch mode uses `inotifywait` (Linux) or `fswatch` (macOS/Linux) when available.
- If neither is installed, it falls back to polling every 2 seconds.

## Icon Configuration (`config.sarr`)

Icons are loaded from `config.sarr` using this block format:

```text
(
.ext
Icon=https://example.com/icon.png
)
```

Special keys:
- `folder`
- `other/any`

## Vercel Deploy

`vercel.json` handles:
- Root rewrite: `/` -> `Index.html`
- Build step on each deploy:

```bash
bash Scripts/build.sh
```

If Vercel project settings override the build command, set it to:

```bash
bash Scripts/build.sh
```

## Publish to GitHub (Codespaces)

Default:

```bash
./Scripts/publish-to-github.sh
```

Custom commit message:

```bash
./Scripts/publish-to-github.sh "feat: update files"
```

First-time remote setup:

```bash
./Scripts/publish-to-github.sh "initial publish" "https://github.com/<user>/<repo>.git"
```

If needed, make scripts executable once:

```bash
chmod +x Scripts/*.sh
```
