"use strict";

const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { randomUUID } = require("crypto");
const Busboy = require("busboy");
const PDFDocument = require("pdfkit");
const pdfParse = require("pdf-parse");
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

/** Download an object from S3 into a Buffer. */
async function downloadFromS3(key) {
  const { Body } = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key })
  );
  const chunks = [];
  for await (const chunk of Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// ─── Converters ──────────────────────────────────────────────────────────────

/** Convert a plain-text buffer to a PDF buffer. */
async function textToPdf(textBuffer) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(12).text(textBuffer.toString("utf8"));
    doc.end();
  });
}

/** Extract text from a PDF buffer and return a plain-text buffer. */
async function pdfToText(pdfBuffer) {
  const data = await pdfParse(pdfBuffer);
  return Buffer.from(data.text, "utf8");
}

/** Convert an image buffer to a different format using sharp. */
async function convertImage(imageBuffer, targetFormat) {
  const fmt = targetFormat.toLowerCase();
  const supported = ["jpg", "jpeg", "png", "webp", "gif", "tiff", "avif"];
  if (!supported.includes(fmt)) {
    throw new Error(`Unsupported image target format: ${targetFormat}`);
  }
  const sharpFmt = fmt === "jpg" ? "jpeg" : fmt;
  return sharp(imageBuffer).toFormat(sharpFmt).toBuffer();
}

// ─── Conversion dispatch ──────────────────────────────────────────────────────

const MIME = {
  pdf: "application/pdf",
  txt: "text/plain",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  tiff: "image/tiff",
  avif: "image/avif",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function mimeForFormat(fmt) {
  return MIME[fmt.toLowerCase()] || "application/octet-stream";
}

/** Return the file extension from a filename. */
function extOf(filename) {
  const parts = (filename || "").split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

const IMAGE_FORMATS = new Set(["jpg", "jpeg", "png", "webp", "gif", "tiff", "avif"]);

async function convert(sourceBuffer, sourceFilename, targetFormat) {
  const srcExt = extOf(sourceFilename);
  const tgtFmt = targetFormat.toLowerCase();

  // txt → pdf
  if ((srcExt === "txt" || srcExt === "csv") && tgtFmt === "pdf") {
    return { buffer: await textToPdf(sourceBuffer), mime: MIME.pdf };
  }

  // pdf → txt
  if (srcExt === "pdf" && tgtFmt === "txt") {
    return { buffer: await pdfToText(sourceBuffer), mime: MIME.txt };
  }

  // image → image
  if (IMAGE_FORMATS.has(srcExt) && IMAGE_FORMATS.has(tgtFmt)) {
    return {
      buffer: await convertImage(sourceBuffer, tgtFmt),
      mime: mimeForFormat(tgtFmt),
    };
  }

  throw new Error(
    `Conversion from .${srcExt} to .${tgtFmt} is not supported.`
  );
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

    const targetFormat = (fields.targetFormat || "").trim().toLowerCase();
    const filename = (fileField && fileField.filename) || "upload";

    if (!fileBuffer || !fileBuffer.length) {
      return response(400, { error: "No file provided." });
    }
    if (!targetFormat) {
      return response(400, { error: "targetFormat field is required." });
    }

    // Store original upload
    const uploadId = randomUUID();
    const originalKey = `uploads/${uploadId}/${filename}`;
    await uploadToS3(fileBuffer, originalKey, fileField.mimeType || "application/octet-stream");

    // Convert
    let convertedBuffer, convertedMime;
    try {
      ({ buffer: convertedBuffer, mime: convertedMime } = await convert(
        fileBuffer,
        filename,
        targetFormat
      ));
    } catch (err) {
      return response(422, { error: err.message });
    }

    // Store converted file
    const convertedFilename = filename.replace(/\.[^.]+$/, "") + "." + targetFormat;
    const convertedKey = `converted/${uploadId}/${convertedFilename}`;
    await uploadToS3(convertedBuffer, convertedKey, convertedMime);

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
