const API_ENDPOINT = "https://wl4xfvngyd.execute-api.us-east-1.amazonaws.com/get-url";
const form = document.getElementById("converter-form");
const fileInput = document.getElementById("file-input");
const formatSelect = document.getElementById("format-select");
const downloadPlaceholder = document.getElementById("download-placeholder");

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!fileInput.files.length || !formatSelect.value) {
        downloadPlaceholder.textContent = "Please select a file and format.";
        return;
    }

    const file = fileInput.files[0];
    const targetFormat = formatSelect.value.toLowerCase();
    downloadPlaceholder.textContent = "Step 1: Requesting secure upload link...";

    try {
        // 1. Get the pre-signed URL
        const response = await fetch(`${API_ENDPOINT}?filename=${encodeURIComponent(file.name)}`);
        const { uploadURL } = await response.json();

        downloadPlaceholder.textContent = "Step 2: Uploading and Converting...";

        // 2. Upload to S3
        const uploadResponse = await fetch(uploadURL, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type }
        });

        if (uploadResponse.ok) {
            // 3. Generate the download link
            // We assume the conversion happens quickly. We point to the 'converted' folder.
            const fileNameOnly = file.name.split('.').slice(0, -1).join('.');
            const convertedFileName = `${fileNameOnly}.${targetFormat}`;
            const bucketUrl = "https://file-converter-storage-jayraj.s3.us-east-1.amazonaws.com";
            const downloadUrl = `${bucketUrl}/converted/${convertedFileName}`;

            downloadPlaceholder.innerHTML = `
                <p style="color: green; font-weight: bold;">Conversion Started!</p>
                <p>Wait a few seconds, then click below:</p>
                <a href="${downloadUrl}" target="_blank" class="download-btn" style="padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
                    Download ${targetFormat.toUpperCase()}
                </a>
            `;
        } else {
            throw new Error("S3 Upload Failed");
        }
    } catch (error) {
        console.error(error);
        downloadPlaceholder.textContent = "Error: " + error.message;
    }
});
