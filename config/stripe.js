// backend/config/stripe.js
import Stripe from "stripe";
import { config } from "./config.js";



export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16", // Use latest stable version
});

// Stripe price IDs for subscription tiers
export const STRIPE_PRICE_IDS = {
  "tier-monthly": process.env.STRIPE_PRICE_ID_MONTHLY,
  "tier-quarterly": process.env.STRIPE_PRICE_ID_QUARTERLY,
  "tier-annual": process.env.STRIPE_PRICE_ID_ANNUAL,
};

// Minimum payout amount in USD
export const MINIMUM_PAYOUT_AMOUNT = 25;

// Maximum payout amount in USD
export const MAXIMUM_PAYOUT_AMOUNT = 10000;

// Payout schedule (for automatic payouts)
export const PAYOUT_SCHEDULE = {
  interval: "monthly",
  monthly_anchor: 1, // First day of the month
  delay_days: 7, // Wait 7 days before processing
};

export const STRIPE_PRODUCT_IDS = {
  "tier-monthly": "prod_RcQlCdYXHAN9jN", // Replace with actual Stripe price IDs
  "tier-quarterly": "prod_RcQkHjA4b1Jg5v",
  "tier-annual": "prod_RcQmahQ8jJU3uL",
};

// Commission rates for different subscription tiers
export const COMMISSION_RATES = {
  'tier-monthly': 0.2,  // 20% commission
  'tier-quarterly': 0.25, // 25% commission
  'tier-annual': 0.3,   // 30% commission
};

export const calculateCommission = (tier, amount) => {
  const rate = COMMISSION_RATES[tier] || 0;
  return parseFloat((amount * rate).toFixed(2));
};

// Stripe Connect account types
export const ACCOUNT_TYPES = {
  EXPRESS: 'express',
  STANDARD: 'standard',
  CUSTOM: 'custom'
};

// Minimum payout amounts
export const MIN_PAYOUT_AMOUNT = 50; // $50 minimum payout

// Maximum payout amounts
export const MAX_PAYOUT_AMOUNT = 10000; // $10,000 maximum payout

// Payout frequency options
export const PAYOUT_SCHEDULES = {
  INSTANT: 'instant',
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly'
};

// Default payout schedule
export const DEFAULT_PAYOUT_SCHEDULE = PAYOUT_SCHEDULES.INSTANT;

// Webhook signing secret
export const webhookSecret = config.stripe.webhookSecret;
