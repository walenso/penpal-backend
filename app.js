// backend/app.js
import express from "express";
import cors from "cors";
import serverless from "serverless-http";
import { connectDB } from "./config/database.js";
import { errorHandler } from "./middleware/errorMiddleware.js";
import admin from "firebase-admin";
import { verifyFirebaseUser } from "./middleware/authMiddleware.js";
import {
  syncFirebaseUser,
  updateCustomReferralCode,
  getReferralStats as getUserReferralStats,
} from "./controllers/userController.js";
import {
  validateReferralCode,
  getReferralStats,
  createReferral,
  completeReferral,
  getLeaderboard,
  handleRefund as handleReferralRefund,
} from "./controllers/referralController.js";
import {
  createCheckoutSession,
  handleStripeWebhook,
} from "./controllers/stripeController.js";
import {
  createConnectAccount,
  getPayoutHistory,
  requestPayout,
  getAccountStatus,
} from "./controllers/payoutController.js";
import {
  processRefund,
  fetchRefundHistory,
  fetchRefundMetrics,
  checkRefundEligibility,
  handleRefundWebhook,
} from "./controllers/refundController.js";

import {
  getSubscriptionDetails,
  cancelSubscription,
} from "./controllers/subscriptionController.js";

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
    console.log("Firebase Admin initialized successfully");
  } catch (error) {
    console.error("Firebase Admin initialization error:", error);
  }
}

const app = express();

