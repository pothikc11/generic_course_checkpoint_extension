# Course Checkpoints

Course Checkpoints is a Chrome Extension that lets a learner save named timestamps while watching a Programming Hero lesson. A checkpoint can be created from the extension popup, or instantly with `Ctrl + Shift + Q`. Saved checkpoints are grouped by lesson URL, can be edited or deleted, and can be opened in a separate floating popup window.

This guide explains the project from first principles. It is written so that a developer can recreate the extension, understand why each file exists, change the target website, and debug the extension without needing another tutorial.

## What the extension does

The extension provides four user actions:

1. Detect the video playing on `web.programming-hero.com`.
2. Add a checkpoint at the current video position.
3. Jump the video back to a saved checkpoint, edit it, or delete it.
4. Keep the checkpoint list open in a separate popup while the lesson remains visible in the main browser tab.

The keyboard command creates a checkpoint named automatically, for example `Checkpoint 03:42`. The form in the popup lets the user choose a name.

## Important limitation

The floating view is a separate Chrome popup window and opens focused. A normal Chrome extension cannot force a window to remain above every other operating-system window because the Chrome Extensions Windows API does not expose a writable `alwaysOnTop` setting. The extension therefore provides the closest supported behavior: a dedicated, focused popup that the user can move beside the video.

## Technology choices

- Chrome Extension Manifest V3
- TypeScript
- The Chrome Extensions API
- Plain HTML and CSS for the UI
- `chrome.storage.local` for persistence
- No framework, bundler, or runtime dependency

TypeScript is compiled directly into JavaScript with `tsc`. The browser loads the generated files in `dist/`.

## Project structure

```text
course-checkpoints/
├── manifest.json          # Chrome extension metadata and permissions
├── package.json           # Build command and development dependencies
├── package-lock.json      # Locked npm dependency versions
├── tsconfig.json          # TypeScript compiler configuration
├── .gitignore             # Excludes node_modules and generated dist files
├── src/
│   ├── background.ts      # Service worker: shortcut and floating window
│   ├── content.ts         # Runs inside the lesson page and controls video
│   ├── popup.html          # Popup and floating-window markup
│   ├── popup.ts           # Popup behavior, storage, rendering, editing
│   └── styles.css         # Popup/floating-window appearance
└── dist/                  # Generated JavaScript; created by npm run build
    ├── background.js
    ├── content.js
    └── popup.js
```

`dist/` is generated output and is ignored by Git. It must exist locally before loading the extension in Chrome, so run the build after cloning or changing TypeScript.

## How the pieces communicate

The extension uses three execution contexts. They cannot directly access each other's variables, so communication happens through Chrome APIs.

```text
Keyboard shortcut
       │
       ▼
background.ts ── tabs.sendMessage ──► content.ts ──► <video>
       │                                      │
       │                                      └── currentTime
       ▼
chrome.storage.local ── storage.onChanged ──► popup.ts

popup.ts ── tabs.sendMessage ──► content.ts ──► seek video
popup.ts ── runtime.sendMessage ──► background.ts ──► windows.create
```

### 1. Content script

`content.ts` is injected into matching Programming Hero pages. It is the only part that can directly query the page's DOM and video element. The current selector is:

```ts
const VIDEO_SELECTOR = "video.shaka-video";
```

It handles two messages:

```text
GET_CURRENT_TIME
  response: { success: true, currentTime: number | null }

SEEK_TO
  request: { type: "SEEK_TO", timestamp: number }
  response: { success: boolean }
```

If the website changes its video implementation or class name, this selector is the first thing to inspect. A quick test in DevTools is:

```js
document.querySelector("video.shaka-video")
```

If it returns `null`, update the selector and rebuild.

### 2. Background service worker

`background.ts` runs independently of the popup. It handles:

- The `add-checkpoint` keyboard command.
- Reading the active lesson tab.
- Asking the content script for the current time.
- Creating and sorting a checkpoint.
- Writing the updated list into local storage.
- Creating the floating popup window.

The service worker does not touch page DOM because service workers have no page DOM. It always asks `content.ts` to interact with the video.

### 3. Popup page

`popup.html` and `popup.ts` are used both for the normal extension action popup and for the floating window. The URL tells the page which mode it is in:

