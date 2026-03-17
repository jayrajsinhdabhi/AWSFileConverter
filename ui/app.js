const API_ENDPOINT = "https://wl4xfvngyd.execute-api.us-east-1.amazonaws.com";

const form = document.getElementById("converter-form");
const fileInput = document.getElementById("file-input");
const formatSelect = document.getElementById("format-select");
const downloadPlaceholder = document.getElementById("download-placeholder");

form.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!fileInput.files.length || !formatSelect.value) {
    downloadPlaceholder.textContent =
      "Select a file and target format before converting.";
    return;
  }

  const fileName = fileInput.files[0].name;
  const target = formatSelect.value.toUpperCase();

  downloadPlaceholder.textContent = `Placeholder: Converted ${fileName} to ${target}. Download link will appear here.`;
});
