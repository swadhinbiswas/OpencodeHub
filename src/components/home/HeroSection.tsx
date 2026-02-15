"use client";
import { FlipWords } from "@/components/ui/flip-words";
import { Spotlight } from "@/components/ui/spotlight";
import { ColourfulText } from "@/components/ui/colourful-text";
import { motion } from "framer-motion";
import { ArrowRight, GitGraph, Star, GitBranch, Zap } from "lucide-react";

export default function HeroSection() {
    const words = ["Teams", "Developers", "Enterprises", "Startups"];

    return (
        <div className="h-[40rem] w-full rounded-md flex md:items-center md:justify-center bg-background/[0.96] antialiased bg-grid-white/[0.02] relative overflow-hidden">
            {/* Spotlight effect */}
            <Spotlight
                className="-top-40 left-0 md:left-60 md:-top-20"
                fill="hsl(var(--primary))"
            />

            {/* Ambient glow effects */}
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-[100px] pointer-events-none" />

            <div className="p-4 max-w-7xl mx-auto relative z-10 w-full pt-20 md:pt-0">
                {/* Badge */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex justify-center mb-6"
                >
                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/20 bg-primary/5 text-sm text-primary">
                        <Star className="h-4 w-4 fill-primary" />
                        Open Source & Self-Hosted
                    </span>
                </motion.div>

                {/* Main heading with animated blue gradient */}
                <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    className="text-4xl md:text-7xl font-bold text-center"
                >
                    <span className="bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400">
                        Self-hosted{" "}
                    </span>
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-600 bg-[length:200%_auto] animate-gradient-x">
                        Git Platform
                    </span>
                    <br />
                    <span className="text-3xl md:text-6xl bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400">for Modern{" "}</span>
                    <FlipWords words={words} className="text-3xl md:text-6xl" />
                </motion.h1>

                {/* Description */}
                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="mt-6 font-normal text-base text-neutral-300 max-w-xl text-center mx-auto"
                >
                    Host your code, manage pull requests, run CI/CD pipelines, and collaborate securely.
                    GitHub-compatible, fully self-hosted, and open source.
                </motion.p>

                {/* CTA Buttons */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                    className="flex flex-col sm:flex-row gap-4 justify-center mt-10"
                >
                    <a
                        href="/register"
                        className="group relative inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 hover:scale-105"
                    >
                        Get Started
                        <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />

                        {/* Glow effect */}
                        <span className="absolute inset-0 rounded-lg bg-primary blur-xl opacity-40 group-hover:opacity-60 transition-opacity" />
                    </a>
                    <a
                        href="/explore"
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-8 py-3.5 text-sm font-medium text-foreground backdrop-blur-sm hover:bg-white/10 hover:border-white/20 transition-all"
                    >
                        <GitGraph className="h-4 w-4" />
                        Explore Repositories
                    </a>
                </motion.div>

                {/* Stats */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                    className="flex items-center justify-center gap-8 mt-16"
                >
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <GitBranch className="h-5 w-5 text-primary" />
                        <span className="text-2xl font-bold text-foreground">100%</span>
                        <span className="text-sm">Open Source</span>
                    </div>
                    <div className="w-px h-8 bg-white/10" />
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Zap className="h-5 w-5 text-yellow-500" />
                        <span className="text-2xl font-bold text-foreground">Graphite</span>
                        <span className="text-sm">Features</span>
                    </div>
                    <div className="w-px h-8 bg-white/10" />
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Star className="h-5 w-5 text-orange-500" />
                        <span className="text-2xl font-bold text-foreground">AI</span>
                        <span className="text-sm">Powered Reviews</span>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
