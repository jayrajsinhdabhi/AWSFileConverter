const form = document.getElementById("converter-form");
const fileInput = document.getElementById("file-input");
const formatSelect = document.getElementById("format-select");
const statusNode = document.getElementById("download-placeholder");

const apiUrl = ((window.__CONFIG__ && window.__CONFIG__.apiUrl) || "").replace(/\/$/, "");

const SUPPORTED_IMAGE_TYPES = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/tiff",
        "image/avif",
];

function setStatus(type, message) {
        statusNode.className = `status status--${type}`;
        statusNode.innerHTML =
                type === "info" ? `<span class="spinner" aria-hidden="true"></span>${message}` : message;
}

function setDownloadLink(url, filename, expiresInSeconds) {
        statusNode.className = "status status--success";
        statusNode.innerHTML = `
                <span class="success-text">Conversion complete.</span>
                <a href="${url}" target="_blank" rel="noopener noreferrer" class="download-btn">
                        Download ${filename}
                </a>
                <span class="expiry-note">Link expires in about ${Math.floor(expiresInSeconds / 60)} minutes.</span>
        `;
}

formatSelect.value = "pdf";
formatSelect.disabled = true;

form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitButton = form.querySelector('button[type="submit"]');

        if (!apiUrl) {
                setStatus("error", "Missing API URL. Create ui/config.js with window.__CONFIG__.apiUrl.");
                return;
        }

        const file = fileInput.files[0];
        if (!file) {
                setStatus("error", "Please select a file.");
                return;
        }

        if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
                setStatus("error", "Please select a supported image file (JPG, PNG, WEBP, GIF, TIFF, AVIF).");
                return;
        }

        submitButton.disabled = true;
        setStatus("info", "Uploading and converting...");

        try {
                const payload = new FormData();
                payload.append("file", file);
                payload.append("targetFormat", "pdf");

                const response = await fetch(`${apiUrl}/convert`, {
                        method: "POST",
                        body: payload,
                });

                const result = await response.json().catch(() => ({}));

                if (!response.ok) {
                        throw new Error(result.error || "Conversion request failed.");
                }

                setDownloadLink(result.downloadUrl, result.filename, result.expiresIn || 3600);
        } catch (error) {
                setStatus("error", `Error: ${error.message}`);
        } finally {
                submitButton.disabled = false;
        }
});
