# Test Utilities

This directory contains reusable utility flows for E2E tests.

## Available Utilities

| Utility | Description |
|---------|-------------|
| `tap-login-button.yaml` | Taps on login/sign-in button |
| `verify-tab-navigation.yaml` | Verifies all tab bar items are visible |
| `clear-cart.yaml` | Removes all items from cart |
| `wait-for-network.yaml` | Waits for network requests to complete |
| `login-if-needed.yaml` | Conditionally logs in if not authenticated |

## Usage

Reference these utilities in your test flows:

```yaml
- runFlow:
    file: ../utils/login-if-needed.yaml
```

Or conditionally:

```yaml
- runFlow:
    when:
      visible: "Sign In"
    file: ../utils/tap-login-button.yaml
```
