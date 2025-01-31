// backend/middleware/authMiddleware.js
import admin from "firebase-admin";
import User from "../models/User.js";

// Firebase token verification middleware
export const verifyFirebaseUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const token = authHeader.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(token);

    // Find user in MongoDB
    const user = await User.findOne({ firebaseUid: decodedToken.uid });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found in database",
      });
    }

    // Add user info to request object
    req.user = user;
    req.firebaseUid = decodedToken.uid;

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
      error: error.message,
    });
  }
};

// Admin check middleware
export const isAdmin = async (req, res, next) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Admin privileges required",
      });
    }
    next();
  } catch (error) {
    console.error("Admin check error:", error);
    return res.status(500).json({
      success: false,
      message: "Error checking admin status",
      error: error.message,
    });
  }
};

// Combined middleware for protected admin routes
export const verifyAdminUser = [verifyFirebaseUser, isAdmin];
