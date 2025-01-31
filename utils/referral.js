// backend/utils/referral.js
import { nanoid, customAlphabet } from "nanoid";
// In any file that needs the User model
import User from "../models/User.js";

// Create a custom nanoid with only uppercase letters and numbers
const generateCode = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 8);

export const generateReferralCode = async () => {
  let code;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 5;

  while (!isUnique && attempts < maxAttempts) {
    code = generateCode();
    // Check if code exists
    const existingUser = await User.findOne({
      $or: [{ referralCode: code }, { customReferralCode: code }],
    });

    if (!existingUser) {
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    // If we couldn't generate a unique code with our preferred format,
    // fall back to a longer, guaranteed-unique nanoid
    code = nanoid(12);
  }

  return code;
};
