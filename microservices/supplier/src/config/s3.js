const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const multer = require("multer");
const path = require("path");

// S3 Configuration
const BUCKET_NAME = process.env.S3_BUCKET || "b2b-marketplace-images";
const REGION = process.env.AWS_REGION || "us-east-1";

const s3Client = new S3Client({ region: REGION });

// Multer config - store in memory before uploading to S3
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPEG, PNG, GIF, and WebP images are allowed"), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  }
});

// Upload file to S3
async function uploadToS3(file) {
  const fileName = `products/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_")}`;

  const params = {
    Bucket: BUCKET_NAME,
    Key: fileName,
    Body: file.buffer,
    ContentType: file.mimetype
  };

  await s3Client.send(new PutObjectCommand(params));

  // Return the public URL
  return `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${fileName}`;
}

// Delete file from S3
async function deleteFromS3(imageUrl) {
  if (!imageUrl || !imageUrl.includes(BUCKET_NAME)) return;

  try {
    const key = imageUrl.split(".amazonaws.com/")[1];
    if (!key) return;

    await s3Client.send(new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    }));
  } catch (err) {
    console.error("[S3] Error deleting image:", err.message);
  }
}

module.exports = { upload, uploadToS3, deleteFromS3, BUCKET_NAME, REGION };
