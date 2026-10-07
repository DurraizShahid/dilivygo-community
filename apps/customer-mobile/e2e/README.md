# E2E Tests - Customer Mobile App

This directory contains end-to-end tests for the Dilivygo Customer Mobile App using [Maestro](https://maestro.mobile.dev/).

## Directory Structure

```
e2e/
├── .gitignore              # Ignore test artifacts
├── README.md               # This file
├── fixtures/               # Test data and configuration
│   ├── config.json         # Environment configurations
│   └── test-data.json      # Test users, restaurants, addresses, etc.
├── flows/                  # Individual test flows
│   ├── auth/               # Authentication tests
│   │   ├── login.yaml              # Phone OTP login flow
│   │   ├── login-email.yaml        # Email OTP login flow  
│   │   ├── login-invalid-otp.yaml  # Invalid OTP error handling
│   │   ├── logout.yaml             # Logout flow
│   │   └── registration.yaml       # New user registration
│   ├── navigation/         # Navigation & permissions tests
│   │   ├── deep-links.yaml         # Deep link navigation
│   │   ├── location-address.yaml   # Location permissions & address management
│   │   ├── push-notifications.yaml # Push notification handling
│   │   └── tab-navigation.yaml     # Bottom tab navigation
│   ├── order/              # Order flow tests
│   │   ├── add-to-cart.yaml        # Adding items to cart
│   │   ├── browse-restaurants.yaml # Restaurant browsing & search
│   │   ├── cart-management.yaml    # Cart operations (add/remove/modify)
│   │   ├── checkout.yaml           # Full checkout with Stripe payment
│   │   └── view-history.yaml       # Order history view
│   ├── smoke/              # Smoke tests for quick verification
│   │   ├── app-launch.yaml         # Basic app launch test
│   │   └── critical-flows.yaml     # Critical path smoke test
│   └── utils/              # Reusable utility flows
│       ├── assert-logged-in.yaml   # Assert user is logged in
│       ├── clear-cart.yaml         # Clear all cart items
│       ├── dismiss-modals.yaml     # Dismiss any open modals
│       ├── handle-permissions.yaml # Handle system permission dialogs
│       ├── login-if-needed.yaml    # Login only if not logged in
│       ├── navigate-to-tab.yaml    # Navigate to specific tab
│       ├── scroll-to-element.yaml  # Scroll until element visible
│       ├── tap-login-button.yaml   # Tap login button
│       ├── verify-tab-navigation.yaml # Verify tab navigation works
│       └── wait-for-network.yaml   # Wait for network requests
└── testCases/              # Complete test scenarios
    ├── account-management.yaml     # Account settings tests
    └── full-order-flow.yaml        # Complete order E2E test
```

## Running Tests

### Prerequisites

1. Install Maestro CLI:
   ```bash
   curl -Ls "https://get.maestro.mobile.dev" | bash
   ```

2. Build the app for your platform:
   ```bash
   # iOS
   npm run prebuild:ios
   
   # Android
   npm run prebuild:android
   ```

3. Start the simulator/emulator

### Running Tests

```bash
# Run all tests
npm run test:e2e

# Run smoke tests only
npm run test:e2e:smoke

# Run authentication tests
npm run test:e2e:auth

# Run order flow tests
npm run test:e2e:order

# Run navigation tests
npm run test:e2e:navigation

# Run full test cases
npm run test:e2e:testcases

# Run a specific test file
npm run test:e2e:flow e2e/flows/auth/login.yaml

# Open Maestro Studio (interactive mode)
npm run test:e2e:studio
```

### Environment Variables

Set these environment variables to customize test behavior:

```bash
# Test phone number for OTP login
export TEST_PHONE="+1234567890"

# Test email for email login
export TEST_USER_EMAIL="test@dilivygo.com"

# API base URL
export API_BASE_URL="http://localhost:8080/api"
```

## Test Coverage

### Authentication Tests (`flows/auth/`)

| Test | Description |
|------|-------------|
| `login.yaml` | Phone number OTP login flow |
| `login-email.yaml` | Email OTP login alternative |
| `login-invalid-otp.yaml` | Invalid OTP error handling |
| `logout.yaml` | User logout |
| `registration.yaml` | New user registration |

### Order Flow Tests (`flows/order/`)

| Test | Description |
|------|-------------|
| `browse-restaurants.yaml` | View restaurant list, search, filter |
| `add-to-cart.yaml` | Add items from menu to cart |
| `cart-management.yaml` | Add/remove/modify cart items |
| `checkout.yaml` | Complete checkout with Stripe payment |
| `view-history.yaml` | View order history |

### Navigation Tests (`flows/navigation/`)

| Test | Description |
|------|-------------|
| `tab-navigation.yaml` | Bottom tab bar navigation |
| `deep-links.yaml` | Deep link handling |
| `push-notifications.yaml` | Push notification permissions & handling |
| `location-address.yaml` | Location permissions & address management |

### Smoke Tests (`flows/smoke/`)

| Test | Description |
|------|-------------|
| `app-launch.yaml` | Verify app launches correctly |
| `critical-flows.yaml` | Quick verification of critical paths |

### Test Cases (`testCases/`)

| Test | Description |
|------|-------------|
| `full-order-flow.yaml` | Complete E2E order journey |
| `account-management.yaml` | Account settings and profile |

## Writing New Tests

### Basic Flow Structure

```yaml
# Test Name - Description
# Additional documentation

appId: com.dilivygo.customer
name: "Test Name"
tags:
  - category
  - tag2
env:
  VAR_NAME: ${VAR_NAME:-default}
---

# Step 1: Description
- launchApp:
    clearState: true

# Step 2: Wait for screen
- extendedWaitUntil:
    visible: "Element text"
    timeout: 10000

# Step 3: Interact
- tapOn:
    text: "Button"

# Step 4: Screenshot
- takeScreenshot: "step_name"
```

### Best Practices

1. **Use descriptive names** for flows and screenshots
2. **Add comments** to explain complex steps
3. **Use `optional: true`** for elements that may not appear
4. **Use regex patterns** for flexible text matching
5. **Reuse utility flows** to avoid duplication
6. **Take screenshots** at key verification points
7. **Handle platform differences** with conditional flows

### Reusing Utilities

```yaml
# Login if needed before running test
- runFlow:
    file: ../utils/login-if-needed.yaml

# Handle permission dialogs
- runFlow:
    file: ../utils/handle-permissions.yaml
    optional: true

# Clear cart before testing
- runFlow:
    file: ../utils/clear-cart.yaml
```

## Test Data

Test data is stored in `fixtures/test-data.json` and includes:

- Test users (phone, email, credentials)
- Test restaurants
- Test addresses
- Test payment methods (Stripe test cards)
- Test menu items
- Test promo codes
- Deep link URLs

## CI/CD Integration

The tests can be run in CI/CD pipelines. See `.github/workflows/` for example configurations.

## Troubleshooting

### Common Issues

1. **App not launching**: Ensure the app is built and simulator/emulator is running
2. **Elements not found**: Use Maestro Studio to inspect the UI tree
3. **Timeouts**: Increase timeout values for slow network/devices
4. **Permission dialogs**: Use `handle-permissions.yaml` utility

### Debugging

```bash
# Run with verbose output
maestro test --verbose e2e/flows/auth/login.yaml

# Use Maestro Studio for interactive debugging
npm run test:e2e:studio

# Record test execution
npm run test:e2e:record
```
