// backend/controllers/testController.js
import { generateReferralCode } from "../utils/referral.js";

export const generateCode = async (req, res) => {
  try {
    // Generate multiple codes to test uniqueness
    const codes = [];
    for (let i = 0; i < 5; i++) {
      const code = await generateReferralCode();
      codes.push(code);
    }

    res.json({
      success: true,
      codes,
    });
  } catch (error) {
    console.error("Error generating codes:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
