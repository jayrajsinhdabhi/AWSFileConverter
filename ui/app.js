const API_BASE_URL =
    (window.__CONFIG__ && window.__CONFIG__.apiUrl) ||
    "https://wl4xfvngyd.execute-api.us-east-1.amazonaws.com/prod";
const CONVERT_ENDPOINT = `${API_BASE_URL.replace(/\/$/, "")}/convert`;

const form = document.getElementById("converter-form");
const fileInput = document.getElementById("file-input");
const formatSelect = document.getElementById("format-select");
const downloadArea = document.getElementById("download-placeholder");

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitBtn = form.querySelector('button[type="submit"]');

    if (!fileInput.files.length || !formatSelect.value) {
        setStatus("error", "Please select a file and format.");
        return;
    }

    const file = fileInput.files[0];
    const targetFormat = formatSelect.value;
    const isSupportedImage =
        file.type === "image/png" || file.type === "image/jpeg";

    if (!isSupportedImage) {
        setStatus("error", "Only PNG and JPG images are supported for this demo.");
        return;
    }

    submitBtn.disabled = true;
    setStatus("info", "Converting your file... please wait.");

    try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("targetFormat", targetFormat);

        const response = await fetch(CONVERT_ENDPOINT, {
            method: "POST",
            body: formData,
        });

        let payload = {};
        try {
            payload = await response.json();
        } catch (parseError) {
            payload = {};
        }

        if (!response.ok) {
            throw new Error(payload.error || `Conversion failed (${response.status}).`);
        }

        if (!payload.downloadUrl) {
            throw new Error("No download URL was returned by the API.");
        }

        const fallbackName = `${file.name.replace(/\.[^.]+$/, "")}.${targetFormat}`;
        setDownloadLink(payload.downloadUrl, payload.filename || fallbackName, payload.expiresIn);
    } catch (error) {
        setStatus("error", `Error: ${error.message}`);
    } finally {
        submitBtn.disabled = false;
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
