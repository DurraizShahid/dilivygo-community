# Customer app — Google Play Store metadata

## Title (30 chars)
Dilivygo: Local Food Delivery

## Short description (80 chars)
Order food, groceries, and essentials from local merchants in your neighbourhood.

## Full description (4000 chars)
Dilivygo is the fastest way to order food, groceries, and everyday essentials from local merchants near you.

WHY DILIVYGO
• Browse menus and shop catalogs from independent local merchants in your area.
• Tap to add items to your cart, customise with options and add-ons, and check out securely with Google Pay or your card.
• Watch your rider on a live map from kitchen to doorstep with realtime status updates.
• Save your favourite restaurants and reorder past meals in one tap.
• Chat with the merchant or your delivery rider directly from inside the app.
• Get notified the moment your order is accepted, ready, picked up, and arriving.

BUILT FOR YOUR NEIGHBOURHOOD
Dilivygo works with local merchants who set their own delivery zones, hours, and menus. You only see shops that can actually deliver to you.

SAFE & SECURE
• Phone OTP login keeps your account secure without juggling another password.
• Payments powered by Stripe — your card details never touch our servers.
• Live tracking is end-to-end encrypted between you, the merchant, and your rider.

DOWNLOAD DILIVYGO TODAY and discover the local merchants delivering near you.

## Tags / categories
- **Application type:** Apps
- **Category:** Food & Drink
- **Tags:** food, delivery, restaurants, groceries, local

## Contact details
- **Website:** https://dilivygo.example.com
- **Email:** support@dilivygo.example.com
- **Phone (optional):** leave blank

## Privacy policy
https://dilivygo.example.com/legal/privacy

## Required graphic assets

| Asset | Size | Notes |
|---|---|---|
| App icon | 512 × 512 PNG (no alpha) | Use `assets/icon.png` re-exported. |
| Feature graphic | 1024 × 500 PNG/JPG | Required for Play Store listing. |
| Phone screenshots | 1080 × 1920+ (16:9 or 9:16) | 2 minimum, 8 max. |
| 7-inch tablet | 1024 × 600+ | Optional but recommended. |
| 10-inch tablet | 1280 × 800+ | Optional but recommended. |
| Promo video | YouTube URL | Optional (≤ 30s, 16:9). |

Place rendered assets in `screenshots/android/` (gitignored).

## Data safety form

Declare the following collected data, all linked to the user identity, used
for **app functionality** and **analytics**:
- Personal info: name, email (optional), phone number.
- Location: precise + approximate (delivery address, ETA).
- Messages: in-app chat with merchant + rider.
- App activity: in-app actions (purchase history).
- App info & performance: crash logs, diagnostics (Sentry).
- Device or other IDs (push notifications).

Mark **encrypted in transit** (TLS) and offer the **data deletion request**
URL: https://dilivygo.example.com/account/delete-request.

## Content rating questionnaire (IARC)
Answer "No" to all violence, gambling, and adult content questions. Expect
PEGI 3 / ESRB Everyone.

## Test account for review
- **Login:** +1 555 000 0042, OTP `424242` (Twilio test number).
- The app falls back to the staging API when you tap "Use demo account".
