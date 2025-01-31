// backend/controllers/payoutController.js
import { stripe } from "../config/stripe.js";
import User from "../models/User.js";
import { connectDB } from "../config/database.js";
import { MIN_PAYOUT_AMOUNT, MAX_PAYOUT_AMOUNT } from "../config/stripe.js";

export const createConnectAccount = async (event) => {
  try {
    await connectDB();
    const user = event.user;

    if (user.stripeConnectAccountId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "Stripe account already connected",
        }),
      };
    }

    // Create Stripe Connect account with additional verification fields
    const account = await stripe.accounts.create({
      type: "express",
      country: "US",
      email: user.email,
      business_type: "individual",
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
      settings: {
        payouts: {
          schedule: {
            interval: "manual",
          },
        },
      },
      metadata: {
        userId: user._id.toString(),
      },
    });

    // Update user with Connect account ID
    await User.findByIdAndUpdate(user._id, {
      stripeConnectAccountId: account.id,
    });

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.FRONTEND_URL}/dashboard?refresh=true`,
      return_url: `${process.env.FRONTEND_URL}/dashboard?success=true`,
      type: "account_onboarding",
      collect: "eventually_due",
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        url: accountLink.url,
      }),
    };
  } catch (error) {
    console.error("Error creating Connect account:", error);
    return {
      statusCode: error.statusCode || 500,
      body: JSON.stringify({
        success: false,
        message: error.message || "Error creating Stripe Connect account",
      }),
    };
  }
};

export const getPayoutHistory = async (event) => {
  try {
    await connectDB();
    const user = event.user;

    if (!user.stripeConnectAccountId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "Stripe account not connected",
        }),
      };
    }

    // Get transfers from Stripe with expanded data
    const transfers = await stripe.transfers.list({
      destination: user.stripeConnectAccountId,
      limit: 100,
      expand: ["data.balance_transaction"],
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: transfers.data.map((transfer) => ({
          id: transfer.id,
          amount: transfer.amount / 100, // Convert from cents
          status: transfer.status,
          created: transfer.created,
          currency: transfer.currency,
          description: transfer.description,
          fee: transfer.balance_transaction?.fee || 0,
        })),
      }),
    };
  } catch (error) {
    console.error("Error fetching payout history:", error);
    return {
      statusCode: error.statusCode || 500,
      body: JSON.stringify({
        success: false,
        message: "Error fetching payout history",
      }),
    };
  }
};

export const requestPayout = async (event) => {
  try {
    await connectDB();
    const { amount } = JSON.parse(event.body);
    const user = event.user;

    if (!user.stripeConnectAccountId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "Stripe account not connected",
        }),
      };
    }

    // Validate payout amount
    if (amount < MIN_PAYOUT_AMOUNT || amount > MAX_PAYOUT_AMOUNT) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: `Payout amount must be between $${MIN_PAYOUT_AMOUNT} and $${MAX_PAYOUT_AMOUNT}`,
        }),
      };
    }

    if (amount > user.availableBalance) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "Insufficient balance",
        }),
      };
    }

    // Create transfer to connected account
    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: "usd",
      destination: user.stripeConnectAccountId,
      description: "Referral commission payout",
      metadata: {
        userId: user._id.toString(),
      },
    });

    // Update user's available balance
    await User.findByIdAndUpdate(user._id, {
      $inc: {
        availableBalance: -amount,
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        transfer,
      }),
    };
  } catch (error) {
    console.error("Error requesting payout:", error);
    return {
      statusCode: error.statusCode || 500,
      body: JSON.stringify({
        success: false,
        message: error.message || "Error processing payout request",
      }),
    };
  }
};

export const getAccountStatus = async (event) => {
  try {
    await connectDB();
    const user = event.user;

    // If user has no Stripe Connect account
    if (!user.stripeConnectAccountId) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          status: "not_connected",
          details: {
            chargesEnabled: false,
            payoutsEnabled: false,
            requirements: {
              currently_due: [],
              eventually_due: [],
              past_due: [],
            },
          },
        }),
      };
    }

    // Retrieve the connected account from Stripe
    const account = await stripe.accounts.retrieve(user.stripeConnectAccountId);

    // Check if account needs attention
    const needsAttention =
      account.requirements.currently_due.length > 0 ||
      account.requirements.past_due.length > 0;

    // Determine account status
    let status;
    if (!account.details_submitted) {
      status = "pending_submission";
    } else if (needsAttention) {
      status = "pending_verification";
    } else if (!account.payouts_enabled) {
      status = "pending_approval";
    } else {
      status = "active";
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        status,
        details: {
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          requirements: account.requirements,
          detailsSubmitted: account.details_submitted,
          capabilities: account.capabilities,
          payoutSchedule: account.settings?.payouts?.schedule,
          defaultCurrency: account.default_currency,
          businessType: account.business_type,
          businessProfile: account.business_profile,
        },
      }),
    };
  } catch (error) {
    console.error("Error fetching account status:", error);
    return {
      statusCode: error.statusCode || 500,
      body: JSON.stringify({
        success: false,
        message: error.message || "Error fetching account status",
        error: error.type || "unknown_error",
      }),
    };
  }
};
