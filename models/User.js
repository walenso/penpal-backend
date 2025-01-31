// backend/models/User.js
import mongoose from "mongoose";

const payoutHistorySchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "usd",
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },
    stripeTransferId: String,
    error: String,
    completedAt: Date,
    failedAt: Date,
  },
  { timestamps: true }
);
const profileSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  imageUrl: String,
  email: String,
  phone: String,
  college: String,
  level: String,
  role: String,
  company: String,
  linkedIn: String,
  x: String,
  github: String,
  portfolio: String,
  headline: String,
});

const subscriptionSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ["inactive", "active", "canceled", "past_due"],
    default: "inactive",
  },
  tier: {
    type: String,
    enum: ["tier-monthly", "tier-quarterly", "tier-annual"],
    sparse: true,
  },
  stripeSubscriptionId: {
    type: String,
    sparse: true,
  },
  currentPeriodEnd: Date,
  cancelAtPeriodEnd: {
    type: Boolean,
    default: false,
  },
  canceledAt: Date,
});

const userSchema = new mongoose.Schema(
  {
    cardId: {
      type: String,
      unique: true,
      sparse: true,
    },
    firstName: String,
    lastName: String,
    email: {
      type: String,
      required: true,
      unique: true,
    },
    phone: String,
    college: String,
    isAdmin: {
      type: Boolean,
      default: false,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    firebaseUid: {
      type: String,
      unique: true,
      required: true,
    },
    contacts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    profiles: [profileSchema],
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    customReferralCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    stripeCustomerId: String,

    subscription: subscriptionSchema,
    availableBalance: {
      type: Number,
      default: 0,
    },

    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      sparse: true,
    },
    referralStats: {
      totalReferrals: { type: Number, default: 0 },
      successfulReferrals: { type: Number, default: 0 },
      conversionRate: { type: Number, default: 0 },
    },
    profileVisits: {
      date: String,
      timeframe: String,
      data: [mongoose.Schema.Types.Mixed],
    },
    // Stripe Connect fields
    stripeConnectAccountId: {
      type: String,
      sparse: true,
    },
    stripeConnectOnboardingComplete: {
      type: Boolean,
      default: false,
    },
    payoutEnabled: {
      type: Boolean,
      default: false,
    },
    payoutSchedule: {
      type: String,
      enum: ["manual", "automatic"],
      default: "manual",
    },
    minimumPayoutAmount: {
      type: Number,
      default: 25,
    },
    availableBalance: {
      type: Number,
      default: 0,
    },
    pendingBalance: {
      type: Number,
      default: 0,
    },
    totalEarnings: {
      type: Number,
      default: 0,
    },
    lastPayoutAt: Date,
    nextScheduledPayoutAt: Date,
    payoutHistory: [payoutHistorySchema],
  },
  {
    timestamps: true,
  }
);

// Add index for stripe account lookup
userSchema.index({ stripeConnectAccountId: 1 });

// Method to check if user can request payout
userSchema.methods.canRequestPayout = function (amount) {
  if (!this.stripeConnectAccountId || !this.payoutEnabled) {
    return false;
  }
  if (amount < this.minimumPayoutAmount) {
    return false;
  }
  if (amount > this.availableBalance) {
    return false;
  }
  return true;
};

// Method to process payout
userSchema.methods.processPayout = async function (amount) {
  if (!this.canRequestPayout(amount)) {
    throw new Error("Cannot process payout at this time");
  }

  const payout = {
    amount,
    status: "pending",
  };

  this.payoutHistory.push(payout);
  this.availableBalance -= amount;
  this.lastPayoutAt = new Date();

  return this.save();
};

const User = mongoose.model("User", userSchema);

export default User;
