// backend/models/Referral.js
import mongoose from "mongoose";

// Define commission rates for different subscription tiers
export const COMMISSION_RATES = {
  "tier-monthly": 0.2, // 20% commission for monthly subscriptions
  "tier-quarterly": 0.25, // 25% commission for quarterly subscriptions
  "tier-annual": 0.3, // 30% commission for annual subscriptions
};

const referralSchema = new mongoose.Schema(
  {
    referrerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    referredUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    referralCode: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "pending",
    },
    subscriptionTier: {
      type: String,
      required: true,
      enum: Object.keys(COMMISSION_RATES),
    },
    subscriptionAmount: {
      type: Number,
      required: true,
    },
    commissionAmount: {
      type: Number,
      required: true,
    },
    stripePaymentIntentId: String,
    completedAt: Date,
    refundedAt: Date,
    failedAt: Date,
    failureReason: String,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Calculate commission amount based on subscription tier and amount
referralSchema.statics.calculateCommission = function (tier, amount) {
  const rate = COMMISSION_RATES[tier] || 0;
  return parseFloat((amount * rate).toFixed(2));
};

// Virtual populate referrer and referred user
referralSchema.virtual("referrer", {
  ref: "User",
  localField: "referrerId",
  foreignField: "_id",
  justOne: true,
});

referralSchema.virtual("referredUser", {
  ref: "User",
  localField: "referredUserId",
  foreignField: "_id",
  justOne: true,
});

// Index for efficient queries
referralSchema.index({ referralCode: 1 });
referralSchema.index({ referrerId: 1, status: 1 });
referralSchema.index({ stripePaymentIntentId: 1 });

const Referral = mongoose.model("Referral", referralSchema);

export default Referral;
