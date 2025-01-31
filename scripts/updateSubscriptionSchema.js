// backend/scripts/updateSubscriptionSchema.js
import { connectDB } from '../config/database.js';
import User from '../models/User.js';
import { stripe } from '../config/stripe.js';

async function migrateSubscriptions() {
  try {
    await connectDB();
    
    const users = await User.find({
      'subscription.stripeSubscriptionId': { $exists: true }
    });

    for (const user of users) {
      try {
        const subscription = await stripe.subscriptions.retrieve(
          user.subscription.stripeSubscriptionId
        );

        await User.findByIdAndUpdate(user._id, {
          subscription: {
            status: subscription.status,
            tier: subscription.metadata.tierId,
            stripeSubscriptionId: subscription.id,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null
          }
        });

        console.log(`Updated subscription for user: ${user._id}`);
      } catch (error) {
        console.error(`Error updating user ${user._id}:`, error);
      }
    }

    console.log('Migration completed');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrateSubscriptions();