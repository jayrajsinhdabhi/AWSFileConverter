import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { PDFDocument } from 'pdf-lib';
// Note: You will need to npm install sharp and re-zip your project
import sharp from 'sharp'; 

const s3 = new S3Client();

export const handler = async (event) => {
    const bucket = event.Records[0].s3.bucket.name;
    const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
    
    if (key.includes('converted/')) return;

    try {
        const { Body, ContentType } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const inputBytes = await Body.transformToByteArray();
        
        let outputBuffer;
        let targetExtension = "pdf"; // Default

        // LOGIC: Check what the user wants based on the input
        // For a true "Level 5" app, we would pass the target format from the frontend 
        // using S3 Metadata, but for now, let's detect by extension:
        
        if (key.toLowerCase().endsWith('.png') || key.toLowerCase().endsWith('.jpg') || key.toLowerCase().endsWith('.jpeg')) {
            // IMAGE TO PDF (Existing)
            const pdfDoc = await PDFDocument.create();
            const image = key.toLowerCase().endsWith('.png') ? await pdfDoc.embedPng(inputBytes) : await pdfDoc.embedJpg(inputBytes);
            const page = pdfDoc.addPage([image.width, image.height]);
            page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
            outputBuffer = await pdfDoc.save();
        } 
        
        // CLEAN FILENAME LOGIC
        let fileName = key.split('/').pop().replace(/^\d+-/, ""); 
        const newKey = `converted/${fileName.replace(/\.[^/.]+$/, `.${targetExtension}`)}`;

        await s3.send(new PutObjectCommand({
            Bucket: bucket,
            Key: newKey,
            Body: outputBuffer,
            ContentType: targetExtension === "pdf" ? "application/pdf" : "image/jpeg"
        }));

        return { statusCode: 200 };
    } catch (error) {
        console.error("Error:", error);
        throw error;
    }
};
