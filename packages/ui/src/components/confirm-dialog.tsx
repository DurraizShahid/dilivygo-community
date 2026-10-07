"use client";

import * as React from "react";
import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";

export type ConfirmDialogVariant = "default" | "destructive";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

/**
 * Controlled confirmation modal. Swap for browser-native `confirm()` calls so
 * destructive actions render inside the app shell (theme, focus management,
 * accessible labelling) instead of an OS chrome prompt that can't be styled,
 * cannot be tested deterministically, and is visually jarring.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const handleConfirm = async () => {
    await onConfirm();
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && loading) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description != null ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={handleCancel}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={() => {
              void handleConfirm();
            }}
            disabled={loading}
          >
            {loading ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Tiny imperative hook wrapper so callers can write
 *   `if (await confirm({ title: "Delete shop?" })) { ... }`
 * from anywhere without threading state through their component tree.
 *
 * Returns a function + a node the caller must render once near the top of
 * their tree. Multiple concurrent prompts are queued sequentially.
 */
interface ConfirmOptions extends Omit<ConfirmDialogProps, "open" | "onOpenChange" | "onConfirm" | "onCancel" | "loading"> {
  loading?: boolean;
}

export function useConfirm(): {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  dialog: React.ReactNode;
} {
  const [state, setState] = React.useState<
    | { opts: ConfirmOptions; resolve: (v: boolean) => void }
    | null
  >(null);

  const confirm = React.useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setState({ opts, resolve });
      }),
    [],
  );

  const close = (result: boolean) => {
    setState((prev) => {
      prev?.resolve(result);
      return null;
    });
  };

  const dialog = state ? (
    <ConfirmDialog
      {...state.opts}
      open
      onOpenChange={(next) => {
        if (!next) close(false);
      }}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  ) : null;

  return { confirm, dialog };
}
