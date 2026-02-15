import React, { useState } from "react";
import QRCode from "qrcode";
import { Copy, Check, Shield, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const MFASetup = () => {
    const [step, setStep] = useState<"initial" | "scan" | "verify">("initial");
    const [secret, setSecret] = useState("");
    const [uri, setUri] = useState("");
    const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
    const [token, setToken] = useState("");
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(false);

    const startSetup = async () => {
        setLoading(true);
        try {
            const response = await fetch("/api/auth/2fa/setup", { method: "POST" });
            const data = await response.json();

            if (response.ok) {
                setSecret(data.secret);
                setUri(data.uri);

                // Generate QR Code
                const url = await QRCode.toDataURL(data.uri);
                setQrCodeDataUrl(url);

                setStep("scan");
            } else {
                toast.error(data.message || "Failed to setup 2FA");
            }
        } catch (error) {
            console.error("Error setting up 2FA:", error);
            toast.error("Failed to connect to server");
        } finally {
            setLoading(false);
        }
    };

    const verifyCode = async () => {
        if (!token || token.length !== 6) {
            toast.error("Please enter a valid 6-digit code");
            return;
        }

        setLoading(true);
        try {
            const response = await fetch("/api/auth/2fa/enable", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, secret }),
            });

            if (response.ok) {
                toast.success("Two-factor authentication enabled successfully");
                setTimeout(() => window.location.reload(), 1000);
            } else {
                const data = await response.json();
                toast.error(data.message || "Invalid verification code");
            }
        } catch (error) {
            console.error("Error verifying code:", error);
            toast.error("An unexpected error occurred");
        } finally {
            setLoading(false);
        }
    };

    const copySecret = () => {
        navigator.clipboard.writeText(secret);
        setCopied(true);
        toast.success("Secret copied to clipboard");
        setTimeout(() => setCopied(false), 2000);
    };

    if (step === "initial") {
        return (
            <div>
                <p className="text-gray-400 text-sm mb-4">
                    Add an extra layer of security to your account by enabling two-factor authentication.
                </p>
                <button
                    type="button"
                    onClick={startSetup}
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-red-600 text-sm font-medium text-white shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    <Shield className="h-4 w-4" />
                    {loading ? "Initializing..." : "Enable 2FA"}
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="bg-card/50 rounded-lg p-4 border border-border">
                <ol className="list-decimal list-inside space-y-4 text-sm text-foreground">
                    <li className="pl-2">
                        <span className="font-medium text-white">Scan QR Code</span>
                        <p className="text-muted-foreground mt-1 ml-4">
                            Open your authenticator app (Google Authenticator, Authy, etc.) and scan this code.
                        </p>
                        <div className="mt-4 ml-4 flex justify-center bg-white p-4 rounded-lg w-fit">
                            {qrCodeDataUrl && <img src={qrCodeDataUrl} alt="2FA QR Code" className="w-48 h-48" />}
                        </div>
                    </li>
                    <li className="pl-2">
                        <span className="font-medium text-white">Or enter code manually</span>
                        <p className="text-muted-foreground mt-1 ml-4 mb-2">
                            If you can't scan the code, enter this secret key into your app.
                        </p>
                        <div className="ml-4 flex items-center gap-2">
                            <code className="bg-muted px-3 py-1.5 rounded text-xs font-mono border border-border">
                                {secret}
                            </code>
                            <button
                                onClick={copySecret}
                                className="p-1.5 hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-white"
                                title="Copy secret"
                            >
                                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                            </button>
                        </div>
                    </li>
                    <li className="pl-2">
                        <span className="font-medium text-white">Verify Code</span>
                        <div className="mt-2 ml-4 flex gap-3 max-w-sm">
                            <input
                                type="text"
                                value={token}
                                onChange={(e) => setToken(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                                placeholder="000 000"
                                className="flex-1 rounded-lg border border-input bg-background/50 px-4 py-2 text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-center font-mono tracking-widest text-lg"
                                maxLength={6}
                            />
                            <button
                                onClick={verifyCode}
                                disabled={loading || token.length !== 6}
                                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                            >
                                {loading ? "Verifying..." : "Verify"}
                            </button>
                        </div>
                    </li>
                </ol>
            </div>

            <button
                onClick={() => setStep("initial")}
                className="text-sm text-muted-foreground hover:text-white transition-colors"
            >
                Cancel setup
            </button>
        </div>
    );
};
