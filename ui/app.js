const API_ENDPOINT =
  "https://wl4xfvngyd.execute-api.us-east-1.amazonaws.com/get-url";
const form = document.getElementById("converter-form");
const fileInput = document.getElementById("file-input");
const formatSelect = document.getElementById("format-select");
const convertButton = document.getElementById("convert-button");
const downloadArea = document.getElementById("download-placeholder");

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitBtn = form.querySelector('button[type="submit"]');
    
    if (!fileInput.files.length || !formatSelect.value) {
        downloadPlaceholder.textContent = "Please select a file and format.";
        return;
    }

    const file = fileInput.files[0];
    const targetFormat = "pdf";
    const isSupportedImage = file.type === "image/png" || file.type === "image/jpeg";

    if (!isSupportedImage) {
        downloadPlaceholder.textContent = "Only PNG and JPG images are supported for this demo.";
        return;
    }
    
    // UI: Start Loading State
    submitBtn.disabled = true;
    downloadPlaceholder.innerHTML = `<div class="loader"></div> Processing your file...`;

    try {
        // Step 1: Request the URL (PDF output only)
        const response = await fetch(`${API_ENDPOINT}?filename=${encodeURIComponent(file.name)}`);
        const { uploadURL } = await response.json();

        // Step 2: Upload to S3
        const uploadResponse = await fetch(uploadURL, {
            method: "PUT",
            body: file,
            headers: { 
                "Content-Type": file.type
            }
        });

        if (uploadResponse.ok) {
            const fileNameOnly = file.name.split('.').slice(0, -1).join('.');
            const convertedFileName = `${fileNameOnly}.${targetFormat}`;
            const bucketUrl = "https://file-converter-storage-jayraj.s3.us-east-1.amazonaws.com";
            const downloadUrl = `${bucketUrl}/converted/${convertedFileName}`;

            // Polling function to check if the file exists in S3
            const checkFileExists = async () => {
                try {
                    const checkResponse = await fetch(downloadUrl, { method: "HEAD" });
                    if (checkResponse.ok) {
                        // File is finally ready!
                        downloadPlaceholder.innerHTML = `
                            <p style="color: green; font-weight: bold;">✅ Ready for Download!</p>
                            <a href="${downloadUrl}" target="_blank" class="download-btn" style="padding: 10px 20px; background: #28a745; color: white; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
                                Download ${targetFormat.toUpperCase()}
                            </a>
                        `;
                        submitBtn.disabled = false;
                    } else {
                        // Not ready yet, check again in 2 seconds
                        setTimeout(checkFileExists, 2000);
                    }
                } catch (e) {
                    setTimeout(checkFileExists, 2000);
                }
            };

            downloadPlaceholder.innerHTML = `<div class="loader"></div> Converting your file... please wait.`;
            checkFileExists(); // Start the first check
        } else {
            throw new Error("Upload Failed");
        }
    } catch (error) {
        downloadPlaceholder.textContent = "Error: " + error.message;
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