```text
src/popup.html
src/popup.html?floating=true&lesson=web.programming-hero.com%2Fsome%2Flesson
```

The popup obtains its lesson key from the active tab. The floating window obtains it from the `lesson` query parameter. The parameter is decoded before storage access; otherwise the encoded key would not match the key used by the shortcut handler.

## Storage design

The extension uses `chrome.storage.local`. Each lesson has one storage key:

```text
web.programming-hero.com/course/lesson-name
```

The value is an array of checkpoints:

```json
[
  {
    "id": "3e8d4b1e-7f87-4dd7-a1f9-8e3a3f4f9c7a",
    "timestamp": 222.4,
    "name": "Variables are introduced"
  },
  {
    "id": "another-uuid",
    "timestamp": 405,
    "name": "Checkpoint 06:45"
  }
]
```

The TypeScript shape is:

```ts
interface Checkpoint {
  id: string;
  timestamp: number;
  name: string;
}
```

The key intentionally includes the hostname and pathname but not the query string. This means page parameters do not accidentally create separate lists for the same lesson.

### Why storage is the synchronization mechanism

The keyboard shortcut can run while the floating window is already open. After the background worker writes the new array, the popup receives `chrome.storage.onChanged`. The listener checks that:

1. The changed area is `local`.
2. A lesson key has been initialized.
3. The changed key is the current lesson key.

It then renders the new array immediately. This is why a shortcut-created checkpoint appears without closing or refreshing the floating window.

## Recreating the project from an empty folder

### Prerequisites

Install:

- Google Chrome or another Chromium browser with Manifest V3 support.
- Node.js, preferably a current LTS release.
- npm, included with Node.js.

Check the tools:

```bash
node --version
npm --version
```

Create and enter a folder:

```bash
mkdir course-checkpoints
cd course-checkpoints
npm init -y
```

Install TypeScript and Chrome API types:

```bash
npm install --save-dev typescript @types/chrome
```

### Create `package.json`

The important parts are the private package setting and the build script:

```json
{
  "name": "course-checkpoints",
  "version": "1.0.0",
  "description": "Timestamp checkpoints for online programming courses",
  "private": true,
  "scripts": {
    "build": "tsc"
  },
  "devDependencies": {
    "@types/chrome": "^0.1.1",
    "typescript": "^5.9.3"
  }
}
```

The exact dependency versions may advance. The lockfile records the versions installed in one working copy.

### Create `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

`outDir` causes TypeScript to place compiled files in `dist/`. `strict` catches incorrect Chrome API usage and unsafe values early. `skipLibCheck` avoids type-checking every declaration file in the dependency tree.

### Create `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "Course Checkpoints",
  "version": "1.0.0",
  "description": "Create timestamp checkpoints while watching programming courses.",
  "permissions": [
    "storage"
  ],
  "host_permissions": [
    "https://web.programming-hero.com/*"
  ],
  "content_scripts": [
    {
      "matches": [
        "https://web.programming-hero.com/*"
      ],
      "js": [
        "dist/content.js"
      ],
      "run_at": "document_idle"
    }
  ],
  "background": {
    "service_worker": "dist/background.js"
  },
  "commands": {
    "add-checkpoint": {
      "suggested_key": {
        "default": "Ctrl+Shift+Q"
      },
      "description": "Add checkpoint at current video time"
    }
  },
  "action": {
    "default_title": "Course Checkpoints",
    "default_popup": "src/popup.html"
  }
}
```

#### Manifest fields explained

- `manifest_version: 3` selects Chrome's current extension architecture.
- `storage` authorizes `chrome.storage.local`.
- `host_permissions` allows the extension to operate on the Programming Hero origin.
- `content_scripts` injects the generated content script into matching pages.
- `background.service_worker` identifies the generated background worker.
- `commands` registers the global extension shortcut.
- `action.default_popup` opens the popup when the toolbar icon is clicked.

Do not put TypeScript files in the manifest. Chrome cannot execute them directly; it must load the generated JavaScript in `dist/`.

## Implementing the content script

Create `src/content.ts`:

```ts
const VIDEO_SELECTOR = "video.shaka-video";

function getVideo(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>(VIDEO_SELECTOR);
}

function getCurrentTime(): number | null {
  return getVideo()?.currentTime ?? null;
}

function seekVideoTo(timestamp: number): boolean {
  const video = getVideo();

  if (!video) {
    return false;
  }

  video.currentTime = timestamp;
  return true;
}

chrome.runtime.onMessage.addListener(
  (
    message: { type: string; timestamp?: number },
    _sender,
    sendResponse
  ) => {
    if (message.type === "GET_CURRENT_TIME") {
      sendResponse({
        success: true,
        currentTime: getCurrentTime()
      });
      return true;
    }

    if (
      message.type === "SEEK_TO" &&
      typeof message.timestamp === "number"
    ) {
      sendResponse({ success: seekVideoTo(message.timestamp) });
      return true;
    }

    return false;
  }
);
```

The `sendResponse` callback is necessary because `tabs.sendMessage` expects a response. Returning `true` keeps the response channel available if the handler later becomes asynchronous.

## Implementing the background service worker

The shortcut handler follows this sequence:

1. Confirm the command is `add-checkpoint`.
2. Find the active tab in the current browser window.
3. Confirm it belongs to the supported host.
4. Ask the content script for the current video time.
5. Read the current lesson array.
6. Add a UUID-based checkpoint.
7. Sort by timestamp.
8. Save the array.

The core implementation is:

```ts
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "add-checkpoint") {
    return;
  }

  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  const tab = tabs[0];

  if (!tab?.id || !tab.url) {
    return;
  }

  try {
    const url = new URL(tab.url);

    if (url.hostname !== "web.programming-hero.com") {
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_CURRENT_TIME"
    });

    if (
      !response?.success ||
      typeof response.currentTime !== "number"
    ) {
      return;
    }

    const lessonKey = `${url.hostname}${url.pathname}`;
    const result = await chrome.storage.local.get(lessonKey);
    const checkpoints = Array.isArray(result[lessonKey])
      ? result[lessonKey]
      : [];

    checkpoints.push({
      id: crypto.randomUUID(),
      timestamp: response.currentTime,
      name: `Checkpoint ${formatTimestamp(response.currentTime)}`
    });

    checkpoints.sort((a, b) => a.timestamp - b.timestamp);

    await chrome.storage.local.set({
      [lessonKey]: checkpoints
    });
  } catch (error) {
    console.error("Failed to create checkpoint:", error);
  }
});
```

`crypto.randomUUID()` makes deletion and editing reliable even when two checkpoints have the same timestamp. Sorting after every mutation keeps the UI predictable.

The background service worker also opens the floating page:

```ts
chrome.runtime.onMessage.addListener((message) => {
  if (
    message.type !== "OPEN_FLOATING_WINDOW" ||
    typeof message.lessonKey !== "string"
  ) {
    return;
  }

  const encodedLessonKey = encodeURIComponent(message.lessonKey);
  const url = chrome.runtime.getURL(
    `src/popup.html?floating=true&lesson=${encodedLessonKey}`
  );

  void chrome.windows.create({
    url,
    type: "popup",
    width: 500,
    height: 620,
    focused: true
  });
});
```

The lesson key is encoded because it is being placed inside a query string. The popup decodes it before using it as a storage key.

## Implementing the popup logic

The popup needs a shared lesson-key algorithm. For a normal popup, derive the key from the active tab:

```ts
const url = new URL(tab.url);
return `${url.hostname}${url.pathname}`;
```

For a floating popup, use the query parameter:

```ts
const encoded = new URLSearchParams(window.location.search)
  .get("lesson");

return encoded ? decodeURIComponent(encoded) : null;
```

The basic storage functions are:

```ts
async function loadCheckpoints(): Promise<Checkpoint[]> {
  if (!currentLessonKey) {
    return [];
  }

  const result = await chrome.storage.local.get(currentLessonKey);
  return Array.isArray(result[currentLessonKey])
    ? result[currentLessonKey] as Checkpoint[]
    : [];
}

async function saveCheckpoints(
  checkpoints: Checkpoint[]
): Promise<void> {
  if (!currentLessonKey) {
    return;
  }

  await chrome.storage.local.set({
    [currentLessonKey]: checkpoints
  });
}
```

To add a named checkpoint from the form, get the current time through the content script, append the new object, sort, save, and render:

```ts
const timestamp = await getCurrentVideoTime();

