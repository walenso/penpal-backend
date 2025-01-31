// backend/services/refundService.js
import { stripe } from "../config/stripe.js";
import User from "../models/User.js";
import Referral from "../models/Referral.js";

export const handleRefundRequest = async (paymentIntentId) => {
  try {
    // Find the referral by payment intent ID
    const referral = await Referral.findOne({
      stripePaymentIntentId: paymentIntentId,
    }).populate("referrerId");

    if (!referral) {
      throw new Error("Referral not found");
    }

    // Check if referral is already refunded
    if (referral.status === "refunded") {
      throw new Error("Referral already refunded");
    }

    // Create refund in Stripe
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
    });

    // Update referral status
    referral.status = "refunded";
    referral.refundedAt = new Date();
    await referral.save();

    // Adjust referrer's balance and stats
    if (referral.referrerId) {
      await User.findByIdAndUpdate(referral.referrerId, {
        $inc: {
          availableBalance: -referral.commissionAmount,
          totalEarnings: -referral.commissionAmount,
          "referralStats.successfulReferrals": -1,
        },
      });

      // Recalculate conversion rate
      const referrer = await User.findById(referral.referrerId);
      const conversionRate =
        (referrer.referralStats.successfulReferrals /
          referrer.referralStats.totalReferrals) *
        100;

      await User.findByIdAndUpdate(referral.referrerId, {
        "referralStats.conversionRate": parseFloat(conversionRate.toFixed(2)),
      });
    }

    return {
      success: true,
      refund,
      referral,
    };
  } catch (error) {
    console.error("Refund handling error:", error);
    throw error;
  }
};

export const getRefundHistory = async (userId) => {
  try {
    const refunds = await Referral.find({
      referrerId: userId,
      status: "refunded",
    })
      .sort({ refundedAt: -1 })
      .populate("referredUser", "firstName lastName email");

    return refunds;
  } catch (error) {
    console.error("Error fetching refund history:", error);
    throw error;
  }
};

export const getRefundMetrics = async (userId) => {
  try {
    const refunds = await Referral.find({
      referrerId: userId,
      status: "refunded",
    });

    const totalReferrals = await Referral.countDocuments({
      referrerId: userId,
    });

    const totalRefundAmount = refunds.reduce(
      (sum, refund) => sum + refund.commissionAmount,
      0
    );

    const refundRate =
      totalReferrals > 0 ? (refunds.length / totalReferrals) * 100 : 0;

    const monthlyRefunds = await Referral.aggregate([
      {
        $match: {
          referrerId: userId,
          status: "refunded",
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$refundedAt" },
            month: { $month: "$refundedAt" },
          },
          count: { $sum: 1 },
          amount: { $sum: "$commissionAmount" },
        },
      },
      {
        $sort: {
          "_id.year": -1,
          "_id.month": -1,
        },
      },
    ]);

    return {
      totalRefunds: refunds.length,
      totalRefundAmount,
      refundRate: parseFloat(refundRate.toFixed(2)),
      monthlyRefunds,
      averageRefundAmount:
        refunds.length > 0 ? totalRefundAmount / refunds.length : 0,
    };
  } catch (error) {
    console.error("Error calculating refund metrics:", error);
    throw error;
  }
};

export const isRefundEligible = async (referralId) => {
  try {
    const referral = await Referral.findById(referralId);

    if (!referral) {
      throw new Error("Referral not found");
    }

    // Check if the referral is completed and within refund window (e.g., 30 days)
    const isWithinRefundWindow =
      referral.status === "completed" &&
      (new Date() - new Date(referral.completedAt)) / (1000 * 60 * 60 * 24) <=
        30;

    return {
      eligible: isWithinRefundWindow,
      reason: isWithinRefundWindow
        ? null
        : "Refund window has expired or referral is not completed",
    };
  } catch (error) {
    console.error("Error checking refund eligibility:", error);
    throw error;
  }
};
