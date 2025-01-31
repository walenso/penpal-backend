// backend/controllers/stripeController.js
import {
  stripe,
  calculateCommission,
  // STRIPE_PRODUCT_IDS,
} from "../config/stripe.js";
import User from "../models/User.js";
import Referral from "../models/Referral.js";
import { connectDB } from "../config/database.js";

// Map tier IDs to Stripe price IDs
const STRIPE_PRICE_IDS = {
  "tier-monthly": "price_1QjBtpB3CIuKSO25NxPkJnYz", // Replace with your actual monthly price ID
  "tier-quarterly": "price_1QjBsqB3CIuKSO255n1HZyE8", // Replace with your actual quarterly price ID
  "tier-annual": "price_1QjBuZB3CIuKSO25pCzdQDsm", // Replace with your actual annual price ID
};
// backend/controllers/stripeController.js

export const handleStripeWebhook = async (event) => {
  try {
    console.log("⭐️ Webhook received:", {
      headers: event.headers,
      hasBody: !!event.body,
    });

    const rawBody = Buffer.isBuffer(event.body)
      ? event.body.toString("utf8")
      : event.body;

    const sig = event.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let stripeEvent;
    try {
      stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
      console.error("⚠️ Webhook signature verification failed:", err.message);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: err.message }),
      };
    }

    console.log("🎉 Processing webhook event:", {
      type: stripeEvent.type,
      id: stripeEvent.id,
    });

    switch (stripeEvent.type) {
      case "checkout.session.completed":
        const session = stripeEvent.data.object;
        await handleInitialSubscription(session);
        break;

      case "invoice.paid":
        const invoice = stripeEvent.data.object;
        if (invoice.billing_reason === "subscription_create") {
          console.log("💰 Processing initial subscription payment");
          await handlePaidInvoice(invoice);
        } else {
          console.log("📝 Skipping recurring payment");
        }
        break;
      case "customer.subscription.created":
        console.log("The customer.subscription.created completed");
      // case "customer.subscription.updated":
      //   await handleSubscriptionUpdate(stripeEvent.data.object);
      //   break;

      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionChange(stripeEvent.data.object);
        break;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ received: true }),
    };
  } catch (error) {
    console.error("❌ Webhook Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
async function handleSubscriptionUpdate(subscription) {
  const user = await User.findOne({
    "subscription.stripeSubscriptionId": subscription.id,
  });

  if (!user) return;

  await User.findByIdAndUpdate(user._id, {
    "subscription.status": subscription.status,
    "subscription.currentPeriodEnd": new Date(
      subscription.current_period_end * 1000
    ),
    "subscription.cancelAtPeriodEnd": subscription.cancel_at_period_end,
  });
}

async function handleInitialSubscription(session) {
  try {
    await connectDB();
    console.log("🔄 Processing initial subscription:", {
      metadata: session.metadata,
      customer: session.customer,
    });

    const { userId, tierId } = session.metadata;
    if (!userId || !tierId) {
      console.error("Missing metadata:", session.metadata);
      return;
    }

    // Update user's subscription status
    await User.findByIdAndUpdate(userId, {
      "subscription.status": "active",
      "subscription.tier": tierId,
      "subscription.stripeSubscriptionId": session.subscription,
      "subscription.currentPeriodEnd": new Date(
        session.current_period_end * 1000
      ),
    });

    console.log("✅ Updated user subscription:", {
      userId,
      tier: tierId,
    });
  } catch (error) {
    console.error("❌ Error in handleInitialSubscription:", error);
    throw error;
  }
}

async function handlePaidInvoice(invoice) {
  try {
    await connectDB();
    console.log("💳 Processing paid invoice:", {
      id: invoice.id,
      amount: invoice.amount_paid,
      subscription: invoice.subscription,
    });

    // Get subscription to access metadata
    const subscription = await stripe.subscriptions.retrieve(
      invoice.subscription
    );
    console.log("📋 Subscription metadata:", subscription.metadata);

    const { metadata } = subscription;
    if (!metadata?.referralCode) {
      console.log("ℹ️ No referral code found, skipping commission");
      return;
    }

    // Check if we've already processed this invoice
    const existingReferral = await Referral.findOne({
      stripePaymentIntentId: invoice.payment_intent,
    });

    if (existingReferral) {
      console.log("⚠️ Referral already processed for this payment");
      return;
    }

    // Find referrer
    const referrer = await User.findOne({
      $or: [
        { referralCode: metadata.referralCode },
        { customReferralCode: metadata.referralCode },
      ],
    });

    if (!referrer) {
      console.error("❌ Referrer not found:", metadata.referralCode);
      return;
    }

    console.log("👤 Found referrer:", {
      id: referrer._id,
      email: referrer.email,
    });

    // Calculate commission
    const amount = invoice.amount_paid / 100;
    const commission = calculateCommission(metadata.tierId, amount);

    console.log("💰 Calculated commission:", {
      amount,
      commission,
      tier: metadata.tierId,
    });

    // Create referral record
    const referral = await Referral.create({
      referrerId: referrer._id,
      referredUserId: metadata.userId,
      referralCode: metadata.referralCode,
      subscriptionTier: metadata.tierId,
      subscriptionAmount: amount,
      commissionAmount: commission,
      status: "completed",
      stripePaymentIntentId: invoice.payment_intent,
      completedAt: new Date(),
    });

    console.log("✅ Created referral record:", referral._id);

    // Update referrer stats and balance
    const updatedReferrer = await User.findByIdAndUpdate(
      referrer._id,
      {
        $inc: {
          "referralStats.totalReferrals": 1,
          "referralStats.successfulReferrals": 1,
          availableBalance: commission,
          totalEarnings: commission,
        },
      },
      { new: true }
    );

    console.log("🎉 Updated referrer stats:", {
      id: referrer._id,
      newStats: updatedReferrer.referralStats,
      newBalance: updatedReferrer.availableBalance,
    });
  } catch (error) {
    console.error("❌ Error processing paid invoice:", error.stack);
    throw error;
  }
}

async function handleSubscriptionChange(subscription) {
  try {
    await connectDB();
    const user = await User.findOne({
      "subscription.stripeSubscriptionId": subscription.id,
    });

    if (!user) return;

    const updateData = {
      "subscription.status": subscription.status,
      "subscription.currentPeriodEnd": new Date(
        subscription.current_period_end * 1000
      ),
      "subscription.cancelAtPeriodEnd": subscription.cancel_at_period_end,
    };

    if (subscription.canceled_at) {
      updateData["subscription.canceledAt"] = new Date(
        subscription.canceled_at * 1000
      );
    }

    await User.findByIdAndUpdate(user._id, updateData);
  } catch (error) {
    console.error("❌ Error in handleSubscriptionChange:", error);
    throw error;
  }
}

// Update createCheckoutSession to include metadata in subscription_data
export const createCheckoutSession = async (event) => {
  try {
    await connectDB();
    const { tierId, referralCode } = JSON.parse(event.body);
    const user = event.user;

    console.log("🛍️ Creating checkout session:", {
      tierId,
      referralCode,
      userId: user._id,
    });

    // Get the Stripe price ID for the selected tier
    const priceId = STRIPE_PRICE_IDS[tierId];
    if (!priceId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "Invalid subscription tier",
        }),
      };
    }

    // Create or retrieve Stripe customer
    let customer;
    if (!user.stripeCustomerId) {
      customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: user._id.toString(),
        },
      });

      await User.findByIdAndUpdate(user._id, {
        stripeCustomerId: customer.id,
      });
    } else {
      customer = await stripe.customers.retrieve(user.stripeCustomerId);
    }

    const metadata = {
      userId: user._id.toString(),
      tierId,
      referralCode: referralCode || "",
    };

    // Create checkout session with metadata in both places
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${process.env.FRONTEND_URL}/dashboard?success=true`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing?canceled=true`,
      metadata,
      subscription_data: {
        metadata, // Include metadata in subscription too
      },
      allow_promotion_codes: true,
    });

    console.log("✨ Created checkout session:", {
      id: session.id,
      metadata: session.metadata,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        url: session.url,
      }),
    };
  } catch (error) {
    console.error("❌ Error creating checkout session:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: error.message || "Error creating checkout session",
      }),
    };
  }
};

async function handleCanceledSubscription(subscription) {
  const user = await User.findOne({
    "subscription.stripeSubscriptionId": subscription.id,
  });

  if (user) {
    await User.findByIdAndUpdate(user._id, {
      "subscription.status": "canceled",
    });
  }
}

async function handleSubscriptionCancellation(subscription) {
  const user = await User.findOne({
    "subscription.stripeSubscriptionId": subscription.id,
  });

  if (!user) return;

  await User.findByIdAndUpdate(user._id, {
    "subscription.status": "canceled",
    "subscription.canceledAt": new Date(),
  });
}
