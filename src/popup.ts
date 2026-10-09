interface Checkpoint {
  id: string;
  timestamp: number;
  name: string;
}

const PROGRAMMING_HERO_HOST = "web.programming-hero.com";

let currentLessonKey: string | null = null;
let floatingWindowMode = false;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "00:00";
  }

  const totalSeconds = Math.floor(seconds);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(
      minutes
    ).padStart(2, "0")}:${String(remainingSeconds).padStart(
      2,
      "0"
    )}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(
    remainingSeconds
  ).padStart(2, "0")}`;
}

function getLessonName(pathname: string): string {
  const lastPart = pathname.split("/").filter(Boolean).pop();

  if (!lastPart) {
    return "Programming Hero";
  }

  return decodeURIComponent(lastPart)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function getProgrammingHeroTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({
    url: "https://web.programming-hero.com/*"
  });

  if (tabs.length === 0) {
    return null;
  }

  const activeTab = tabs.find((tab) => tab.active);

  return activeTab ?? tabs[0];
}

async function getCurrentLessonKey(): Promise<string | null> {
  const floatingLessonKey = new URLSearchParams(
    window.location.search
  ).get("lesson");

  if (floatingLessonKey) {
    try {
      return decodeURIComponent(floatingLessonKey);
    } catch {
      return floatingLessonKey;
    }
  }

  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  const tab = tabs[0];

  if (!tab?.url) {
    return null;
  }

  try {
    const url = new URL(tab.url);

    if (url.hostname !== PROGRAMMING_HERO_HOST) {
      return null;
    }

    return `${url.hostname}${url.pathname}`;
  } catch {
    return null;
  }
}

async function loadCheckpoints(): Promise<Checkpoint[]> {
  if (!currentLessonKey) {
    return [];
  }

  const result = await chrome.storage.local.get(currentLessonKey);

  const checkpoints = result[currentLessonKey];

  if (!Array.isArray(checkpoints)) {
    return [];
  }

  return checkpoints as Checkpoint[];
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

async function getCurrentVideoTime(): Promise<number | null> {
  const tab = await getProgrammingHeroTab();

  if (!tab?.id) {
    return null;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_CURRENT_TIME"
    });

    if (
      response?.success &&
      typeof response.currentTime === "number"
    ) {
      return response.currentTime;
    }
  } catch {
    // Content script may not be ready.
  }

  return null;
}

async function seekTo(timestamp: number): Promise<void> {
  const tab = await getProgrammingHeroTab();

  if (!tab?.id) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "SEEK_TO",
      timestamp
    });
  } catch {
    // Ignore when the Programming Hero content script is unavailable.
  }
}

function renderCheckpoints(
  checkpoints: Checkpoint[]
): void {
  const list = document.getElementById("checkpoint-list");
  const emptyState = document.getElementById("empty-state");
  const count = document.getElementById("checkpoint-count");

  if (!list || !emptyState || !count) {
    return;
  }

  list.innerHTML = "";

  count.textContent = String(checkpoints.length);

  emptyState.style.display =
    checkpoints.length === 0 ? "block" : "none";

  list.style.display =
    checkpoints.length === 0 ? "none" : "block";

  for (const checkpoint of checkpoints) {
    const row = document.createElement("div");
    row.className = "checkpoint";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "checkpoint-button";
    button.title = `Jump to ${formatTime(checkpoint.timestamp)}`;

    const time = document.createElement("span");
    time.className = "checkpoint-time";
    time.textContent = formatTime(checkpoint.timestamp);

    const name = document.createElement("span");
    name.className = "checkpoint-name";
    name.textContent = checkpoint.name;

    button.append(time, name);

    button.addEventListener("click", () => {
      void seekTo(checkpoint.timestamp);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.textContent = "×";
    deleteButton.title = "Delete checkpoint";
    deleteButton.setAttribute(
      "aria-label",
      `Delete ${checkpoint.name}`
    );

    deleteButton.addEventListener("click", async () => {
      const updated = checkpoints.filter(
        (item) => item.id !== checkpoint.id
      );

      await saveCheckpoints(updated);
      renderCheckpoints(updated);
    });

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "edit-button";
    editButton.textContent = "Edit";
    editButton.title = "Edit checkpoint";

    editButton.addEventListener("click", () => {
      const editForm = document.createElement("form");
      editForm.className = "checkpoint-edit-form";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = checkpoint.name;
      nameInput.required = true;
      nameInput.setAttribute("aria-label", "Checkpoint name");

      const timeInput = document.createElement("input");
      timeInput.type = "text";
      timeInput.value = formatTime(checkpoint.timestamp);
      timeInput.pattern = "[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?";
      timeInput.title = "mm:ss or hh:mm:ss";
      timeInput.setAttribute("aria-label", "Checkpoint time");

      const saveButton = document.createElement("button");
      saveButton.type = "submit";
      saveButton.className = "edit-save-button";
      saveButton.textContent = "Save";

      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "edit-cancel-button";
      cancelButton.textContent = "Cancel";
      cancelButton.addEventListener("click", () => {
        renderCheckpoints(checkpoints);
      });

      editForm.append(nameInput, timeInput, saveButton, cancelButton);
      row.replaceChildren(editForm);
      nameInput.focus();

      editForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const parts = timeInput.value.trim().split(":").map(Number);
        const validTime = parts.every(Number.isFinite) &&
          parts[0] >= 0 &&
          (parts.length === 2 || parts.length === 3) &&
          parts.slice(1).every((part) => part >= 0 && part < 60);

        timeInput.setCustomValidity("");

        if (!nameInput.value.trim() || !validTime) {
          timeInput.setCustomValidity("Use mm:ss or hh:mm:ss");
          timeInput.reportValidity();
          return;
        }

        const timestamp = parts.length === 2
          ? parts[0] * 60 + parts[1]
          : parts[0] * 3600 + parts[1] * 60 + parts[2];
        const updated = checkpoints.map((item) =>
          item.id === checkpoint.id
            ? { ...item, name: nameInput.value.trim(), timestamp }
            : item
        ).sort((a, b) => a.timestamp - b.timestamp);

        await saveCheckpoints(updated);
        renderCheckpoints(updated);
      });
    });

    row.append(button, editButton, deleteButton);
    list.appendChild(row);
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !currentLessonKey || !changes[currentLessonKey]) {
    return;
  }

  const nextValue = changes[currentLessonKey].newValue;
  renderCheckpoints(Array.isArray(nextValue) ? nextValue as Checkpoint[] : []);
});

async function refreshCurrentTime(): Promise<void> {
  const timeElement = document.getElementById("current-time");
  const statusElement = document.getElementById("video-status");

  if (!timeElement || !statusElement) {
    return;
  }

  const currentTime = await getCurrentVideoTime();

  if (currentTime === null) {
    timeElement.textContent = "00:00";
    statusElement.textContent = "Video unavailable";
    return;
  }

  timeElement.textContent = formatTime(currentTime);
  statusElement.textContent = "Video detected";
}

async function addCheckpoint(
  name: string,
  timestamp: number
): Promise<void> {
  const checkpoints = await loadCheckpoints();

  const checkpoint: Checkpoint = {
    id: crypto.randomUUID(),
    timestamp,
    name
  };

  checkpoints.push(checkpoint);

  checkpoints.sort(
    (a, b) => a.timestamp - b.timestamp
  );

  await saveCheckpoints(checkpoints);
  renderCheckpoints(checkpoints);
}

async function openFloatingWindow(): Promise<void> {
  const tab = await getProgrammingHeroTab();

  if (!tab?.id || !tab.url) {
    return;
  }

  try {
    const url = new URL(tab.url);

    if (url.hostname !== PROGRAMMING_HERO_HOST) {
      return;
    }

    const lessonKey = `${url.hostname}${url.pathname}`;

    await chrome.runtime.sendMessage({
      type: "OPEN_FLOATING_WINDOW",
      lessonKey
    });
  } catch {
    // Ignore invalid URLs.
  }
}

function setupFloatingMode(): void {
  const params = new URLSearchParams(window.location.search);

  floatingWindowMode = params.get("floating") === "true";

  if (!floatingWindowMode) {
    return;
  }

  document.body.classList.add("floating-mode");
}

async function initialize(): Promise<void> {
  setupFloatingMode();

  currentLessonKey = await getCurrentLessonKey();

  const lessonName = document.getElementById("lesson-name");

  if (lessonName && currentLessonKey) {
    const pathname = currentLessonKey.split("/").slice(1).join("/");

    lessonName.textContent = getLessonName(
      `/${pathname}`
    );
  }

  const checkpoints = await loadCheckpoints();

  renderCheckpoints(checkpoints);

  await refreshCurrentTime();
}

const form = document.getElementById(
  "checkpoint-form"
) as HTMLFormElement | null;

const input = document.getElementById(
  "checkpoint-name"
) as HTMLInputElement | null;

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!input) {
    return;
  }

  const name = input.value.trim();

  if (!name) {
    return;
  }

  const timestamp = await getCurrentVideoTime();

  if (timestamp === null) {
    return;
  }

  await addCheckpoint(name, timestamp);

  input.value = "";
  input.focus();
});

document
  .getElementById("open-floating")
  ?.addEventListener("click", () => {
    void openFloatingWindow();
  });

document
  .getElementById("keep-open")
  ?.addEventListener("click", () => {
    void openFloatingWindow();
  });

setInterval(() => {
  void refreshCurrentTime();
}, 1000);

void initialize();