// Middleware
app.use(cors());
app.post(
  "/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const response = await handleStripeWebhook({
        body: req.body,
        headers: req.headers,
      });
      res.status(response.statusCode).json(JSON.parse(response.body));
    } catch (error) {
      console.error("Stripe webhook error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }
);

app.post(
  "/refunds/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const response = await handleRefundWebhook({
        body: req.body,
      });
      res.status(response.statusCode).json(JSON.parse(response.body));
    } catch (error) {
      console.error("Refund webhook error:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);
app.use(express.json());

// Connect to MongoDB
connectDB();

// Health check route
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// User Routes
app.post("/users/sync", async (req, res) => {
  try {
    const response = await syncFirebaseUser({ body: JSON.stringify(req.body) });
    res.status(response.statusCode).json(JSON.parse(response.body));
  } catch (error) {
    console.error("Sync user error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Custom referral code route
app.put(
  "/users/:userId/custom-referral-code",
  verifyFirebaseUser,
  async (req, res) => {
    try {
      const response = await updateCustomReferralCode({
        pathParameters: { userId: req.params.userId },
        body: JSON.stringify(req.body),
      });
      res.status(response.statusCode).json(JSON.parse(response.body));
    } catch (error) {
      console.error("Update custom referral code error:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// Get user referral stats
app.get(
  "/users/:userId/referral-stats",
  verifyFirebaseUser,
  async (req, res) => {
    try {
      const response = await getUserReferralStats({
        pathParameters: { userId: req.params.userId },
      });
      res.status(response.statusCode).json(JSON.parse(response.body));
    } catch (error) {
      console.error("Get user referral stats error:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// Referral Routes
app.get("/referrals/validate", async (req, res) => {
  try {
    const response = await validateReferralCode({
      queryStringParameters: req.query,
    });
    res.status(response.statusCode).json(JSON.parse(response.body));
  } catch (error) {
    console.error("Validate referral code error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Protected Referral Routes
app.get("/referrals/stats", verifyFirebaseUser, async (req, res) => {
  try {
    const response = await getReferralStats({
      user: req.user,
    });
    res.status(response.statusCode).json(JSON.parse(response.body));
  } catch (error) {
    console.error("Get referral stats error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

app.post("/referrals", verifyFirebaseUser, async (req, res) => {
  try {
    const response = await createReferral({
      body: JSON.stringify(req.body),
      user: req.user,
    });
    res.status(response.statusCode).json(JSON.parse(response.body));
  } catch (error) {
    console.error("Create referral error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

app.post("/referrals/complete", verifyFirebaseUser, async (req, res) => {
  try {
    const response = await completeReferral({
      body: JSON.stringify(req.body),
    });
    res.status(response.statusCode).json(JSON.parse(response.body));
  } catch (error) {
    console.error("Complete referral error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

app.get("/referrals/leaderboard", async (req, res) => {
  try {
    const response = await getLeaderboard({});
    res.status(response.statusCode).json(JSON.parse(response.body));
  } catch (error) {
    console.error("Get leaderboard error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Stripe Payment Routes
// Subscription routes
app.get(
  "/stripe/subscription-details",
  verifyFirebaseUser,
  async (req, res) => {
    try {
      const response = await getSubscriptionDetails({
        user: req.user,
      });
      res.status(response.statusCode).json(JSON.parse(response.body));
    } catch (error) {
      console.error("Error getting subscription details:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

app.post(
  "/stripe/cancel-subscription",
  verifyFirebaseUser,
  async (req, res) => {
    try {
      const response = await cancelSubscription({
        user: req.user,
      });
      res.status(response.statusCode).json(JSON.parse(response.body));
    } catch (error) {
      console.error("Error cancelling subscription:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);
app.post(
  "/stripe/create-checkout-session",
  verifyFirebaseUser,
  async (req, res) => {
    try {
      const response = await createCheckoutSession({
        body: JSON.stringify(req.body),
        user: req.user,
      });
      res.status(response.statusCode).json(JSON.parse(response.body));
    } catch (error) {
      console.error("Create checkout session error:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// Stripe Connect & Payout Routes
app.post(
  "/stripe/create-connect-account",
  verifyFirebaseUser,
  async (req, res) => {
    try {
      const response = await createConnectAccount({
        user: req.user,
      });
      res.status(response.statusCode).json(JSON.parse(response.body));
    } catch (error) {
      console.error("Create connect account error:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

app.get("/stripe/account-status", verifyFirebaseUser, async (req, res) => {
  try {
    const response = await getAccountStatus({ user: req.user });
    res.status(response.statusCode).json(JSON.parse(response.body));
  } catch (error) {
    console.error("Get account status error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/stripe/payout-history", verifyFirebaseUser, async (req, res) => {
  try {
    const response = await getPayoutHistory({
      user: req.user,
    });
    res.status(response.statusCode).json(JSON.parse(response.body));
  } catch (error) {
    console.error("Get payout history error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});
// backend/app.js

// Subscription routes
app.get(
  "/stripe/subscription-details",
  verifyFirebaseUser,
  async (req, res) => {
    try {
      const response = await getSubscriptionDetails({
        user: req.user,
      });
      res.status(response.statusCode).json(JSON.parse(response.body));
    } catch (error) {
      console.error("Error getting subscription details:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

app.post(
  "/stripe/cancel-subscription",
  verifyFirebaseUser,
  async (req, res) => {
    try {
      const response = await cancelSubscription({
        user: req.user,
      });
      res.status(response.statusCode).json(JSON.parse(response.body));
    } catch (error) {
      console.error("Error cancelling subscription:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

app.post("/stripe/request-payout", verifyFirebaseUser, async (req, res) => {
  try {
    const response = await requestPayout({
      body: JSON.stringify(req.body),
      user: req.user,
    });
    res.status(response.statusCode).json(JSON.parse(response.body));
  } catch (error) {
    console.error("Request payout error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Refund Routes
app.post("/refunds/process", verifyFirebaseUser, async (req, res) => {
  try {
    const response = await processRefund({
      body: JSON.stringify(req.body),
      user: req.user,
    });
    res.status(response.statusCode).json(JSON.parse(response.body));
  } catch (error) {
    console.error("Process refund error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

app.get("/refunds/history", verifyFirebaseUser, async (req, res) => {
  try {
    const response = await fetchRefundHistory({
      user: req.user,
    });
    res.status(response.statusCode).json(JSON.parse(response.body));
  } catch (error) {
    console.error("Get refund history error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

app.get("/refunds/metrics", verifyFirebaseUser, async (req, res) => {
  try {
    const response = await fetchRefundMetrics({
      user: req.user,
    });
    res.status(response.statusCode).json(JSON.parse(response.body));
  } catch (error) {
    console.error("Get refund metrics error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

app.get(
  "/refunds/check-eligibility/:referralId",
  verifyFirebaseUser,
  async (req, res) => {
    try {
      const response = await checkRefundEligibility({
        pathParameters: { referralId: req.params.referralId },
      });
      res.status(response.statusCode).json(JSON.parse(response.body));
    } catch (error) {
      console.error("Check refund eligibility error:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// Root route
app.get("/", (req, res) => {
  res.json({
    message: "Penpal API is running",
    port: process.env.PORT || 5000,
  });
});

// Error handling middleware
app.use(errorHandler);

export const server = serverless(app);
