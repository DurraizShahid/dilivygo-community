"use client";

import { motion } from "motion/react";
import { usePlatformBranding } from "@dilivygo/ui";
import { FileText } from "lucide-react";

export default function TermsOfServicePage() {
  const { appName } = usePlatformBranding();

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="mx-auto max-w-3xl px-4 py-12 lg:py-16"
    >
      <div className="mb-10 flex items-center gap-3">
        <motion.span
          initial={{ scale: 0.8, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className="flex size-12 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/15 shadow-sm"
        >
          <FileText className="size-6" />
        </motion.span>
        <motion.h1
          variants={itemVariants}
          className="text-3xl font-extrabold tracking-tight"
        >
          Terms of Service
        </motion.h1>
      </div>

      <motion.p
        variants={itemVariants}
        className="mb-8 text-sm text-muted-foreground"
      >
        Last updated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
      </motion.p>

      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-muted-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_strong]:text-foreground">
        <motion.section
          variants={itemVariants}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
        >
          <h2 className="text-xl font-semibold">1. Acceptance of Terms</h2>
          <p>
            By accessing or using the {appName} platform, website, and mobile
            applications (collectively, the &ldquo;Service&rdquo;), you agree to
            be bound by these Terms of Service. If you do not agree to these
            terms, please do not use the Service.
          </p>
        </motion.section>

        <motion.section
          variants={itemVariants}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
        >
          <h2 className="text-xl font-semibold">2. Description of Service</h2>
          <p>
            {appName} provides an online platform that connects customers with
            local restaurants and food vendors for ordering and delivery
            services. We facilitate the ordering process but the food is prepared
            by independent vendors.
          </p>
        </motion.section>

        <motion.section
          variants={itemVariants}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
        >
          <h2 className="text-xl font-semibold">3. User Accounts</h2>
          <p>
            To use certain features of the Service, you must create an account.
            You are responsible for maintaining the confidentiality of your
            account credentials and for all activities that occur under your
            account. You agree to provide accurate and complete information when
            creating your account and to keep it up to date.
          </p>
        </motion.section>

        <motion.section
          variants={itemVariants}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
        >
          <h2 className="text-xl font-semibold">4. Orders &amp; Payments</h2>
          <p>
            When you place an order, you agree to pay the listed price for the
            items, applicable delivery fees, service fees, and any taxes. Prices
            are set by the vendors and may change without notice. All payments
            are processed securely through our third-party payment provider.
          </p>
          <p>
            Refunds are handled on a case-by-case basis. If there is an issue
            with your order, please contact our support team for assistance.
          </p>
        </motion.section>

        <motion.section
          variants={itemVariants}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
        >
          <h2 className="text-xl font-semibold">5. Delivery</h2>
          <p>
            Estimated delivery times are approximate and may vary due to
            factors such as order volume, weather, traffic, and vendor
            preparation time. {appName} is not liable for delays outside of
            our reasonable control.
          </p>
        </motion.section>

        <motion.section
          variants={itemVariants}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
        >
          <h2 className="text-xl font-semibold">6. User Conduct</h2>
          <p>You agree not to:</p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <motion.li variants={itemVariants}>Use the Service for any unlawful purpose</motion.li>
            <motion.li variants={itemVariants}>Interfere with or disrupt the Service or servers</motion.li>
            <motion.li variants={itemVariants}>Impersonate any person or entity</motion.li>
            <motion.li variants={itemVariants}>Submit false or misleading information</motion.li>
            <motion.li variants={itemVariants}>Harass or abuse delivery riders, vendors, or other users</motion.li>
          </ul>
        </motion.section>

        <motion.section
          variants={itemVariants}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
        >
          <h2 className="text-xl font-semibold">7. Intellectual Property</h2>
          <p>
            All content, trademarks, logos, and intellectual property displayed
            on the Service are owned by {appName} or its licensors. You may not
            reproduce, distribute, or create derivative works without prior
            written consent.
          </p>
        </motion.section>

        <motion.section
          variants={itemVariants}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
        >
          <h2 className="text-xl font-semibold">8. Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by law, {appName} shall not be liable
            for any indirect, incidental, special, consequential, or punitive
            damages arising from or related to your use of the Service,
            including but not limited to food quality issues, delivery delays,
            or loss of data.
          </p>
        </motion.section>

        <motion.section
          variants={itemVariants}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
        >
          <h2 className="text-xl font-semibold">9. Termination</h2>
          <p>
            We reserve the right to suspend or terminate your account at any
            time, with or without cause, including for violation of these Terms.
            Upon termination, your right to use the Service will immediately
            cease.
          </p>
        </motion.section>

        <motion.section
          variants={itemVariants}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
        >
          <h2 className="text-xl font-semibold">10. Changes to Terms</h2>
          <p>
            We may update these Terms from time to time. Continued use of the
            Service after changes are posted constitutes acceptance of the
            revised Terms. We encourage you to review these Terms periodically.
          </p>
        </motion.section>

        <motion.section
          variants={itemVariants}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
        >
          <h2 className="text-xl font-semibold">11. Contact</h2>
          <p>
            If you have any questions about these Terms of Service, please
            contact us through the support options available on the platform.
          </p>
        </motion.section>
      </div>
    </motion.div>
  );
}
