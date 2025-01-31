// backend/controllers/referralController.js
import User from '../models/User.js';
import Referral from '../models/Referral.js';
import { connectDB } from '../config/database.js';

export const getReferralStats = async (event) => {
  try {
    await connectDB();

    // First, find the user by firebaseUid
    const firebaseUid = event.user?.firebaseUid;
    if (!firebaseUid) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          success: false,
          message: 'User not authenticated'
        })
      };
    }

    const user = await User.findOne({ firebaseUid });
    if (!user) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          message: 'User not found'
        })
      };
    }

    // Get referrals and other stats
    const [referrals, pendingCommissions] = await Promise.all([
      Referral.find({ referrerId: user._id })
        .sort({ createdAt: -1 })
        .populate('referredUser', 'firstName lastName email'),
      Referral.aggregate([
        {
          $match: {
            referrerId: user._id,
            status: 'pending'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$commissionAmount' }
          }
        }
      ])
    ]);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          referrals,
          stats: user.referralStats || {
            totalReferrals: 0,
            successfulReferrals: 0,
            conversionRate: 0
          },
          pendingCommissions: pendingCommissions[0]?.total || 0,
          availableBalance: user.availableBalance || 0,
          totalEarnings: user.totalEarnings || 0
        }
      })
    };
  } catch (error) {
    console.error('Error fetching referral stats:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: 'Error fetching referral statistics',
        error: error.message
      })
    };
  }
};

export const validateReferralCode = async (event) => {
  try {
    await connectDB();
    const { referralCode } = event.queryStringParameters || {};

    if (!referralCode) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: 'Referral code is required'
        })
      };
    }

    const referrer = await User.findOne({
      $or: [
        { referralCode },
        { customReferralCode: referralCode }
      ]
    });

    if (!referrer) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          message: 'Invalid referral code'
        })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          referrerId: referrer._id,
          referrerName: `${referrer.firstName} ${referrer.lastName}`
        }
      })
    };
  } catch (error) {
    console.error('Error validating referral code:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: 'Error validating referral code',
        error: error.message
      })
    };
  }
};



export const completeReferral = async (event) => {
  try {
    await connectDB();
    const { referralId, paymentIntentId } = JSON.parse(event.body);

    const referral = await Referral.findById(referralId);
    if (!referral) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          message: "Referral not found",
        }),
      };
    }

    // Update referral status
    referral.status = "completed";
    referral.stripePaymentIntentId = paymentIntentId;
    referral.completedAt = new Date();
    await referral.save();

    // Update referrer stats and balance
    await User.findByIdAndUpdate(referral.referrerId, {
      $inc: {
        "referralStats.successfulReferrals": 1,
        availableBalance: referral.commissionAmount,
        totalEarnings: referral.commissionAmount,
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

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Referral completed successfully",
        data: referral,
      }),
    };
  } catch (error) {
    console.error("Error completing referral:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Error completing referral",
        error: error.message,
      }),
    };
  }
};

export const handleRefund = async (event) => {
  try {
    await connectDB();
    const { paymentIntentId } = JSON.parse(event.body);

    const referral = await Referral.findOne({
      stripePaymentIntentId: paymentIntentId,
    });
    if (!referral) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          message: "Referral not found",
        }),
      };
    }

    // Update referral status
    referral.status = "refunded";
    referral.refundedAt = new Date();
    await referral.save();

    // Update referrer balance and stats
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

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Refund processed successfully",
        data: referral,
      }),
    };
  } catch (error) {
    console.error("Error processing refund:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Error processing refund",
        error: error.message,
      }),
    };
  }
};

export const createReferral = async (event) => {
  try {
    await connectDB();
    const { referralCode, subscriptionTier, subscriptionAmount } = JSON.parse(
      event.body
    );

    // Find referrer by referral code
    const referrer = await User.findOne({
      $or: [{ referralCode }, { customReferralCode: referralCode }],
    });

    if (!referrer) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          message: "Invalid referral code",
        }),
      };
    }

    // Get the referred user from the auth context
    const referredUserId = event.user._id;

    // Check if user is trying to refer themselves
    if (referrer._id.toString() === referredUserId.toString()) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "Cannot refer yourself",
        }),
      };
    }

    // Check if this user has already been referred
    const existingReferral = await Referral.findOne({ referredUserId });
    if (existingReferral) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "User has already been referred",
        }),
      };
    }

    // Calculate commission
    const commissionAmount = Referral.calculateCommission(
      subscriptionTier,
      subscriptionAmount
    );

    // Create referral record
    const referral = await Referral.create({
      referrerId: referrer._id,
      referredUserId,
      referralCode,
      subscriptionTier,
      subscriptionAmount,
      commissionAmount,
      status: "pending",
    });

    // Update referrer's stats
    await User.findByIdAndUpdate(referrer._id, {
      $inc: {
        "referralStats.totalReferrals": 1,
      },
    });

    return {
      statusCode: 201,
      body: JSON.stringify({
        success: true,
        message: "Referral created successfully",
        data: referral,
      }),
    };
  } catch (error) {
    console.error("Error creating referral:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Error creating referral",
        error: error.message,
      }),
    };
  }
};


export const getLeaderboard = async (event) => {
  try {
    await connectDB();

    const topReferrers = await User.aggregate([
      {
        $match: {
          "referralStats.totalReferrals": { $gt: 0 },
        },
      },
      {
        $sort: {
          "referralStats.successfulReferrals": -1,
          "referralStats.conversionRate": -1,
        },
      },
      {
        $limit: 10,
      },
      {
        $project: {
          firstName: 1,
          lastName: 1,
          referralStats: 1,
          totalEarnings: 1,
        },
      },
    ]);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: topReferrers,
      }),
    };
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Error fetching leaderboard",
        error: error.message,
      }),
    };
  }
};
