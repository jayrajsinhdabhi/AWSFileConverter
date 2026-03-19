# UI

Static frontend for the AWS File Converter.  
Hosted on S3 + CloudFront, deployed by the SAM stack defined in `template.yaml`.

## Files

| File | Purpose |
|---|---|
| `index.html` | Main page |
| `styles.css` | Styles (including status/loading states) |
| `app.js` | Form submission, calls `/convert` API, renders download link |
| `config.js` | **Generated at deploy time** – injects `window.__CONFIG__.apiUrl` |

## Local development

```bash
# Option A – open directly in browser (no real API calls without config.js)
open index.html

# Option B – simple static server
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
