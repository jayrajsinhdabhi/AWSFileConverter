const API_ENDPOINT =
  "https://wl4xfvngyd.execute-api.us-east-1.amazonaws.com/get-url";
const form = document.getElementById("converter-form");
const fileInput = document.getElementById("file-input");
const formatSelect = document.getElementById("format-select");
const downloadPlaceholder = document.getElementById("download-placeholder");

function showLoadingStatus(message) {
  downloadPlaceholder.innerHTML = `
    <div class="loading-state" role="status" aria-live="polite">
      <span class="spinner" aria-hidden="true"></span>
      <span>${message}</span>
    </div>
  `;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!fileInput.files.length || !formatSelect.value) {
    downloadPlaceholder.textContent = "Please select a file and format.";
    return;
  }

  const file = fileInput.files[0];
  const targetFormat = formatSelect.value.toLowerCase();
  showLoadingStatus("Step 1: Requesting secure upload link...");

  try {
    // 1. Get the pre-signed URL
    const response = await fetch(
      `${API_ENDPOINT}?filename=${encodeURIComponent(file.name)}`,
    );
    const { uploadURL } = await response.json();

    showLoadingStatus("Step 2: Uploading and Converting...");

    // 2. Upload to S3
    const uploadResponse = await fetch(uploadURL, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });

    if (uploadResponse.ok) {
      // 3. Generate the download link
      // This takes "me.png" and makes it "me.pdf"
      const fileNameOnly = file.name.split('.').slice(0, -1).join('.');
      const convertedFileName = `${fileNameOnly}.${targetFormat}`;
      const bucketUrl = "https://file-converter-storage-jayraj.s3.us-east-1.amazonaws.com";
      const downloadUrl = `${bucketUrl}/converted/${convertedFileName}`;

      downloadPlaceholder.innerHTML = `
        <p class="success-text">Conversion Started!</p>
        <p>Wait 5 seconds for processing, then click:</p>
        <a href="${downloadUrl}" target="_blank" class="download-btn">
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
