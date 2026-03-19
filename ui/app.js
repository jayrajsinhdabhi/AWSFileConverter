const BUCKET_NAME = "file-converter-storage-jayraj";
const REGION = "us-east-1";
const BUCKET_URL = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com`;

const form = document.getElementById("converter-form");
const fileInput = document.getElementById("file-input");
const formatSelect = document.getElementById("format-select");
const downloadArea = document.getElementById("download-placeholder");

form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');

        if (!fileInput.files.length) {
                setStatus("error", "Please select a file.");
                return;
        }

        const file = fileInput.files[0];
        const targetFormat = formatSelect.value;
        const fileNameOnly = file.name.split(".").slice(0, -1).join(".");

        // Generate a unique key to avoid cache/collision issues.
        const uniqueId = Date.now();
        const uploadKey = `uploads/${uniqueId}-${file.name}`;
        const downloadUrl = `${BUCKET_URL}/converted/${uniqueId}-${fileNameOnly}.pdf`;

        submitBtn.disabled = true;
        setStatus("info", "Uploading to S3...");

        try {
                // Upload directly to S3 uploads/ folder.
                const uploadResponse = await fetch(`${BUCKET_URL}/${uploadKey}`, {
                        method: "PUT",
                        body: file,
                        headers: { "Content-Type": file.type }
                });

                if (!uploadResponse.ok) {
                        throw new Error("Upload to S3 failed. Check CORS settings.");
                }

                setStatus("info", "Upload successful! Waiting for Lambda to convert...");

                // Start polling for the converted file.
                let attempts = 0;
                const maxAttempts = 30;

                const checkFile = setInterval(async () => {
                        attempts += 1;
                        try {
                                const response = await fetch(downloadUrl, { method: "HEAD" });
                                if (response.ok) {
                                        clearInterval(checkFile);
                                        setDownloadLink(downloadUrl, `${fileNameOnly}.pdf`);
                                        submitBtn.disabled = false;
                                }
                        } catch (e) {
                                // Ignore transient polling errors.
                        }

                        if (attempts >= maxAttempts) {
                                clearInterval(checkFile);
                                setStatus("error", "Conversion timed out. Check CloudWatch logs.");
                                submitBtn.disabled = false;
                        }
                }, 2000);
        } catch (error) {
                setStatus("error", `Error: ${error.message}`);
                submitBtn.disabled = false;
        }
});

// ─── UI helpers ──────────────────────────────────────────────────────────────

function setStatus(type, message) {
        downloadArea.className = `status status--${type}`;
        downloadArea.innerHTML = type === "info" ? `<div class="spinner"></div> ${message}` : message;
}

function setDownloadLink(url, filename) {
        downloadArea.className = "status status--success";
        downloadArea.innerHTML = `
                <span>Conversion complete!</span>
                <br><br>
                <a href="${url}" target="_blank" class="download-link" style="padding: 10px 20px; background: #28a745; color: white; text-decoration: none; border-radius: 5px;">
                        Download ${filename}
                </a>
        `;
}