if (timestamp !== null) {
  const checkpoints = await loadCheckpoints();
  checkpoints.push({
    id: crypto.randomUUID(),
    timestamp,
    name
  });
  checkpoints.sort((a, b) => a.timestamp - b.timestamp);
  await saveCheckpoints(checkpoints);
  renderCheckpoints(checkpoints);
}
```

### Rendering safely

Checkpoint names are inserted using `textContent`, not `innerHTML`:

```ts
name.textContent = checkpoint.name;
```

This prevents a saved name from being interpreted as HTML. The list is rebuilt on each render, which keeps the implementation simple and ensures the count, empty state, ordering, and button handlers all represent the same array.

### Editing

Each row has an `Edit` button. Clicking it replaces the row with a form containing:

- A required checkpoint name field.
- A time field accepting `mm:ss` or `hh:mm:ss`.
- Save and Cancel buttons.

The time is parsed into seconds:

```ts
const parts = timeText.split(":").map(Number);

const timestamp = parts.length === 2
  ? parts[0] * 60 + parts[1]
  : parts[0] * 3600 + parts[1] * 60 + parts[2];
```

After editing, map over the array, replace only the matching UUID, sort again, save, and render.

### Deleting

Delete by UUID rather than by array index:

```ts
const updated = checkpoints.filter(
  (item) => item.id !== checkpoint.id
);

await saveCheckpoints(updated);
renderCheckpoints(updated);
```

This remains correct after sorting or editing timestamps.

### Immediate synchronization

Add this listener after the render function exists:

```ts
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (
    areaName !== "local" ||
    !currentLessonKey ||
    !changes[currentLessonKey]
  ) {
    return;
  }

  const nextValue = changes[currentLessonKey].newValue;
  renderCheckpoints(
    Array.isArray(nextValue)
      ? nextValue as Checkpoint[]
      : []
  );
});
```

This listener is the key enhancement for the floating-window experience. It also keeps multiple open popup views synchronized.

## Building the extension

Install dependencies:

```bash
npm install
```

Compile TypeScript:

```bash
npm run build
```

A successful build creates:

```text
dist/background.js
dist/content.js
dist/popup.js
```

If TypeScript reports an error, fix the source error and run the build again. Do not manually edit generated files in `dist/`; the next build overwrites them.

## Loading in Chrome

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the project root directory, the folder containing `manifest.json`.
6. Open a matching Programming Hero lesson.
7. Click the extension icon to open the popup.

After changing TypeScript, run `npm run build` and click **Reload** on the extension card. A content script may require a full page refresh after reload so that the new script is injected into the tab.

The shortcut can be checked or changed at `chrome://extensions/shortcuts`. Chrome may display the shortcut using `Ctrl` on Windows/Linux and `Command` on macOS.

## Normal usage

1. Open a Programming Hero lesson containing a video.
2. Open the extension popup.
3. Type a description such as `Array map example`.
4. Click **Add**.
5. Click a checkpoint row to seek the video.
6. Click **Edit** to change its name or timestamp.
7. Click the delete control to remove it.
8. Click **Open floating window** to keep the list visible beside the lesson.
9. While watching, press `Ctrl + Shift + Q` to create an automatically named checkpoint.

The floating list should update as soon as the shortcut completes its storage write.

## Debugging guide

### The popup says “Video unavailable”

Check these in order:

1. Confirm the lesson URL begins with `https://web.programming-hero.com/`.
2. Open DevTools on the lesson page and run:

   ```js
   document.querySelector("video.shaka-video")
   ```

3. Confirm the extension is enabled and the content script appears under the page's Sources.
4. Reload the extension and then refresh the lesson page.
5. If the selector changed, update `VIDEO_SELECTOR` in `src/content.ts`.

### The shortcut does nothing

Open `chrome://extensions/shortcuts` and verify the command has a key assigned. Then inspect the service worker:

1. Open `chrome://extensions`.
2. Find Course Checkpoints.
3. Click the **service worker** link.
4. Look for errors after pressing the shortcut.

The shortcut only works when the active tab is on the configured host and the content script can find a video.

### The floating window is empty

The most common causes are:

- The extension was loaded before the latest build.
- The floating page was opened from a different lesson.
- The lesson key was changed in one place but not the other.
- The URL parameter was encoded but not decoded.

