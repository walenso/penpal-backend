// backend/controllers/userController.js
import { generateReferralCode } from "../utils/referral.js";
import { connectDB } from "../config/database.js";
import User from "../models/User.js";

export const syncFirebaseUser = async (event) => {
  try {
    await connectDB();
    const body = JSON.parse(event.body);
    const { firebaseUid, email, firstName, lastName } = body;

    // First try to find user by firebaseUid or email
    let user = await User.findOne({
      $or: [{ firebaseUid }, { email }],
    });

    if (user) {
      // Update existing user with new information
      const updates = {
        firebaseUid,
        email,
        ...(firstName && { firstName }), // Only update if firstName is provided
        ...(lastName && { lastName }), // Only update if lastName is provided
        // Update first profile in profiles array if it exists
        ...(user.profiles &&
          user.profiles.length > 0 && {
            "profiles.0.firstName": firstName,
            "profiles.0.lastName": lastName,
            "profiles.0.email": email,
          }),
      };

      user = await User.findOneAndUpdate({ _id: user._id }, updates, {
        new: true,
        runValidators: true,
      });

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: "User updated successfully",
          data: user,
        }),
      };
    }

    // If no user exists, create new one
    try {
      const referralCode = await generateReferralCode();
      const newUser = await User.create({
        firebaseUid,
        email,
        firstName,
        lastName,
        referralCode,
        isVerified: false,
        profiles: [
          {
            firstName,
            lastName,
            email,
          },
        ],
        referralStats: {
          totalReferrals: 0,
          successfulReferrals: 0,
          conversionRate: 0,
        },
      });

      return {
        statusCode: 201,
        body: JSON.stringify({
          success: true,
          message: "User created successfully",
          data: newUser,
        }),
      };
    } catch (createError) {
      if (createError.code === 11000) {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          // Update the existing user's information
          const updates = {
            firebaseUid,
            ...(firstName && { firstName }),
            ...(lastName && { lastName }),
            ...(existingUser.profiles &&
              existingUser.profiles.length > 0 && {
                "profiles.0.firstName": firstName,
                "profiles.0.lastName": lastName,
                "profiles.0.email": email,
              }),
          };

          const updatedUser = await User.findOneAndUpdate(
            { _id: existingUser._id },
            updates,
            { new: true }
          );

          return {
            statusCode: 200,
            body: JSON.stringify({
              success: true,
              message: "User information updated",
              data: updatedUser,
            }),
          };
        }
      }
      throw createError;
    }
  } catch (error) {
    if (error.code !== 11000) {
      console.error("Error in syncFirebaseUser:", error);
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Error syncing user with database",
        error: error.message,
      }),
    };
  }
};

export const getReferralStats = async (event) => {
  try {
    await connectDB();
    const { userId } = event.pathParameters;

    const user = await User.findById(userId);
    if (!user) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          message: "User not found",
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          referralCode: user.referralCode,
          customReferralCode: user.customReferralCode,
          referralStats: user.referralStats,
          availableBalance: user.availableBalance,
          totalEarnings: user.totalEarnings,
        },
      }),
    };
  } catch (error) {
    console.error("Error fetching referral stats:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Error fetching referral statistics",
        error: error.message,
      }),
    };
  }
};

export const updateCustomReferralCode = async (event) => {
  try {
    await connectDB();
    const { userId } = event.pathParameters;
    const { customCode } = JSON.parse(event.body);

    // Validate custom code format
    const codeRegex = /^[A-Za-z0-9-_]{4,20}$/;
    if (!codeRegex.test(customCode)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message:
            "Invalid custom code format. Use 4-20 alphanumeric characters, hyphens, or underscores.",
        }),
      };
    }

    // Check if code is already taken
    const existingUser = await User.findOne({
      customReferralCode: customCode.toUpperCase(),
      _id: { $ne: userId },
    });

    if (existingUser) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "This custom code is already taken",
        }),
      };
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { customReferralCode: customCode.toUpperCase() },
      { new: true }
    );

    if (!user) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          message: "User not found",
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Custom referral code updated successfully",
        data: {
          referralCode: user.referralCode,
          customReferralCode: user.customReferralCode,
        },
      }),
    };
  } catch (error) {
    console.error("Error updating custom code:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Error updating custom referral code",
        error: error.message,
      }),
    };
  }
};
