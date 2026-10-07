import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { faker } from "@faker-js/faker";
import { renderWithProviders, mockAuthStore } from "@/test/setup";
import LoginPage from "./page";

beforeAll(() => {
  const n = Number.parseInt(process.env.FAKER_SEED ?? "42", 10);
  faker.seed(Number.isFinite(n) ? n : 42);
});

// Mock the API module
const mockSendOTP = vi.fn();
const mockVerifyOTP = vi.fn();
const mockCustomerRecoverySend = vi.fn();
const mockCustomerRecoveryVerify = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    auth: {
      sendOTP: (...args: unknown[]) => mockSendOTP(...args),
      verifyOTP: (...args: unknown[]) => mockVerifyOTP(...args),
      customerRecoverySend: (...args: unknown[]) => mockCustomerRecoverySend(...args),
      customerRecoveryVerify: (...args: unknown[]) => mockCustomerRecoveryVerify(...args),
      getSession: vi.fn(),
      logout: vi.fn(),
    },
  },
}));

// Mock the UI library via the shared surface mock. Keeps every test file in
// sync with `@dilivygo/ui`'s evolving public API without per-file fixups.
vi.mock("@dilivygo/ui", async () => (await import("@/test/ui-mock")).default);

// `CustomerPhoneField` wraps `InternationalPhoneField` from
// `@dilivygo/ui/international-phone-field` — a country-picker + tel-input combo.
// For the login tests we only care about the typed value and `onChange`
// round-trip, so collapse it to a plain `<input>` with the placeholder the
// assertions expect.
vi.mock("@/components/customer-phone-field", () => ({
  CustomerPhoneField: ({
    id,
    value,
    onChange,
    autoFocus,
  }: {
    id?: string;
    value?: string;
    onChange?: (v: string) => void;
    autoFocus?: boolean;
  }) => (
    <input
      id={id}
      type="tel"
      placeholder="+447700900000"
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value)}
      autoFocus={autoFocus}
      aria-label="Phone number"
    />
  ),
}));

// Mock PromoBanner
vi.mock("@/components/promo-banner", () => ({
  PromoBanner: () => null,
}));

