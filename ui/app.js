const API_ENDPOINT =
  "https://wl4xfvngyd.execute-api.us-east-1.amazonaws.com/get-url";
const form = document.getElementById("converter-form");
const fileInput = document.getElementById("file-input");
const formatSelect = document.getElementById("format-select");
const downloadPlaceholder = document.getElementById("download-placeholder");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForAwsFile(downloadUrl, timeoutMs = 45000, intervalMs = 2000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        try {
            const availabilityCheck = await fetch(downloadUrl, {
                method: "HEAD",
                cache: "no-store"
            });

            if (availabilityCheck.ok) {
                return true;
            }
        } catch (error) {
            // Keep polling until timeout because Lambda conversion is asynchronous.
        }

        await wait(intervalMs);
    }

    return false;
}

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
    downloadPlaceholder.innerHTML = `
        <div class="loader"></div>
        Processing your file...
        <a class="download-btn disabled" aria-disabled="true" href="#" onclick="return false;">
            Download ${targetFormat.toUpperCase()}
        </a>
    `;

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

            const isFileReady = await waitForAwsFile(downloadUrl);

            if (!isFileReady) {
                throw new Error("Converted file is not ready yet. Please try again in a few seconds.");
            }

            downloadPlaceholder.innerHTML = `
                <p class="success-text">Ready for Download!</p>
                <a href="${downloadUrl}" target="_blank" class="download-btn">
                    Download ${targetFormat.toUpperCase()}
                </a>
            `;
            submitBtn.disabled = false;
        } else {
            throw new Error("Upload Failed");
        }
    } catch (error) {
        downloadPlaceholder.textContent = "Error: " + error.message;
        submitBtn.disabled = false;
    }
});
