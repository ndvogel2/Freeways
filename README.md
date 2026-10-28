# Slipstream — Road Studio

An original, independent road-building traffic playground. Create a small traffic puzzle, decide which access points need to connect, set the number of cars per minute, then draw roads and test the result. Keep a collection of custom levels instead of progressing through a large campaign map.

This project is inspired by road and traffic puzzles. It is not affiliated with Freeways, its developer, or Steam, and does not use their code or assets. Roads have an intentionally narrow width of **10 world units**. That width has not been measured against the Steam game, so this is not a verified reproduction of half its road width.

## Play without installing anything

Download **Slipstream.html**, save it to your computer, and double-click it to open the game in a current desktop browser. Everything is bundled into that one file; no Node.js, server, account, or internet connection is required. Keep the file in the same location for consistent browser saves and export important levels as JSON backups.

Direct folder saving depends on browser support and permissions. If it is unavailable, export individual levels or the collection as JSON. Browser restrictions on local-file storage may also vary.

`npm run build` creates this portable file at `dist/Slipstream.html` alongside the normal website build.

## Develop locally

Use Node.js 22.12 or newer; development was tested with Node.js 24.19.0 and npm 11.9.0.

```sh
cd /workspace/Freeways
npm ci
npm run dev
```

Open the address printed by Vite in your browser. The development server listens on all interfaces so it can also run in a cloud workspace. There is no backend, account, database, or paid service to configure.

```sh
npm test          # Network routing, simulation, and level storage tests
npm run build    # Type check and produce dist/
npm run preview  # Serve the production build locally
```

The production output includes a static website in `dist/` for HTTP or HTTPS hosting, plus `dist/Slipstream.html` for direct double-click play. The ordinary `dist/index.html` still requires a web server because its assets are separate.

## Host the game as a website

The game is a static site with relative asset URLs, so the contents of `dist/` can be served from a domain root or a project subdirectory without changing game code. It needs no backend or hosting secrets.

The repository includes `.github/workflows/pages.yml` for GitHub Pages. After the source is pushed to `main`, enable **Settings → Pages → Build and deployment → Source → GitHub Actions** in the GitHub repository. A push to `main` or a manual run of **Publish Slipstream site** then installs locked dependencies, runs the tests, builds the game, and publishes `dist/`. The successful deployment reports the actual site URL in the Actions run and repository Pages settings. Do not treat the site as live until that deployment succeeds.

GitHub Pages serves the game publicly; browser level saves remain on the player's device. Export important levels before changing site origins. The hosted site also provides `Slipstream.html` as a portable game download.

## Build and play

1. Choose **New level**, name it, and use **Access** to place destinations. Select an access point to rename it or change its color.
2. Add traffic routes in the sidebar. Choose an origin, a destination, and a volume from 1 to 180 cars per minute. Opposite-direction traffic requires its own demand.
3. Drag with **Road** from the start toward the end. Roads are one-way, following your drawing direction. Their ends snap to nearby access points and roads. Ground crossings connect; bridge interiors cross without connecting. Bridge ends can connect to the network.
4. Choose **Play it** to lock the traffic plan, then run traffic. You can still draw or erase roads in play mode. Changing the road network resets the current simulation.
5. Watch connected routes, completed trips, active cars, and waiting traffic. There is no campaign, timer, or fixed victory screen; experiment until the network works the way you want.

Saved levels include both their traffic plan and current roads. In My levels, Play starts the traffic plan with a fresh, road-free map; Edit restores the saved road layout. Duplicate a saved level to experiment without changing the original. The initial Four corners level is an unsolved example.

| Control | Action |
| --- | --- |
| `1` / `2` / `3` | Road / Bridge / Erase |
| `4` / `5` | Add access point / Select access point |
| `Space` | Run or pause traffic |
| Hold `Space` and drag, or middle-drag | Pan the map |
| Scroll, or map `+` / `−` buttons | Zoom |
| Fit-map button | Restore the map view |
| `Ctrl` / `Cmd` + `Z` | Undo the last edit |
| `Ctrl` / `Cmd` + `S` | Save the current level to the library |
| `?` | Show help |

## Save custom levels

The workspace autosaves in this browser. **Save level** adds or updates the named level in **My levels**. The library supports up to 250 levels and uses local browser storage, which belongs to this site and browser profile. Clearing site data, using a private window, or switching origins can remove or hide these local saves. Export important work.

In **My levels**:

- **Export level** downloads one `.slipstream.json` file.
- **Export collection** downloads one JSON file containing the entire library.
- **Import JSON** reads individual level files or exported collections.
- **Open folder** imports level JSON files from a selected folder.
- **Save to folder** writes a separate JSON file for every saved library level. Save the current workspace to the library first.

Direct folder writing uses the browser File System Access API, available in supported Chromium browsers on a secure origin such as HTTPS or localhost. The browser asks you to select and allow access to a folder. The folder selection lasts for the current session. Where direct folder access is unavailable, collection downloads and file/folder imports provide a fallback; the app cannot silently choose or write to an arbitrary filesystem folder. Files remain local to your machine; there is no upload service or cloud synchronization.

## Scope and limitations

The simulation uses directed shortest routes, queued departures, car spacing, and crossing conflicts to make road choices visible. It is a small traffic puzzle simulation, not a civil engineering model or a recreation of Freeways' exact mechanics or scoring. Network flow is a heuristic based on reachable traffic demand and waiting traffic. Active vehicles and pending queues are bounded to keep the app responsive.

The terrain and river are decorative: drawing across water does not impose extra cost or require a bridge. Bridges control which crossings connect. There are no traffic lights, lane-width settings, procedural campaign, Steam integration, or packaged desktop executable. The drawing interface is designed primarily for a desktop pointer and keyboard.

Level files use version 1 of the JSON schema defined in `src/types.ts` and checked by `src/storage.ts`. Imported levels are validated for coordinates, IDs, colors, traffic rates, and size limits. Keep exported JSON files as portable backups.
