"use client";

import { motion } from "motion/react";
import { usePlatformBranding } from "@dilivygo/ui";
import { Shield } from "lucide-react";

export default function PrivacyPolicyPage() {
  const { appName } = usePlatformBranding();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="mx-auto max-w-3xl px-4 py-12 lg:py-16"
    >
      <div className="mb-10 flex items-center gap-3">
        <motion.span
          initial={{ scale: 0.8, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="flex size-12 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/15 shadow-sm"
        >
          <Shield className="size-6" />
        </motion.span>
        <h1 className="text-3xl font-extrabold tracking-tight">Privacy Policy</h1>
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mb-8 text-sm text-muted-foreground"
      >
        Last updated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
      </motion.p>

      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-muted-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_strong]:text-foreground">
        {[
          {
            title: "1. Introduction",
            content: (
              <p>
                {appName} (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or
                &ldquo;us&rdquo;) is committed to protecting your privacy. This
                Privacy Policy explains how we collect, use, disclose, and safeguard
                your information when you use our platform, website, and mobile
                applications.
              </p>
            ),
          },
          {
            title: "2. Information We Collect",
            content: (
              <>
                <h3 className="mt-4 text-base font-medium">Personal Information</h3>
                <p>When you create an account or place an order, we may collect:</p>
                <ul className="mt-2 list-disc space-y-1 pl-6">
                  <li>Name and contact details (phone number, email address)</li>
                  <li>Delivery addresses</li>
                  <li>Payment information (processed securely by our payment provider)</li>
                  <li>Order history and preferences</li>
                </ul>

                <h3 className="mt-4 text-base font-medium">Automatically Collected Information</h3>
                <p>We may automatically collect:</p>
                <ul className="mt-2 list-disc space-y-1 pl-6">
                  <li>Device information (type, operating system, browser)</li>
                  <li>IP address and approximate location</li>
                  <li>Usage data (pages visited, features used, timestamps)</li>
                  <li>Precise location data (with your consent, for delivery purposes)</li>
                </ul>
              </>
            ),
          },
          {
            title: "3. How We Use Your Information",
            content: (
              <>
                <p>We use the collected information to:</p>
                <ul className="mt-2 list-disc space-y-1 pl-6">
                  <li>Process and deliver your orders</li>
                  <li>Create and manage your account</li>
                  <li>Communicate with you about orders and updates</li>
                  <li>Improve our services and user experience</li>
                  <li>Provide customer support</li>
                  <li>Detect and prevent fraud or abuse</li>
                  <li>Comply with legal obligations</li>
                </ul>
              </>
            ),
          },
          {
            title: "4. Information Sharing",
            content: (
              <>
                <p>We may share your information with:</p>
                <ul className="mt-2 list-disc space-y-1 pl-6">
                  <li>
                    <strong>Vendors</strong> — your name, delivery address, and order
                    details so they can prepare and fulfill your order
                  </li>
                  <li>
                    <strong>Delivery riders</strong> — your name, delivery address, and
                    phone number so they can complete the delivery
                  </li>
                  <li>
                    <strong>Payment processors</strong> — payment details to process
                    transactions securely
                  </li>
                  <li>
                    <strong>Service providers</strong> — trusted third parties that help
                    us operate the platform (hosting, analytics, notifications)
                  </li>
                </ul>
                <p>
                  We do not sell your personal information to third parties for
                  marketing purposes.
                </p>
              </>
            ),
          },
          {
            title: "5. Data Security",
            content: (
              <p>
                We implement appropriate technical and organisational measures to
                protect your personal information against unauthorised access,
                alteration, disclosure, or destruction. However, no method of
                transmission over the internet is 100% secure.
              </p>
            ),
          },
          {
            title: "6. Data Retention",
            content: (
              <p>
                We retain your personal information for as long as your account is
                active or as needed to provide services. We may also retain data as
                required by law or for legitimate business purposes such as dispute
                resolution and fraud prevention.
              </p>
            ),
          },
          {
            title: "7. Your Rights",
            content: (
              <>
                <p>Depending on your jurisdiction, you may have the right to:</p>
                <ul className="mt-2 list-disc space-y-1 pl-6">
                  <li>Access the personal data we hold about you</li>
                  <li>Request correction of inaccurate data</li>
                  <li>Request deletion of your data</li>
                  <li>Object to or restrict processing of your data</li>
                  <li>Request portability of your data</li>
                  <li>Withdraw consent at any time</li>
                </ul>
                <p>
                  To exercise any of these rights, please contact us through the
                  support options available on the platform.
                </p>
              </>
            ),
          },
          {
            title: "8. Cookies",
            content: (
              <p>
                We use cookies and similar technologies to enhance your experience,
                remember your preferences, and analyse platform usage. You can
                manage cookie preferences through your browser settings.
              </p>
            ),
          },
          {
            title: "9. Changes to This Policy",
            content: (
              <p>
                We may update this Privacy Policy from time to time. We will notify
                you of any material changes by posting the updated policy on the
                platform. Continued use of the Service after changes are posted
                constitutes acceptance of the revised policy.
              </p>
            ),
          },
          {
            title: "10. Contact",
            content: (
              <p>
                If you have any questions or concerns about this Privacy Policy,
                please contact us through the support options available on the
                platform.
              </p>
            ),
          },
        ].map((section, idx) => (
          <motion.section
            key={idx}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: idx * 0.05 }}
          >
            <h2 className="text-xl font-semibold">{section.title}</h2>
            {section.content}
          </motion.section>
        ))}
      </div>
    </motion.div>
  );
}
