// backend/controllers/subscriptionController.js
import { stripe } from "../config/stripe.js";
import User from "../models/User.js";
import { connectDB } from "../config/database.js";


export const cancelSubscription = async (event) => {
  try {
    await connectDB();
    const user = event.user;

    if (!user.subscription?.stripeSubscriptionId) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          message: "No active subscription found",
        }),
      };
    }

    // Cancel at period end
    const subscription = await stripe.subscriptions.update(
      user.subscription.stripeSubscriptionId,
      { cancel_at_period_end: true }
    );

    // Update user record
    await User.findByIdAndUpdate(user._id, {
      "subscription.cancelAtPeriodEnd": true,
      "subscription.canceledAt": new Date(),
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message:
          "Subscription will be cancelled at the end of the billing period",
        data: {
          cancelAtPeriodEnd: true,
          currentPeriodEnd: subscription.current_period_end,
        },
      }),
    };
  } catch (error) {
    console.error("Error cancelling subscription:", error);
    return {
      statusCode: error.statusCode || 500,
      body: JSON.stringify({
        success: false,
        message: error.message || "Error cancelling subscription",
      }),
    };
  }
};

export const getSubscriptionDetails = async (event) => {
  try {
    await connectDB();
    const user = event.user;

    if (!user.subscription?.stripeSubscriptionId) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          data: {
            status: "inactive",
            hasSubscription: false,
          },
        }),
      };
    }

    const subscription = await stripe.subscriptions.retrieve(
      user.subscription.stripeSubscriptionId
    );

    const price = await stripe.prices.retrieve(
      subscription.items.data[0].price.id
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          hasSubscription: true,
          status: subscription.status,
          currentPeriodEnd: subscription.current_period_end,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          plan: price.nickname || `${price.recurring.interval}ly Plan`,
          amount: price.unit_amount / 100,
          interval: price.recurring.interval,
        },
      }),
    };
  } catch (error) {
    console.error("Error fetching subscription details:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: error.message || "Error fetching subscription details",
      }),
    };
  }
};
