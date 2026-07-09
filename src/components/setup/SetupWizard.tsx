import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { Database, Server, User, ChevronRight, CheckCircle2, ArrowRight, ShieldCheck, Mail, Lock, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const stepVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.4, ease: "easeOut" } },
  exit: { opacity: 0, x: -20, transition: { duration: 0.2, ease: "easeIn" } }
};

export default function SetupWizard() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [dbType, setDbType] = useState("sqlite");
  const [dbUrl, setDbUrl] = useState("");

  const [cacheType, setCacheType] = useState("local");
  const [redisUrl, setRedisUrl] = useState("");

  const [adminUser, setAdminUser] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: ""
  });

  const handleNext = () => setStep(step + 1);
  const handleBack = () => setStep(step - 1);

  const handleSubmit = async () => {
    if (adminUser.password !== adminUser.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    
    if (!adminUser.username || !adminUser.email || !adminUser.password) {
      setError("Please fill out all admin fields");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          database: {
            driver: dbType,
            url: dbType === "sqlite" ? "file:./data/opencodehub.db" : dbUrl
          },
          cache: {
            type: cacheType,
            url: cacheType === "local" ? "" : redisUrl
          },
          admin: {
            username: adminUser.username,
            email: adminUser.email,
            password: adminUser.password
          }
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to setup");

      window.location.href = "/";
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  const steps = [
    { num: 1, title: "Database", icon: Database },
    { num: 2, title: "Caching", icon: Server },
    { num: 3, title: "Administrator", icon: ShieldCheck }
  ];

  return (
    <div className="w-full max-w-3xl mx-auto rounded-3xl overflow-hidden shadow-[0_0_80px_-20px_rgba(139,92,246,0.3)] bg-[#0d1117]/80 backdrop-blur-xl border border-white/10 flex flex-col min-h-[600px]">
      
      {/* Progress Header */}
      <div className="flex border-b border-white/5 bg-white/[0.02]">
        {steps.map((s, idx) => {
          const isActive = step === s.num;
          const isPast = step > s.num;
          const Icon = s.icon;
          return (
            <div key={s.num} className={cn(
              "flex-1 p-4 flex items-center justify-center border-b-2 transition-all duration-300",
              isActive ? "border-violet-500 text-white" : isPast ? "border-green-500 text-green-400" : "border-transparent text-gray-500"
            )}>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs",
                  isActive ? "bg-violet-500 text-white" : isPast ? "bg-green-500 text-black" : "bg-white/10"
                )}>
                  {isPast ? <Check className="w-4 h-4" /> : s.num}
                </div>
                <span className="hidden sm:inline font-medium">{s.title}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-8 md:p-12 relative overflow-hidden">
        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-red-500" />
            <span className="text-sm font-medium">{error}</span>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" variants={stepVariants} initial="hidden" animate="visible" exit="exit" className="space-y-8">
              <div>
                <h2 className="text-2xl font-bold mb-2 text-white">Configure Database</h2>
                <p className="text-gray-400">Select the storage backend for OpenCodeHub.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div 
                  onClick={() => setDbType("sqlite")}
                  className={cn(
                    "relative p-6 rounded-2xl cursor-pointer transition-all duration-300 border-2 group hover:-translate-y-1",
                    dbType === "sqlite" ? "border-violet-500 bg-violet-500/10" : "border-white/10 bg-white/5 hover:border-white/20"
                  )}
                >
                  <div className="absolute top-4 right-4">
                    <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center", dbType === "sqlite" ? "border-violet-500" : "border-white/20 group-hover:border-white/40")}>
                      {dbType === "sqlite" && <div className="w-2.5 h-2.5 bg-violet-500 rounded-full" />}
                    </div>
                  </div>
                  <Database className={cn("w-8 h-8 mb-4", dbType === "sqlite" ? "text-violet-400" : "text-gray-400")} />
                  <h3 className="text-lg font-semibold text-white mb-1">Local (SQLite)</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">Zero-configuration standalone setup. Ideal for local dev, single VPS, or NAS deployments.</p>
                </div>

                <div 
                  onClick={() => setDbType("postgres")}
                  className={cn(
                    "relative p-6 rounded-2xl cursor-pointer transition-all duration-300 border-2 group hover:-translate-y-1",
                    dbType === "postgres" ? "border-violet-500 bg-violet-500/10" : "border-white/10 bg-white/5 hover:border-white/20"
                  )}
                >
                  <div className="absolute top-4 right-4">
                    <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center", dbType === "postgres" ? "border-violet-500" : "border-white/20 group-hover:border-white/40")}>
                      {dbType === "postgres" && <div className="w-2.5 h-2.5 bg-violet-500 rounded-full" />}
                    </div>
                  </div>
                  <Server className={cn("w-8 h-8 mb-4", dbType === "postgres" ? "text-violet-400" : "text-gray-400")} />
                  <h3 className="text-lg font-semibold text-white mb-1">PostgreSQL</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">High-performance production database. Required for multi-node setups and large teams.</p>
                </div>
              </div>

              {dbType === "postgres" && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-3">
                  <Label className="text-gray-300">Connection String</Label>
                  <Input 
                    placeholder="postgresql://user:password@localhost:5432/opencodehub" 
                    value={dbUrl}
                    onChange={(e) => setDbUrl(e.target.value)}
                    className="bg-black/50 border-white/10 focus:border-violet-500 focus:ring-violet-500 h-12 text-base"
                  />
                </motion.div>
              )}
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" variants={stepVariants} initial="hidden" animate="visible" exit="exit" className="space-y-8">
              <div>
                <h2 className="text-2xl font-bold mb-2 text-white">Performance Layer</h2>
                <p className="text-gray-400">Configure caching to accelerate repository indexing and API requests.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div 
                  onClick={() => setCacheType("local")}
                  className={cn(
                    "relative p-6 rounded-2xl cursor-pointer transition-all duration-300 border-2 group hover:-translate-y-1",
                    cacheType === "local" ? "border-emerald-500 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:border-white/20"
                  )}
                >
                  <div className="absolute top-4 right-4">
                    <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center", cacheType === "local" ? "border-emerald-500" : "border-white/20 group-hover:border-white/40")}>
                      {cacheType === "local" && <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />}
                    </div>
                  </div>
                  <Database className={cn("w-8 h-8 mb-4", cacheType === "local" ? "text-emerald-400" : "text-gray-400")} />
                  <h3 className="text-lg font-semibold text-white mb-1">Local Memory</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">Fast on-device caching. Recommended for single-instance deployments.</p>
                </div>

                <div 
                  onClick={() => setCacheType("redis")}
                  className={cn(
                    "relative p-6 rounded-2xl cursor-pointer transition-all duration-300 border-2 group hover:-translate-y-1",
                    cacheType === "redis" ? "border-emerald-500 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:border-white/20"
                  )}
                >
                  <div className="absolute top-4 right-4">
                    <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center", cacheType === "redis" ? "border-emerald-500" : "border-white/20 group-hover:border-white/40")}>
                      {cacheType === "redis" && <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />}
                    </div>
                  </div>
                  <Server className={cn("w-8 h-8 mb-4", cacheType === "redis" ? "text-emerald-400" : "text-gray-400")} />
                  <h3 className="text-lg font-semibold text-white mb-1">External Redis</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">Distributed caching. Essential for High Availability and horizontal scaling.</p>
                </div>
              </div>

              {cacheType === "redis" && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-3">
                  <Label className="text-gray-300">Redis URL</Label>
                  <Input 
                    placeholder="redis://localhost:6379" 
                    value={redisUrl}
                    onChange={(e) => setRedisUrl(e.target.value)}
                    className="bg-black/50 border-white/10 focus:border-emerald-500 focus:ring-emerald-500 h-12 text-base"
                  />
                </motion.div>
              )}
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" variants={stepVariants} initial="hidden" animate="visible" exit="exit" className="space-y-8">
              <div>
                <h2 className="text-2xl font-bold mb-2 text-white">Create Administrator</h2>
                <p className="text-gray-400">Set up the initial master account for platform administration.</p>
              </div>

              <div className="space-y-5 bg-white/5 p-6 rounded-2xl border border-white/10">
                <div className="space-y-2">
                  <Label className="text-gray-300">Username</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input 
                      value={adminUser.username}
                      onChange={(e) => setAdminUser({...adminUser, username: e.target.value})}
                      className="pl-10 bg-black/50 border-white/10 focus:border-blue-500 h-11"
                      placeholder="admin"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-gray-300">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input 
                      type="email"
                      value={adminUser.email}
                      onChange={(e) => setAdminUser({...adminUser, email: e.target.value})}
                      className="pl-10 bg-black/50 border-white/10 focus:border-blue-500 h-11"
                      placeholder="admin@example.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-300">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input 
                        type="password"
                        value={adminUser.password}
                        onChange={(e) => setAdminUser({...adminUser, password: e.target.value})}
                        className="pl-10 bg-black/50 border-white/10 focus:border-blue-500 h-11"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-gray-300">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input 
                        type="password"
                        value={adminUser.confirmPassword}
                        onChange={(e) => setAdminUser({...adminUser, confirmPassword: e.target.value})}
                        className="pl-10 bg-black/50 border-white/10 focus:border-blue-500 h-11"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Navigation */}
      <div className="p-6 bg-black/20 border-t border-white/5 flex items-center justify-between">
        {step > 1 ? (
          <Button variant="ghost" onClick={handleBack} className="text-gray-400 hover:text-white hover:bg-white/5">
            Back
          </Button>
        ) : (
          <div /> // Spacer
        )}
        
        {step < 3 ? (
          <Button onClick={handleNext} className="bg-white text-black hover:bg-gray-200 h-11 px-8 rounded-xl font-medium shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:shadow-[0_0_30px_rgba(255,255,255,0.5)] transition-all">
            Continue <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={loading} className="bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white h-11 px-8 rounded-xl font-medium shadow-[0_0_30px_rgba(139,92,246,0.5)] border-0 transition-all">
            {loading ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Initializing Platform...
              </span>
            ) : (
              <span className="flex items-center">
                Complete Setup <CheckCircle2 className="w-4 h-4 ml-2" />
              </span>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
