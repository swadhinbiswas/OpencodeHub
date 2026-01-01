"use client";
import React from "react";
import { motion } from "framer-motion";

export function ColourfulText({
    text,
    className = "",
}: {
    text: string;
    className?: string;
}) {
    const colors = [
        "rgb(131, 179, 32)",    // Green
        "rgb(47, 195, 106)",    // Teal
        "rgb(42, 169, 210)",    // Cyan
        "rgb(4, 112, 202)",     // Blue
        "rgb(107, 10, 255)",    // Purple
        "rgb(183, 0, 218)",     // Magenta
        "rgb(218, 0, 171)",     // Pink
        "rgb(230, 64, 92)",     // Red
        "rgb(232, 98, 63)",     // Orange
        "rgb(249, 129, 47)",    // Orange-Yellow
    ];

    const [currentColors, setCurrentColors] = React.useState(colors);
    const [count, setCount] = React.useState(0);

    React.useEffect(() => {
        const interval = setInterval(() => {
            const shuffled = [...colors].sort(() => Math.random() - 0.5);
            setCurrentColors(shuffled);
            setCount((prev) => prev + 1);
        }, 5000);

        return () => clearInterval(interval);
    }, []);

    return text.split("").map((char, index) => (
        <motion.span
            key={`${char}-${count}-${index}`}
            initial={{
                y: 0,
            }}
            animate={{
                color: currentColors[index % currentColors.length],
                y: [0, -3, 0],
                scale: [1, 1.01, 1],
                filter: ["blur(0px)", `blur(5px)`, "blur(0px)"],
                opacity: [1, 0.8, 1],
            }}
            transition={{
                duration: 0.5,
                delay: index * 0.05,
            }}
            className={`inline-block whitespace-pre font-bold ${className}`}
        >
            {char}
        </motion.span>
    ));
}

// Simpler version without animation for static usage
export function GradientText({
    children,
    className = "",
    from = "from-blue-500",
    via = "via-purple-500",
    to = "to-pink-500",
}: {
    children: React.ReactNode;
    className?: string;
    from?: string;
    via?: string;
    to?: string;
}) {
    return (
        <span
            className={`bg-gradient-to-r ${from} ${via} ${to} bg-clip-text text-transparent ${className}`}
        >
            {children}
        </span>
    );
}

// Rainbow text that cycles through colors
export function RainbowText({
    children,
    className = "",
    animated = true,
}: {
    children: React.ReactNode;
    className?: string;
    animated?: boolean;
}) {
    return (
        <span
            className={`bg-gradient-to-r from-red-500 via-yellow-500 via-green-500 via-blue-500 to-purple-500 bg-clip-text text-transparent ${animated ? "animate-gradient-x bg-[length:200%_auto]" : ""
                } ${className}`}
        >
            {children}
        </span>
    );
}
