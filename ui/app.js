/**
 * AWS File Converter – frontend logic.
 *
 * Reads API_URL from a window-level config object injected at deploy time
 * (window.__CONFIG__.apiUrl).  During local development you can override it
 * by creating a config.js that sets window.__CONFIG__ before this script runs,
 * or by setting the constant below directly.
 */

const API_URL =
  (window.__CONFIG__ && window.__CONFIG__.apiUrl) ||
  ""; // filled in by deploy script or config.js

const form = document.getElementById("converter-form");
const fileInput = document.getElementById("file-input");
const formatSelect = document.getElementById("format-select");
const convertButton = document.getElementById("convert-button");
const downloadArea = document.getElementById("download-placeholder");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!fileInput.files.length || !formatSelect.value) {
    setStatus("error", "Please select a file and a target format.");
    return;
  }

  if (!API_URL) {
    setStatus(
      "error",
      "API endpoint is not configured. " +
        "Set window.__CONFIG__.apiUrl or deploy via AWS SAM."
    );
    return;
  }

  const file = fileInput.files[0];
  const targetFormat = formatSelect.value;

  setStatus("loading", "Converting…");
  convertButton.disabled = true;

  try {
    const body = new FormData();
    body.append("file", file, file.name);
    body.append("targetFormat", targetFormat);

    const res = await fetch(`${API_URL}/convert`, { method: "POST", body });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `Server error ${res.status}`);
    }

    const baseName = file.name.replace(/\.[^.]+$/, "");
    const downloadName = `${baseName}.${targetFormat}`;
    setDownloadLink(data.downloadUrl, downloadName, data.expiresIn);
  } catch (err) {
    setStatus("error", err.message || "An unexpected error occurred.");
  } finally {
    convertButton.disabled = false;
  }
});

// ─── UI helpers ──────────────────────────────────────────────────────────────

function setStatus(type, message) {
  downloadArea.className = `status status--${type}`;
  downloadArea.textContent = message;
}

function setDownloadLink(url, filename, expiresIn) {
  downloadArea.className = "status status--success";
  downloadArea.innerHTML = "";

  const msg = document.createElement("span");
  msg.textContent = "Conversion complete. ";
  downloadArea.appendChild(msg);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.className = "download-link";
  link.textContent = `Download ${filename}`;
  downloadArea.appendChild(link);

  if (expiresIn) {
    const note = document.createElement("span");
    note.className = "expiry-note";
    const minutes = Math.round(expiresIn / 60);
    note.textContent = ` (link expires in ${minutes} min)`;
    downloadArea.appendChild(note);
  }
}
