import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { PDFDocument } from "pdf-lib";

const s3 = new S3Client();

export const handler = async (event) => {
  const bucket = event.Records[0].s3.bucket.name;
  const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));

  if (key.startsWith("converted/")) return { statusCode: 200 };

  const isPng = key.toLowerCase().endsWith(".png");
  const isJpg = key.toLowerCase().endsWith(".jpg") || key.toLowerCase().endsWith(".jpeg");

  if (!isPng && !isJpg) {
    throw new Error("Only PNG/JPG image inputs are supported for conversion to PDF.");
  }

  try {
    const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const inputBytes = await Body.transformToByteArray();

    const pdfDoc = await PDFDocument.create();
    const image = isPng ? await pdfDoc.embedPng(inputBytes) : await pdfDoc.embedJpg(inputBytes);
    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });

    const outputBuffer = await pdfDoc.save();
    const sourceFileName = key.split("/").pop();
    const newKey = `converted/${sourceFileName.replace(/\.[^/.]+$/, ".pdf")}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: newKey,
        Body: outputBuffer,
        ContentType: "application/pdf",
      }),
    );

    return { statusCode: 200 };
  } catch (error) {
    console.error("Conversion error:", error);
    throw error;
  }
};
