// backend/config/config.js
import dotenv from "dotenv";
dotenv.config();

export const config = {
  mongoUri: process.env.MONGO_URI,
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  },
  aws: {
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || "us-east-1",
  },
  // For frontend to know where to make API calls
  apiEndpoint:
    process.env.NODE_ENV === "production"
      ? process.env.API_GATEWAY_URL // AWS API Gateway URL in production
      : process.env.IS_OFFLINE
      ? `http://localhost:${process.env.BACKEND_PORT_OFFLINE || 3000}` // Local serverless offline
      : "http://localhost:3000", // Default local development
  stage: process.env.STAGE || "dev",
  environment: process.env.NODE_ENV || "development",
};
