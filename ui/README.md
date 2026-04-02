# UI

Static frontend for the AWS File Converter.  
Hosted on S3 + CloudFront, deployed by the SAM stack defined in `template.yaml`.

## Files

| File | Purpose |
|---|---|
| `index.html` | Main page |
| `styles.css` | Styles (including status/loading states) |
| `app.js` | Validates image uploads, submits multipart request to `/convert` with PDF output, renders download link |
| `config.js` | **Generated at deploy time** – injects `window.__CONFIG__.apiUrl` |

## Local development

```powershell
# Open directly in browser (no real API calls without config.js)
Start-Process index.html

# Simple static server
npx serve .
```

Create a `config.js` next to `index.html` to point at a deployed API:

```js
window.__CONFIG__ = {
  apiUrl: "https://<api-id>.execute-api.<region>.amazonaws.com/prod"
};
```

## Deploy

Run `sam deploy` from the repository root (see root `README.md`).  
The deploy script generates `config.js` from the SAM stack `ApiUrl` output and
uploads all files in this folder to the `WebsiteBucket` S3 bucket.