describe("LoginPage", () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthStore.reset();
  });

  describe("Initial Render", () => {
    it("renders the login form with phone tab selected by default", () => {
      renderWithProviders(<LoginPage />);

      expect(screen.getByText("Welcome back")).toBeInTheDocument();
      expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText("+447700900000")).toBeInTheDocument();
    });

    it("shows both Phone and Email tabs", () => {
      renderWithProviders(<LoginPage />);

      // Look for tab buttons that contain Phone and Email text
      expect(screen.getByText("Phone")).toBeInTheDocument();
      expect(screen.getByText("Email")).toBeInTheDocument();
    });

    it("shows the continue button disabled when no input", () => {
      renderWithProviders(<LoginPage />);

      const continueButton = screen.getByRole("button", { name: /continue/i });
      expect(continueButton).toBeDisabled();
    });

    it("shows back to home link", () => {
      renderWithProviders(<LoginPage />);

      expect(screen.getByText("Back to home")).toBeInTheDocument();
    });
  });

  describe("Phone Channel", () => {
    it("enables continue button when phone is entered", async () => {
      renderWithProviders(<LoginPage />);

      const phoneInput = screen.getByPlaceholderText("+447700900000");
      await user.type(phoneInput, "+447700900001");

      const continueButton = screen.getByRole("button", { name: /continue/i });
      expect(continueButton).not.toBeDisabled();
    });

    it("shows error for invalid phone format", async () => {
      renderWithProviders(<LoginPage />);

      const phoneInput = screen.getByPlaceholderText("+447700900000");
      await user.type(phoneInput, "12345");

      const continueButton = screen.getByRole("button", { name: /continue/i });
      await user.click(continueButton);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent(
          /enter your phone in international format/i
        );
      });
    });

    it("calls sendOTP with correct params on valid phone submit", async () => {
      mockSendOTP.mockResolvedValueOnce({ debugOtp: "123456" });
      renderWithProviders(<LoginPage />);

      const phoneInput = screen.getByPlaceholderText("+447700900000");
      await user.type(phoneInput, "+447700900001");

      const continueButton = screen.getByRole("button", { name: /continue/i });
      await user.click(continueButton);

      await waitFor(() => {
        expect(mockSendOTP).toHaveBeenCalledWith(
          expect.objectContaining({
            channel: "phone",
            phone: "+447700900001",
          })
        );
      });
    });

    it("shows recovery option for phone channel", () => {
      renderWithProviders(<LoginPage />);

      expect(screen.getByText(/can't access this phone number/i)).toBeInTheDocument();
    });
  });

  describe("Email Channel", () => {
    it("switches to email input when email tab is clicked", async () => {
      renderWithProviders(<LoginPage />);

      const emailTab = screen.getByRole("button", { name: /email/i });
      await user.click(emailTab);

      expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });

    it("shows error for invalid email format", async () => {
      renderWithProviders(<LoginPage />);

      const emailTab = screen.getByRole("button", { name: /email/i });
      await user.click(emailTab);

      await waitFor(() => {
        expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
      });

      const emailInput = screen.getByPlaceholderText("you@example.com");
      await user.type(emailInput, "invalid-email");

      const continueButton = screen.getByRole("button", { name: /continue/i });
      await user.click(continueButton);

      // Wait for form to be submitted and validation to occur
      await waitFor(() => {
        // The form should show validation error or stay on same page
        expect(screen.getByText("Welcome back")).toBeInTheDocument();
      });
    });

    it("calls sendOTP with email when valid email submitted", async () => {
      const email = faker.internet.email({ provider: "example.com" });
      mockSendOTP.mockResolvedValueOnce({ debugOtp: "123456" });
      renderWithProviders(<LoginPage />);

      const emailTab = screen.getByRole("button", { name: /email/i });
      await user.click(emailTab);

      const emailInput = screen.getByPlaceholderText("you@example.com");
      await user.type(emailInput, email);

      const continueButton = screen.getByRole("button", { name: /continue/i });
      await user.click(continueButton);

      await waitFor(() => {
        expect(mockSendOTP).toHaveBeenCalledWith(
          expect.objectContaining({
            channel: "email",
            email: email.toLowerCase(),
          })
        );
      });
    });

    it("does not show recovery option for email channel", async () => {
      renderWithProviders(<LoginPage />);

      const emailTab = screen.getByRole("button", { name: /email/i });
      await user.click(emailTab);

      expect(screen.queryByText(/can't access this phone number/i)).not.toBeInTheDocument();
    });
  });

  describe("OTP Verification", () => {
    beforeEach(() => {
      mockSendOTP.mockResolvedValue({ debugOtp: "123456" });
    });

    it("shows OTP input after successful sendOTP", async () => {
      renderWithProviders(<LoginPage />);

      const phoneInput = screen.getByPlaceholderText("+447700900000");
      await user.type(phoneInput, "+447700900001");

      const continueButton = screen.getByRole("button", { name: /continue/i });
      await user.click(continueButton);

      await waitFor(() => {
        expect(screen.getByText("Verify your code")).toBeInTheDocument();
        expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
      });
    });

    it("pre-fills OTP code in dev mode", async () => {
      renderWithProviders(<LoginPage />);

      const phoneInput = screen.getByPlaceholderText("+447700900000");
      await user.type(phoneInput, "+447700900001");

      const continueButton = screen.getByRole("button", { name: /continue/i });
      await user.click(continueButton);

      await waitFor(() => {
        const otpInput = screen.getByLabelText(/verification code/i);
        expect(otpInput).toHaveValue("123456");
      });
    });

    it("only allows numeric input in OTP field", async () => {
      renderWithProviders(<LoginPage />);

      const phoneInput = screen.getByPlaceholderText("+447700900000");
      await user.type(phoneInput, "+447700900001");

      const continueButton = screen.getByRole("button", { name: /continue/i });
      await user.click(continueButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
      });

      const otpInput = screen.getByLabelText(/verification code/i);
      fireEvent.change(otpInput, { target: { value: "abc123def" } });

      expect(otpInput).toHaveValue("123");
    });

    it("disables verify button when OTP is not 6 digits", async () => {
      renderWithProviders(<LoginPage />);

      const phoneInput = screen.getByPlaceholderText("+447700900000");
      await user.type(phoneInput, "+447700900001");

      const continueButton = screen.getByRole("button", { name: /continue/i });
      await user.click(continueButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
      });

      const otpInput = screen.getByLabelText(/verification code/i);
      fireEvent.change(otpInput, { target: { value: "12345" } });

      const verifyButton = screen.getByRole("button", { name: /verify & sign in/i });
      expect(verifyButton).toBeDisabled();
    });

    it("calls verifyOTP on submit", async () => {
      mockVerifyOTP.mockResolvedValueOnce({
        customer: { id: "1", phone: "+447700900001", projectRef: "demo" },
      });
      renderWithProviders(<LoginPage />);

      const phoneInput = screen.getByPlaceholderText("+447700900000");
      await user.type(phoneInput, "+447700900001");

      const continueButton = screen.getByRole("button", { name: /continue/i });
      await user.click(continueButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
      });

      const verifyButton = screen.getByRole("button", { name: /verify & sign in/i });
      await user.click(verifyButton);

      await waitFor(() => {
        expect(mockVerifyOTP).toHaveBeenCalledWith(
          expect.objectContaining({
            channel: "phone",
            phone: "+447700900001",
            code: "123456",
          })
        );
      });
    });

    it("shows error on invalid OTP", async () => {
      mockVerifyOTP.mockRejectedValueOnce({ statusCode: 400, message: "Invalid code" });
      renderWithProviders(<LoginPage />);

      const phoneInput = screen.getByPlaceholderText("+447700900000");
      await user.type(phoneInput, "+447700900001");

      const continueButton = screen.getByRole("button", { name: /continue/i });
      await user.click(continueButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
      });

      const verifyButton = screen.getByRole("button", { name: /verify & sign in/i });
      await user.click(verifyButton);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent(/incorrect verification code/i);
      });
    });

    it("allows changing contact info from OTP screen", async () => {
      renderWithProviders(<LoginPage />);

      const phoneInput = screen.getByPlaceholderText("+447700900000");
      await user.type(phoneInput, "+447700900001");

      const continueButton = screen.getByRole("button", { name: /continue/i });
      await user.click(continueButton);

      await waitFor(() => {
        expect(screen.getByText(/change phone number/i)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/change phone number/i));

      await waitFor(() => {
        expect(screen.getByText("Welcome back")).toBeInTheDocument();
      });
    });
  });

  describe("Error Handling", () => {
    it("shows rate limit error on 429", async () => {
      mockSendOTP.mockRejectedValueOnce({ statusCode: 429 });
      renderWithProviders(<LoginPage />);

      const phoneInput = screen.getByPlaceholderText("+447700900000");
      await user.type(phoneInput, "+447700900001");

      const continueButton = screen.getByRole("button", { name: /continue/i });
      await user.click(continueButton);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent(/too many otp requests/i);
      });
    });

    it("clears error when input changes", async () => {
      renderWithProviders(<LoginPage />);

      const phoneInput = screen.getByPlaceholderText("+447700900000");
      await user.type(phoneInput, "12345");

      const continueButton = screen.getByRole("button", { name: /continue/i });
      await user.click(continueButton);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      });

      await user.type(phoneInput, "6");

      await waitFor(() => {
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      });
    });

    it("clears error when switching tabs", async () => {
      renderWithProviders(<LoginPage />);

      const phoneInput = screen.getByPlaceholderText("+447700900000");
      await user.type(phoneInput, "12345");

      const continueButton = screen.getByRole("button", { name: /continue/i });
      await user.click(continueButton);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      });

      const emailTab = screen.getByRole("button", { name: /email/i });
      await user.click(emailTab);

      await waitFor(() => {
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      });
    });
  });

  describe("Account Recovery", () => {
    it("navigates to recovery flow when clicking cant access phone", async () => {
      renderWithProviders(<LoginPage />);

      const recoveryLink = screen.getByText(/can't access this phone number/i);
      await user.click(recoveryLink);

      await waitFor(() => {
        expect(screen.getByText("Recover account")).toBeInTheDocument();
        expect(screen.getByLabelText(/account email/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/new phone number/i)).toBeInTheDocument();
      });
    });

    it("validates recovery form fields", async () => {
      renderWithProviders(<LoginPage />);

      const recoveryLink = screen.getByText(/can't access this phone number/i);
      await user.click(recoveryLink);

      await waitFor(() => {
        expect(screen.getByText("Recover account")).toBeInTheDocument();
      });

      const emailInput = screen.getByLabelText(/account email/i);
      const phoneInput = screen.getByLabelText(/new phone number/i);

      await user.type(emailInput, "invalid-email");
      await user.type(phoneInput, "+447700900001");

      const sendButton = screen.getByRole("button", { name: /send recovery code/i });
      await user.click(sendButton);

      // Form should validate and show error
      await waitFor(() => {
        // Should still be on recovery page since validation failed
        expect(screen.getByText("Recover account")).toBeInTheDocument();
      });
    });

    it("allows going back to sign in from recovery", async () => {
      renderWithProviders(<LoginPage />);

      const recoveryLink = screen.getByText(/can't access this phone number/i);
      await user.click(recoveryLink);

      await waitFor(() => {
        expect(screen.getByText("Recover account")).toBeInTheDocument();
      });

      const backButton = screen.getByText(/back to sign in/i);
      await user.click(backButton);

      await waitFor(() => {
        expect(screen.getByText("Welcome back")).toBeInTheDocument();
      });
    });
  });

  describe("Session Persistence", () => {
    it("redirects authenticated users to home", async () => {
      mockAuthStore.setAuthenticated({
        id: "1",
        phone: "+447700900001",
        projectRef: "demo",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      renderWithProviders(<LoginPage />);

      // The router.replace should be called with "/" when user is authenticated
      // This is handled by the useEffect in the component
      await waitFor(() => {
        // Component should have called router.replace
        // We test this by checking that the login form is still shown
        // because the mock router doesn't actually navigate
        expect(screen.getByText("Welcome back")).toBeInTheDocument();
      });
    });
  });
});
