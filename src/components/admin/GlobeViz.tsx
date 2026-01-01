"use client";
import { useEffect, useRef, useState, Component, ReactNode } from "react";
import createGlobe from "cobe";

// Error boundary for WebGL issues
class GlobeErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
    constructor(props: { children: ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error: Error) {
        console.warn("GitHub Globe error:", error.message);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center text-white/50">
                        <div className="text-6xl mb-4">🌐</div>
                        <p className="text-sm">Globe unavailable</p>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

// Check WebGL support
function isWebGLSupported(): boolean {
    try {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
        return !!gl;
    } catch {
        return false;
    }
}

interface Activity {
    user: string;
    repo: string;
    type: string;
}

interface Props {
    activities?: Activity[];
}

function GlobeContent({ activities = [] }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const pointerInteracting = useRef<number | null>(null);
    const pointerInteractionMovement = useRef(0);
    const [rotation, setRotation] = useState(0);

    useEffect(() => {
        if (!canvasRef.current) return;

        let phi = 0;
        let width = 0;

        const onResize = () => {
            if (canvasRef.current) {
                width = canvasRef.current.offsetWidth;
            }
        };
        window.addEventListener("resize", onResize);
        onResize();

        const globe = createGlobe(canvasRef.current, {
            devicePixelRatio: 2,
            width: width * 2,
            height: width * 2,
            phi: 0,
            theta: 0.3,
            dark: 1,
            diffuse: 1.2,
            mapSamples: 16000,
            mapBrightness: 6,
            baseColor: [0.3, 0.3, 0.3],
            markerColor: [0.1, 0.8, 1],
            glowColor: [0.1, 0.1, 0.3],
            markers: activities.slice(0, 20).map((_, i) => ({
                location: [
                    (Math.random() - 0.5) * 180,
                    (Math.random() - 0.5) * 360
                ],
                size: 0.03 + Math.random() * 0.05,
            })),
            onRender: (state) => {
                if (!pointerInteracting.current) {
                    phi += 0.005;
                }
                state.phi = phi + rotation;
                state.width = width * 2;
                state.height = width * 2;
            },
        });

        setTimeout(() => {
            if (canvasRef.current) {
                canvasRef.current.style.opacity = "1";
            }
        }, 100);

        return () => {
            globe.destroy();
            window.removeEventListener("resize", onResize);
        };
    }, [activities, rotation]);

    return (
        <div className="w-full h-full flex items-center justify-center cursor-move">
            <canvas
                ref={canvasRef}
                onPointerDown={(e) => {
                    pointerInteracting.current = e.clientX - pointerInteractionMovement.current;
                    if (canvasRef.current) {
                        canvasRef.current.style.cursor = "grabbing";
                    }
                }}
                onPointerUp={() => {
                    pointerInteracting.current = null;
                    if (canvasRef.current) {
                        canvasRef.current.style.cursor = "grab";
                    }
                }}
                onPointerOut={() => {
                    pointerInteracting.current = null;
                    if (canvasRef.current) {
                        canvasRef.current.style.cursor = "grab";
                    }
                }}
                onMouseMove={(e) => {
                    if (pointerInteracting.current !== null) {
                        const delta = e.clientX - pointerInteracting.current;
                        pointerInteractionMovement.current = delta;
                        setRotation(delta / 200);
                    }
                }}
                onTouchMove={(e) => {
                    if (pointerInteracting.current !== null && e.touches[0]) {
                        const delta = e.touches[0].clientX - pointerInteracting.current;
                        pointerInteractionMovement.current = delta;
                        setRotation(delta / 100);
                    }
                }}
                style={{
                    width: "100%",
                    height: "100%",
                    maxWidth: "600px",
                    aspectRatio: "1",
                    opacity: 0,
                    transition: "opacity 1s ease",
                    cursor: "grab",
                }}
            />
        </div>
    );
}

export default function GlobeViz({ activities = [] }: Props) {
    const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        setWebglSupported(isWebGLSupported());
    }, []);

    // Still loading
    if (!mounted || webglSupported === null) {
        return (
            <div className="w-full h-full flex items-center justify-center">
                <div className="text-white/30 text-sm">Loading globe...</div>
            </div>
        );
    }

    // No WebGL support - show CSS fallback
    if (!webglSupported) {
        return <CSSGlobeFallback activities={activities} />;
    }

    return (
        <GlobeErrorBoundary>
            <GlobeContent activities={activities} />
        </GlobeErrorBoundary>
    );
}

// CSS-based fallback for systems without WebGL
function CSSGlobeFallback({ activities = [] }: Props) {
    const [points, setPoints] = useState<Array<{ x: number; y: number; delay: number }>>([]);

    useEffect(() => {
        const newPoints = Array.from({ length: 30 }).map(() => ({
            x: Math.random() * 100,
            y: Math.random() * 100,
            delay: Math.random() * 3
        }));
        setPoints(newPoints);
    }, []);

    return (
        <div className="w-full h-full flex items-center justify-center overflow-hidden">
            <div className="relative w-[500px] h-[500px]">
                {/* Outer glow */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500/20 via-cyan-500/20 to-blue-500/20 blur-3xl animate-pulse" />

                {/* Globe sphere */}
                <div className="absolute inset-8 rounded-full bg-gradient-to-br from-slate-900 via-blue-900/30 to-slate-900 border border-cyan-500/20 shadow-2xl overflow-hidden">
                    {/* Grid lines */}
                    <div className="absolute inset-0 opacity-20">
                        {[...Array(8)].map((_, i) => (
                            <div
                                key={`h-${i}`}
                                className="absolute left-0 right-0 border-t border-cyan-400/30"
                                style={{ top: `${(i + 1) * 12}%` }}
                            />
                        ))}
                    </div>

                    {/* Rotating highlight */}
                    <div
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/10 to-transparent animate-spin"
                        style={{ animationDuration: '20s' }}
                    />

                    {/* Activity points */}
                    {points.map((point, i) => (
                        <div
                            key={i}
                            className="absolute w-2 h-2 rounded-full bg-cyan-400 animate-ping"
                            style={{
                                left: `${point.x}%`,
                                top: `${point.y}%`,
                                animationDelay: `${point.delay}s`,
                                animationDuration: '2s'
                            }}
                        />
                    ))}
                </div>

                {/* Atmosphere */}
                <div className="absolute inset-4 rounded-full border-2 border-cyan-400/20 animate-pulse" />
            </div>
        </div>
    );
}
