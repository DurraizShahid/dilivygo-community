"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@dilivygo/ui";

export default function VendorStripeConnectReturnPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const isRefresh = sp.get("refresh") === "1";

  return (
    <div className="mx-auto max-w-lg space-y-6 py-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            {isRefresh ? (
              <RefreshCw className="size-5 text-muted-foreground" />
            ) : (
              <CheckCircle2 className="size-5 text-[#1C7C54]" />
            )}
            Stripe payouts
          </CardTitle>
          <CardDescription>
            {isRefresh
              ? "Your session expired before completing onboarding. Request a new link from Settings."
              : "Stripe will finish verifying your account. You can return to the vendor dashboard."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" onClick={() => router.push("/settings")}>
            Back to settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
