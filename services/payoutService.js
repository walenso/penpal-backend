// backend/services/payoutService.js
import { stripe } from "../config/stripe.js";
import User from "../models/User.js";
import {
  MINIMUM_PAYOUT_AMOUNT,
  MAXIMUM_PAYOUT_AMOUNT,
} from "../config/stripe.js";

export async function createPayout(userId, amount) {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // Validate amount
  if (amount < MINIMUM_PAYOUT_AMOUNT || amount > MAXIMUM_PAYOUT_AMOUNT) {
    throw new Error(
      `Payout amount must be between $${MINIMUM_PAYOUT_AMOUNT} and $${MAXIMUM_PAYOUT_AMOUNT}`
    );
  }

  if (amount > user.availableBalance) {
    throw new Error("Insufficient balance");
  }

  if (!user.stripeConnectAccountId || !user.payoutEnabled) {
    throw new Error("Stripe Connect account not properly set up");
  }

  try {
    // Create transfer to connected account
    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100),
      currency: "usd",
      destination: user.stripeConnectAccountId,
      metadata: {
        userId: user._id.toString(),
      },
    });

    // Record payout in user's history
    user.payoutHistory.push({
      amount,
      status: "completed",
      stripeTransferId: transfer.id,
      completedAt: new Date(),
    });

    // Update balances
    user.availableBalance -= amount;
    user.lastPayoutAt = new Date();

    await user.save();

    return {
      success: true,
      transfer,
      remainingBalance: user.availableBalance,
    };
  } catch (error) {
    // Record failed payout attempt
    user.payoutHistory.push({
      amount,
      status: "failed",
      error: error.message,
      failedAt: new Date(),
    });
    await user.save();

    throw error;
  }
}

export async function handleTransferSuccess(transferId) {
  const transfer = await stripe.transfers.retrieve(transferId);
  const user = await User.findById(transfer.metadata.userId);

  if (!user) {
    throw new Error("User not found");
  }

  const payout = user.payoutHistory.find(
    (p) => p.stripeTransferId === transferId && p.status === "pending"
  );

  if (payout) {
    payout.status = "completed";
    payout.completedAt = new Date();
    await user.save();
  }
}

export async function handleTransferFailure(transferId, error) {
  const transfer = await stripe.transfers.retrieve(transferId);
  const user = await User.findById(transfer.metadata.userId);

  if (!user) {
    throw new Error("User not found");
  }

  const payout = user.payoutHistory.find(
    (p) => p.stripeTransferId === transferId && p.status === "pending"
  );

  if (payout) {
    payout.status = "failed";
    payout.error = error.message;
    payout.failedAt = new Date();
    user.availableBalance += payout.amount; // Refund the amount back
    await user.save();
  }
}

export async function getPayoutHistory(userId, limit = 10) {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  return user.payoutHistory
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

export async function getPayoutMetrics(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const totalPayouts = user.payoutHistory.reduce(
    (sum, payout) =>
      payout.status === "completed" ? sum + payout.amount : sum,
    0
  );

  const pendingPayouts = user.payoutHistory.reduce(
    (sum, payout) => (payout.status === "pending" ? sum + payout.amount : sum),
    0
  );

  return {
    availableBalance: user.availableBalance,
    pendingBalance: pendingPayouts,
    totalEarnings: user.totalEarnings,
    totalPayouts,
    lastPayoutAt: user.lastPayoutAt,
    nextScheduledPayoutAt: user.nextScheduledPayoutAt,
  };
}
