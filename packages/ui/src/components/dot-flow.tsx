"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { cn } from "../lib/utils";
import { DotLoader } from "./dot-loader";

export type DotFlowProps = {
    items?: {
        title: string;
        frames: number[][];
        duration?: number;
        repeatCount?: number;
    }[];
    className?: string;
    /** If provided, overrides the cyclic items and forces a static state (e.g. for dynamic initialization). */
    loadingState?: string;
};

export const DEFAULT_DOT_FLOW_ITEMS = [
    {
        title: "Loading components...",
        frames: [[24], [23, 24, 25, 17, 31], [16, 17, 18, 23, 24, 25, 30, 31, 32]],
        repeatCount: 1,
    },
    {
        title: "Initializing system...",
        frames: [[24], [16, 18, 30, 32], [8, 12, 36, 40]],
        repeatCount: 1,
    },
];

export const DotFlow = ({ items = DEFAULT_DOT_FLOW_ITEMS, className, loadingState }: DotFlowProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);
    const gsapContextRef = useRef<gsap.Context | null>(null);
    const [index, setIndex] = useState(0);
    const [textIndex, setTextIndex] = useState(0);

    const runInContext = useCallback((fn: () => void) => {
        const ctx = gsapContextRef.current;
        if (ctx) {
            ctx.add(fn);
            return;
        }
        fn();
    }, []);

    useEffect(() => {
        if (!containerRef.current) return;
        gsapContextRef.current = gsap.context(() => {}, containerRef);
        return () => {
            gsapContextRef.current?.revert();
            gsapContextRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!containerRef.current || !textRef.current) return;

        const newWidth = textRef.current.offsetWidth + 1;

        runInContext(() => {
            if (!containerRef.current) return;
            gsap.to(containerRef.current, {
                width: newWidth,
                duration: 0.5,
                ease: "power2.out",
            });
        });
    }, [textIndex, items, loadingState]);

    const next = useCallback(() => {
        // If we have a forced loadingState, we don't advance the cyclic index
        if (loadingState) return;

        const el = textRef.current;
        if (!el) return;

        runInContext(() => {
            gsap.to(el, {
                y: 20,
                opacity: 0,
                filter: "blur(8px)",
                duration: 0.5,
                ease: "power2.in",
                onComplete: () => {
                    setTextIndex((prev) => (prev + 1) % items.length);
                    gsap.fromTo(
                        el,
                        { y: -20, opacity: 0, filter: "blur(4px)" },
                        {
                            y: 0,
                            opacity: 1,
                            filter: "blur(0px)",
                            duration: 0.7,
                            ease: "power2.out",
                        },
                    );
                },
            });
        });

        setIndex((prev) => (prev + 1) % items.length);
    }, [items.length, loadingState, runInContext]);

    if (!items || items.length === 0) return null;

    const currentTitle = loadingState || items[textIndex].title;

    return (
        <div className={cn("flex items-center gap-6 rounded-2xl bg-muted/30 px-6 py-4 backdrop-blur-sm border border-border/50 transition-all duration-500", className)}>
            <DotLoader
                frames={items[index].frames}
                onComplete={next}
                className="gap-px"
                repeatCount={loadingState ? -1 : (items[index].repeatCount ?? 1)}
                duration={items[index].duration ?? 150}
                dotClassName="bg-primary/10 [&.active]:bg-primary size-1"
            />
            <div ref={containerRef} className="relative overflow-hidden h-7 min-w-[120px]">
                <div ref={textRef} className="inline-block text-sm font-medium tracking-tight whitespace-nowrap text-foreground/80">
                    {currentTitle}
                </div>
            </div>
        </div>
    );
};
