"use strict";

/**
 * Unit tests for the Lambda handler.
 *
 * AWS SDK and external libraries are mocked so no real AWS calls are made.
 */

// ─── Mock AWS SDK ─────────────────────────────────────────────────────────────
jest.mock("@aws-sdk/client-s3", () => {
  const mockSend = jest.fn().mockResolvedValue({
    Body: (async function* () {})(),
  });
  return {
    S3Client: jest.fn(() => ({ send: mockSend })),
    GetObjectCommand: jest.fn(),
    PutObjectCommand: jest.fn(),
    __mockSend: mockSend,
  };
});
jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn().mockResolvedValue("https://example.com/presigned"),
}));

// ─── Mock sharp ───────────────────────────────────────────────────────────────
jest.mock("sharp", () => {
  const mockInstance = {
    png: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from("normalized-png")),
    metadata: jest.fn().mockResolvedValue({ width: 640, height: 480 }),
  };
  return jest.fn(() => mockInstance);
});

// ─── Mock pdfkit ─────────────────────────────────────────────────────────────
jest.mock("pdfkit", () => {
  const { EventEmitter } = require("events");
  return jest.fn(() => {
    const mockDoc = new EventEmitter();
    mockDoc.addPage = jest.fn().mockReturnThis();
    mockDoc.image = jest.fn().mockReturnThis();
    mockDoc.end = jest.fn(() => {
      mockDoc.emit("data", Buffer.from("fake-pdf-chunk"));
      mockDoc.emit("end");
    });
    return mockDoc;
  });
});

// ─── Mock busboy ─────────────────────────────────────────────────────────────
// mockBusboyImpl must be prefixed with "mock" so Jest hoisting allows it.
let mockBusboyImpl = null;
jest.mock("busboy", () => {
  const { EventEmitter } = require("events");
  return jest.fn(() => {
    const mockBb = new EventEmitter();
    mockBb.write = jest.fn();
    mockBb.end = jest.fn(() => {
      if (mockBusboyImpl) mockBusboyImpl(mockBb);
    });
    return mockBb;
  });
});

// ─── Env vars ─────────────────────────────────────────────────────────────────
process.env.BUCKET_NAME = "test-bucket";
process.env.AWS_REGION = "us-east-1";

const { handler } = require("../src/handler");
const { EventEmitter } = require("events");

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeBusboyImpl({
  filename = "photo.jpg",
  mimeType = "image/jpeg",
  body = "image-content",
  targetFormat = "pdf",
} = {}) {
  return (bb) => {
    bb.emit("field", "targetFormat", targetFormat);
    const stream = new EventEmitter();
    stream.resume = jest.fn();
    bb.emit("file", "file", stream, { filename, mimeType });
    stream.emit("data", Buffer.from(body));
    stream.emit("end");
    bb.emit("finish");
  };
}

function apiGatewayEvent(body = "", isBase64Encoded = false, method = "POST") {
  return {
    httpMethod: method,
    headers: { "content-type": "multipart/form-data; boundary=----boundary" },
    body: isBase64Encoded ? Buffer.from(body).toString("base64") : body,
    isBase64Encoded,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("handler - OPTIONS preflight", () => {
  it("returns 204 with CORS headers", async () => {
    const result = await handler({ httpMethod: "OPTIONS", headers: {}, body: "" });
    expect(result.statusCode).toBe(204);
    expect(result.headers["Access-Control-Allow-Origin"]).toBeDefined();
  });
});

describe("handler - validation", () => {
  it("returns 400 when no file is provided", async () => {
    mockBusboyImpl = (bb) => {
      bb.emit("field", "targetFormat", "pdf");
      const stream = new EventEmitter();
      bb.emit("file", "file", stream, { filename: "empty.jpg", mimeType: "image/jpeg" });
      stream.emit("end");
      bb.emit("finish");
    };
    const result = await handler(apiGatewayEvent("--boundary--"));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/No file provided/i);
  });

  it("defaults missing targetFormat to pdf", async () => {
    mockBusboyImpl = (bb) => {
      const stream = new EventEmitter();
      bb.emit("file", "file", stream, { filename: "photo.jpg", mimeType: "image/jpeg" });
      stream.emit("data", Buffer.from("some content"));
      stream.emit("end");
      bb.emit("finish");
    };
    const result = await handler(apiGatewayEvent("--boundary--"));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).filename).toBe("photo.pdf");
  });

  it("returns 422 when targetFormat is not pdf", async () => {
    mockBusboyImpl = makeBusboyImpl({ filename: "photo.jpg", targetFormat: "png" });
    const result = await handler(apiGatewayEvent("--boundary--"));
    expect(result.statusCode).toBe(422);
    expect(JSON.parse(result.body).error).toMatch(/Only PDF output/i);
  });

  it("returns 422 for non-image input", async () => {
    mockBusboyImpl = makeBusboyImpl({ filename: "notes.txt", mimeType: "text/plain", body: "hello" });
    const result = await handler(apiGatewayEvent("--boundary--"));
    expect(result.statusCode).toBe(422);
    expect(JSON.parse(result.body).error).toMatch(/Only image files are supported/i);
  });
});

describe("handler - successful conversion (image to pdf)", () => {
  beforeEach(() => {
    mockBusboyImpl = makeBusboyImpl({ filename: "hello.jpg", body: "fake-image", targetFormat: "pdf" });
  });

  it("returns 200 with a downloadUrl", async () => {
    const result = await handler(apiGatewayEvent("--boundary--"));
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.downloadUrl).toBe("https://example.com/presigned");
    expect(body.filename).toBe("hello.pdf");
    expect(body.expiresIn).toBe(3600);
  });
});