Inspect local storage in the extension's DevTools and compare the key with:

```text
hostname + pathname
```

For example:

```text
web.programming-hero.com/course/lesson-name
```

### New shortcut checkpoints do not appear immediately

Confirm that the following are true:

- `background.ts` writes to `chrome.storage.local`.
- `popup.ts` has a `chrome.storage.onChanged` listener.
- The floating page and background worker use the exact same decoded lesson key.
- The extension was rebuilt and reloaded after the listener was added.

### Editing a timestamp fails

Use one of these forms:

```text
03:42
01:03:42
```

Seconds must be from `00` through `59`. A two-part value is interpreted as minutes and seconds; a three-part value is interpreted as hours, minutes, and seconds.

### How to inspect storage

Open the popup, right-click it, and choose **Inspect**. In the DevTools console, inspect the stored records:

```js
chrome.storage.local.get(null).then(console.log)
```

The `null` argument requests all local-storage keys. In a production extension, avoid exposing sensitive information this way; this project stores only lesson timestamps and names.

## Changing the target website

To adapt the extension to another course platform, update every relevant location consistently:

1. `PROGRAMMING_HERO_HOST` in `src/popup.ts`.
2. The hostname check in `src/background.ts`.
3. The URL pattern in `manifest.json` under `host_permissions`.
4. The URL pattern in `manifest.json` under `content_scripts.matches`.
5. `VIDEO_SELECTOR` in `src/content.ts`.
6. The lesson-key strategy if the platform identifies lessons differently.

Then run:

```bash
npm run build
```

If the site uses a normal `<video>` element, the selector may simply become `video`. If it uses an iframe, shadow DOM, or a different player lifecycle, the content script may need additional logic.

## Design decisions and trade-offs

### Why use a service worker?

Manifest V3 requires background logic to run in a service worker. It is event-driven and may be stopped when idle, so persistent state must live in Chrome storage rather than in service-worker variables.

### Why use local storage?

`chrome.storage.local` is available to the popup, service worker, and extension pages. It is asynchronous and emits change events, making it appropriate for synchronizing the shortcut and floating window.

### Why use page URL as the lesson key?

It requires no server, database, account, or content extraction. The same lesson URL reliably maps to the same local checkpoint list. The trade-off is that a website URL redesign can make old records appear under a different key.

### Why use a separate popup window?

The browser action popup closes when it loses focus, which is inconvenient while watching a video. A separate popup remains open after focus moves to the lesson tab. It still cannot be made OS-level always-on-top by a standard extension.

### Why rebuild the DOM for every render?

The checkpoint list is small, and rebuilding it avoids complicated state synchronization between individual rows. Every render reconstructs the correct order, count, empty state, and event handlers from one array.

## Possible future improvements

- Add a user-selectable shortcut name instead of the automatic timestamp name.
- Add import/export to JSON.
- Add a search box for lessons with many checkpoints.
- Show a non-blocking error message when the video is unavailable.
- Track the floating window ID and reuse an existing window instead of opening duplicates.
- Add automated tests for time parsing, sorting, and lesson-key generation.
- Use a more robust video-discovery strategy if the target website changes its player markup.
- Add an optional browser Picture-in-Picture workflow if the product needs video always-on-top behavior; that is a video feature, not a way to pin the checkpoint popup itself.

## Development checklist

Before considering a change complete:

```bash
npm run build
```

Then manually verify:

- The extension reloads without a manifest error.
- The popup detects the video.
- A named checkpoint is added.
- The keyboard shortcut adds a checkpoint.
- The floating window shows existing checkpoints.
- A shortcut update appears in the floating window immediately.
- Clicking a row seeks the video.
- Editing a name works.
- Editing `mm:ss` and `hh:mm:ss` works.
- Deleting a checkpoint updates the count and empty state.
- A page reload preserves the checkpoints.

## License and privacy note

This project has no server component. Checkpoints are stored locally in the browser through `chrome.storage.local`. The extension is scoped to the configured Programming Hero host and does not need to transmit checkpoint data anywhere.


#####THE PROMPT USED TO GENERATE THIS DOC#####
write a README.md file in the root directory with so detailed technical tutorial that anyone can create this exact project on fully their own next time without any help of others by just studying this tutorial