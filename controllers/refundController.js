// backend/controllers/refundController.js
import {
  handleRefundRequest,
  getRefundHistory,
  getRefundMetrics,
  isRefundEligible,
} from "../services/refundService.js";
import { connectDB } from "../config/database.js";

export const processRefund = async (event) => {
  try {
    await connectDB();
    const { paymentIntentId } = JSON.parse(event.body);

    const result = await handleRefundRequest(paymentIntentId);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: result,
      }),
    };
  } catch (error) {
    console.error("Refund processing error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: error.message || "Error processing refund",
      }),
    };
  }
};

export const fetchRefundHistory = async (event) => {
  try {
    await connectDB();
    const userId = event.user._id;

    const refunds = await getRefundHistory(userId);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: refunds,
      }),
    };
  } catch (error) {
    console.error("Error fetching refund history:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Error fetching refund history",
      }),
    };
  }
};

export const fetchRefundMetrics = async (event) => {
  try {
    await connectDB();
    const userId = event.user._id;

    const metrics = await getRefundMetrics(userId);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: metrics,
      }),
    };
  } catch (error) {
    console.error("Error fetching refund metrics:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Error fetching refund metrics",
      }),
    };
  }
};

export const checkRefundEligibility = async (event) => {
  try {
    await connectDB();
    const { referralId } = event.pathParameters;

    const eligibility = await isRefundEligible(referralId);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: eligibility,
      }),
    };
  } catch (error) {
    console.error("Error checking refund eligibility:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Error checking refund eligibility",
      }),
    };
  }
};

// Handle Stripe webhook events related to refunds
export const handleRefundWebhook = async (event) => {
  try {
    await connectDB();
    const { type, data } = JSON.parse(event.body);

    switch (type) {
      case "charge.refunded":
        await handleRefundRequest(data.object.payment_intent);
        break;

      case "charge.refund.updated":
        // Handle refund status updates
        break;

      default:
        console.log(`Unhandled refund webhook event: ${type}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ received: true }),
    };
  } catch (error) {
    console.error("Refund webhook error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Error processing refund webhook",
      }),
    };
  }
};
