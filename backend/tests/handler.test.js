"use strict";

/**
 * Unit tests for the Lambda handler.
 *
 * AWS SDK and external libraries are mocked so no real AWS calls are made
 * and no native binaries need to be present.
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
    toFormat: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from("fake-image")),
  };
  return jest.fn(() => mockInstance);
});

// ─── Mock pdf-parse ───────────────────────────────────────────────────────────
jest.mock("pdf-parse", () =>
  jest.fn().mockResolvedValue({ text: "Extracted text from PDF." })
);

// ─── Mock pdfkit ─────────────────────────────────────────────────────────────
jest.mock("pdfkit", () => {
  const { EventEmitter } = require("events");
  return jest.fn(() => {
    const mockDoc = new EventEmitter();
    mockDoc.fontSize = jest.fn().mockReturnThis();
    mockDoc.text = jest.fn().mockReturnThis();
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
  filename = "test.txt",
  mimeType = "text/plain",
  body = "Hello",
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
      bb.emit("file", "file", stream, { filename: "empty.txt", mimeType: "text/plain" });
      stream.emit("end");
      bb.emit("finish");
    };
    const result = await handler(apiGatewayEvent("--boundary--"));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/No file provided/i);
  });

  it("returns 400 when targetFormat is missing", async () => {
    mockBusboyImpl = (bb) => {
      const stream = new EventEmitter();
      bb.emit("file", "file", stream, { filename: "test.txt", mimeType: "text/plain" });
      stream.emit("data", Buffer.from("some content"));
      stream.emit("end");
      bb.emit("finish");
    };
    const result = await handler(apiGatewayEvent("--boundary--"));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/targetFormat/i);
  });
});

describe("handler - successful conversion (txt to pdf)", () => {
  beforeEach(() => {
    mockBusboyImpl = makeBusboyImpl({ filename: "hello.txt", body: "Hello World", targetFormat: "pdf" });
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

describe("handler - successful conversion (image to image)", () => {
  beforeEach(() => {
    mockBusboyImpl = (bb) => {
      bb.emit("field", "targetFormat", "png");
      const stream = new EventEmitter();
      bb.emit("file", "file", stream, { filename: "photo.jpg", mimeType: "image/jpeg" });
      stream.emit("data", Buffer.from("fake-jpeg-data"));
      stream.emit("end");
      bb.emit("finish");
    };
  });

  it("returns 200 with png filename", async () => {
    const result = await handler(apiGatewayEvent("--boundary--"));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).filename).toBe("photo.png");
  });
});

describe("handler - successful conversion (pdf to txt)", () => {
  beforeEach(() => {
    mockBusboyImpl = (bb) => {
      bb.emit("field", "targetFormat", "txt");
      const stream = new EventEmitter();
      bb.emit("file", "file", stream, { filename: "doc.pdf", mimeType: "application/pdf" });
      stream.emit("data", Buffer.from("%PDF fake"));
      stream.emit("end");
      bb.emit("finish");
    };
  });

  it("returns 200 with txt filename", async () => {
    const result = await handler(apiGatewayEvent("--boundary--"));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).filename).toBe("doc.txt");
  });
});

describe("handler - unsupported conversion", () => {
  beforeEach(() => {
    mockBusboyImpl = (bb) => {
      bb.emit("field", "targetFormat", "docx");
      const stream = new EventEmitter();
      bb.emit("file", "file", stream, { filename: "image.jpg", mimeType: "image/jpeg" });
      stream.emit("data", Buffer.from("fake-jpeg"));
      stream.emit("end");
      bb.emit("finish");
    };
  });

  it("returns 422 for unsupported conversion pair", async () => {
    const result = await handler(apiGatewayEvent("--boundary--"));
    expect(result.statusCode).toBe(422);
    expect(JSON.parse(result.body).error).toMatch(/not supported/i);
  });
});
