// backend/controllers/authController.js
import User from "../models/User.js";
import { auth } from "../config/firebase.js";

import { generateReferralCode } from "../utils/referral.js";

export const login = async (req, res) => {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decodedToken = await auth.verifyIdToken(token);
    let user = await User.findOne({ firebaseUid: decodedToken.uid });

    if (!user) {
      // Create new user in MongoDB if they don't exist
      user = await User.create({
        email: decodedToken.email,
        firebaseUid: decodedToken.uid,
        firstName: decodedToken.name || "",
        lastName: "",
        isVerified: decodedToken.email_verified,
        referralCode: await generateReferralCode(),
      });
    }

    res.json({
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        referralCode: user.referralCode,
        isVerified: user.isVerified,
        referralStats: user.referralStats,
        availableBalance: user.availableBalance,
        totalEarnings: user.totalEarnings,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(401).json({
      message: "Authentication failed",
      error: error.message,
    });
  }
};

export const register = async (req, res) => {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decodedToken = await auth.verifyIdToken(token);
    const { firstName, lastName } = req.body;

    let user = await User.findOne({ firebaseUid: decodedToken.uid });
    if (user) {
      return res.status(400).json({ message: "User already exists" });
    }

    user = await User.create({
      email: decodedToken.email,
      firebaseUid: decodedToken.uid,
      firstName,
      lastName,
      isVerified: decodedToken.email_verified,
      referralCode: await generateReferralCode(),
    });

    res.json({
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        referralCode: user.referralCode,
        isVerified: user.isVerified,
        referralStats: user.referralStats,
        availableBalance: user.availableBalance,
        totalEarnings: user.totalEarnings,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Failed to create user" });
  }
};

export const getUser = async (req, res) => {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decodedToken = await auth.verifyIdToken(token);
    const user = await User.findOne({ firebaseUid: decodedToken.uid });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        referralCode: user.referralCode,
        isVerified: user.isVerified,
        referralStats: user.referralStats,
        availableBalance: user.availableBalance,
        totalEarnings: user.totalEarnings,
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(401).json({ message: "Authentication failed" });
  }
};
