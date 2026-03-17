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
    downloadPlaceholder.textContent = "Step 1: Requesting secure upload link...";

    try {
        // 1. Get the pre-signed URL from your Lambda/API
        const response = await fetch(`${API_ENDPOINT}?filename=${encodeURIComponent(file.name)}`);
        const { uploadURL } = await response.json();

        downloadPlaceholder.textContent = "Step 2: Uploading to S3...";

        // 2. Upload the file directly to S3 using the link
        const uploadResponse = await fetch(uploadURL, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type }
        });

        if (uploadResponse.ok) {
            downloadPlaceholder.textContent = "Upload Complete! Check your S3 bucket.";
        } else {
            throw new Error("S3 Upload Failed");
        }

    } catch (error) {
        console.error(error);
        downloadPlaceholder.textContent = "Error: " + error.message;
    }
});
