"use strict";

const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { randomUUID } = require("crypto");
const Busboy = require("busboy");
const PDFDocument = require("pdfkit");
const sharp = require("sharp");

const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
const BUCKET = process.env.BUCKET_NAME;
const SIGNED_URL_TTL = parseInt(process.env.SIGNED_URL_TTL || "3600", 10);

// CORS headers returned with every response
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function response(statusCode, body, extra = {}) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...extra },
    body: JSON.stringify(body),
  };
}

/** Parse a multipart/form-data body from an API Gateway proxy event. */
function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const contentType =
      event.headers["content-type"] || event.headers["Content-Type"] || "";
    const busboy = Busboy({ headers: { "content-type": contentType } });

    const fields = {};
    let fileBuffer = null;
    let fileField = null;

    busboy.on("field", (name, value) => {
      fields[name] = value;
    });

    busboy.on("file", (name, stream, info) => {
      fileField = info;
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    busboy.on("finish", () => resolve({ fields, fileBuffer, fileField }));
    busboy.on("error", reject);

    const body = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : Buffer.from(event.body || "", "utf8");

    busboy.write(body);
    busboy.end();
  });
}

/** Upload a buffer to S3 and return the object key. */
async function uploadToS3(buffer, key, contentType) {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return key;
}

/** Generate a pre-signed GET URL for the given key. */
async function presignedUrl(key) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: SIGNED_URL_TTL }
  );
}

const IMAGE_FORMATS = new Set(["jpg", "jpeg", "png", "webp", "gif", "tiff", "avif"]);

/** Return the file extension from a filename. */
function extOf(filename) {
  const parts = (filename || "").split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

async function convertImageToPdf(imageBuffer) {
  const normalizedImage = await sharp(imageBuffer).png().toBuffer();
  const { width = 1200, height = 1600 } = await sharp(normalizedImage).metadata();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false, margin: 0 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.addPage({ size: [width, height] });
    doc.image(normalizedImage, 0, 0, { width, height });
    doc.end();
  });
}

// ─── Lambda handler ───────────────────────────────────────────────────────────

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  try {
    // Parse multipart form data
    let fields, fileBuffer, fileField;
    try {
      ({ fields, fileBuffer, fileField } = await parseMultipart(event));
    } catch (err) {
      return response(400, { error: "Failed to parse request body: " + err.message });
    }

    const targetFormat = (fields.targetFormat || "pdf").trim().toLowerCase();
    const filename = (fileField && fileField.filename) || "upload";
    const sourceExt = extOf(filename);

    if (!fileBuffer || !fileBuffer.length) {
      return response(400, { error: "No file provided." });
    }
    if (targetFormat !== "pdf") {
      return response(422, { error: "Only PDF output is supported." });
    }
    if (!IMAGE_FORMATS.has(sourceExt)) {
      return response(422, {
        error: "Only image files are supported (.jpg, .jpeg, .png, .webp, .gif, .tiff, .avif).",
      });
    }

    // Store original upload
    const uploadId = randomUUID();
    const originalKey = `uploads/${uploadId}/${filename}`;
    await uploadToS3(fileBuffer, originalKey, fileField.mimeType || "application/octet-stream");

    // Convert
    let convertedBuffer;
    try {
      convertedBuffer = await convertImageToPdf(fileBuffer);
    } catch (err) {
      return response(422, { error: "Image-to-PDF conversion failed." });
    }

    // Store converted file
    const convertedFilename = filename.replace(/\.[^.]+$/, "") + ".pdf";
    const convertedKey = `converted/${uploadId}/${convertedFilename}`;
    await uploadToS3(convertedBuffer, convertedKey, "application/pdf");

    // Generate pre-signed download URL
    const downloadUrl = await presignedUrl(convertedKey);

    return response(200, {
      downloadUrl,
      filename: convertedFilename,
      expiresIn: SIGNED_URL_TTL,
    });
  } catch (err) {
    console.error("Unhandled error:", err);
    return response(500, { error: "Internal server error." });
  }
};
