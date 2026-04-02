# AWS File Converter

A serverless web application that converts files between formats using AWS.

## Architecture

```
Browser (CloudFront + S3)
        │
        │  POST /convert  (multipart/form-data)
        ▼
API Gateway  ──►  Lambda (Node.js 20)
                      │
                      │  GetObject / PutObject
                      ▼
                  S3 Bucket
                  ├── uploads/{id}/{original}
                  └── converted/{id}/{result}
                      │
                      │  Pre-signed GET URL (1 h TTL)
                      ▼
                   Browser downloads converted file
```

### Supported conversions

| Source | Target |
|---|---|
| `.txt`, `.csv` | `.pdf` |
| `.pdf` | `.txt` |
| `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.tiff`, `.avif` | any other image format in that list |

## Repository layout

```
├── ui/                 Static frontend (HTML / CSS / JS)
├── backend/
│   ├── src/
│   │   └── handler.js  Lambda entry-point
│   ├── tests/
│   │   └── handler.test.js
│   └── package.json
├── template.yaml       AWS SAM infrastructure template
└── README.md
```

## Prerequisites

- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) configured
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- Node.js ≥ 20

## Deploy

```bash
# 1 – install backend dependencies for local development/testing
cd backend && npm install && cd ..

# 2 – build inside a Linux container so sharp matches Lambda
sam build --use-container

# 3 – deploy (first time creates a guided setup)
sam deploy --guided
# Accept the defaults or customise AllowedOrigin and SignedUrlTtl.

# 4 – retrieve the API URL from stack outputs
API_URL=$(aws cloudformation describe-stacks \
  --stack-name aws-file-converter \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" \
  --output text)

# 5 – generate config.js for the frontend
echo "window.__CONFIG__ = { apiUrl: \"${API_URL}\" };" > ui/config.js

# 6 – upload the frontend to the S3 website bucket
WEBSITE_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name aws-file-converter \
  --query "Stacks[0].Outputs[?OutputKey=='WebsiteBucketName'].OutputValue" \
  --output text)

aws s3 sync ui/ "s3://${WEBSITE_BUCKET}/" --delete

# 7 – open the CloudFront URL
aws cloudformation describe-stacks \
  --stack-name aws-file-converter \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontUrl'].OutputValue" \
  --output text
```

## Local development

```bash
# Install and test the backend
cd backend
npm install
npm test

# If you are building Lambda artifacts on Windows/macOS without Docker,
# reinstall sharp for the Lambda target before packaging.
# cd backend
# Remove-Item -Recurse -Force node_modules
# npm install --os=linux --cpu=x64 sharp

# Preview the UI locally (no real conversions without an API URL)
cd ui
npx serve .
```

## Tear down

```bash
sam delete --stack-name aws-file-converter
```
