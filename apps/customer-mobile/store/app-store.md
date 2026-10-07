# Customer app — App Store metadata

> Drop the values from this file into App Store Connect when creating the
> first iOS submission. Update copy per locale (App Store Connect supports
> per-locale overrides for every field below).

## App identity
- **App Name:** Dilivygo
- **Subtitle (30 chars):** Order food, groceries & more
- **Bundle ID:** com.dilivygo.customer
- **Primary Category:** Food & Drink
- **Secondary Category:** Lifestyle
- **Age Rating:** 4+ (no objectionable content; final classification confirmed in App Store Connect questionnaire).

## Promotional text (170 chars)
Discover local restaurants, place an order in a few taps, and watch your delivery on a live map — all from your favourite neighbourhood spots.

## Description (4000 chars)
Dilivygo is the fastest way to order food, groceries, and everyday essentials from local merchants near you.

WHY DILIVYGO
- Browse menus and shop catalogs from independent local merchants in your area.
- Tap to add items to your cart, customise with options and add-ons, and check out securely with Apple Pay or your card.
- Watch your rider on a live map from kitchen to doorstep with realtime status updates.
- Save your favourite restaurants and reorder past meals in one tap.
- Chat with the merchant or your delivery rider directly from inside the app.
- Get notified the moment your order is accepted, ready, picked up, and arriving.

BUILT FOR YOUR NEIGHBOURHOOD
Dilivygo works with local merchants who set their own delivery zones, hours, and menus. You only see shops that can actually deliver to you. No more discovering a restaurant just to learn they don't serve your address.

SAFE & SECURE
- Phone OTP login keeps your account secure without juggling another password.
- Payments powered by Stripe — your card details never touch our servers.
- Live tracking is end-to-end encrypted between you, the merchant, and your rider.

DOWNLOAD DILIVYGO TODAY and discover the local merchants delivering near you.

## Keywords (100 chars, comma-separated)
food delivery,restaurants,takeout,groceries,local,delivery,order food,fast delivery,neighbourhood

## Support URL
https://dilivygo.example.com/support

## Marketing URL
https://dilivygo.example.com

## Privacy Policy URL
https://dilivygo.example.com/legal/privacy

## What's New (release notes)
- Brand new home screen with bigger photos and faster browsing.
- Improved live tracking for groceries and convenience orders.
- Stability fixes and faster checkout.

## Required screenshots

| Device | Resolution | Notes |
|---|---|---|
| iPhone 6.9" (iPhone 16 Pro Max) | 1290 × 2796 | Required, 3 minimum, 10 max |
| iPhone 6.5" (iPhone 14 Plus) | 1242 × 2688 or 1284 × 2778 | Required, 3 minimum |
| iPad Pro 13" (M4) | 2064 × 2752 | Required if `supportsTablet: true` |

Place the rendered PNG/JPEGs in `screenshots/ios/` (gitignored). Suggested
flows to capture:
1. Home / nearby shops grid with the customer's address pinned at the top.
2. Restaurant detail with menu items + add-to-cart sheet open.
3. Cart screen with promo applied + delivery address + tip selector.
4. Live tracking map with the rider en route.
5. Order receipt + chat with rider thread.

## App Privacy questionnaire (data collection)
Mark the following data types as collected and used to provide the
"App Functionality" purpose, linked to the user identity:
- Email Address (optional sign-up)
- Phone Number
- Name (display)
- Customer Support content (chat messages)
- Coarse + Precise Location (delivery address, live ETA)
- Purchase History
- Device ID (for push notifications)
- Crash & Performance Data (Sentry)

Mark **not collected**: contacts, browsing history outside the app, sensitive
info, financial info beyond tokenised payment IDs.

## Test account for review
- **Login:** +1 555 000 0042 (Twilio test number, OTP `424242`).
- **Sample workspace:** `demo` org, populated with 5 demo shops + sample
  catalog. Reset nightly via the seed script.

## Demo notes for App Review
The app uses phone OTP for sign-in. Tap "Use demo account" on the login
screen to skip the OTP flow during review (only available when the app is
pointed at the staging API).
