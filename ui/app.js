const API_ENDPOINT =
  "https://wl4xfvngyd.execute-api.us-east-1.amazonaws.com/get-url";
const form = document.getElementById("converter-form");
const fileInput = document.getElementById("file-input");
const formatSelect = document.getElementById("format-select");
const downloadPlaceholder = document.getElementById("download-placeholder");

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitBtn = form.querySelector('button[type="submit"]');
    
    if (!fileInput.files.length || !formatSelect.value) {
        downloadPlaceholder.textContent = "Please select a file and format.";
        return;
    }

    const file = fileInput.files[0];
    const targetFormat = formatSelect.value.toLowerCase();
    
    // UI: Start Loading State
    submitBtn.disabled = true;
    downloadPlaceholder.innerHTML = `<div class="loader"></div> Processing your file...`;

    try {
        // Step 1: Request the URL with the format info
        const response = await fetch(`${API_ENDPOINT}?filename=${encodeURIComponent(file.name)}&targetFmt=${targetFormat}`);
        const { uploadURL } = await response.json();

        // Step 2: Upload to S3
        const uploadResponse = await fetch(uploadURL, {
            method: "PUT",
            body: file,
            headers: { 
                "Content-Type": file.type,
                "x-amz-meta-targetfmt": targetFormat 
            }
        });

        if (uploadResponse.ok) {
            // Give the Lambda 3 seconds to finish the conversion
            setTimeout(() => {
                const fileNameOnly = file.name.split('.').slice(0, -1).join('.');
                const convertedFileName = `${fileNameOnly}.${targetFormat}`;
                const bucketUrl = "https://file-converter-storage-jayraj.s3.us-east-1.amazonaws.com";
                const downloadUrl = `${bucketUrl}/converted/${convertedFileName}`;

                downloadPlaceholder.innerHTML = `
                    <p style="color: green; font-weight: bold;">✅ Ready for Download!</p>
                    <a href="${downloadUrl}" target="_blank" class="download-btn" style="padding: 10px 20px; background: #28a745; color: white; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
                        Download ${targetFormat.toUpperCase()}
                    </a>
                `;
                submitBtn.disabled = false;
            }, 3000); // 3 second delay
        } else {
            throw new Error("Upload Failed");
        }
    } catch (error) {
        downloadPlaceholder.textContent = "Error: " + error.message;
        submitBtn.disabled = false;
    }
});
