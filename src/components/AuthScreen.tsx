import React, { useState } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, updatePassword, signOut } from "firebase/auth";
import { auth } from "../firebase";
import { Tv, KeyRound, UserRound, ArrowRight } from "lucide-react";

export function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    
    const loginEmail = email.includes("@") ? email : `${email}@nextup.local`;
    
    if (!isLogin && password.length < 6) {
      setError("PIN must be at least 6 digits");
      setLoading(false);
      return;
    }

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, loginEmail, password);
      } else {
        // Set onboarding flag before user creation to prevent onAuthStateChanged race condition
        localStorage.setItem('nextup_needs_onboarding', 'true');
        try {
          const cred = await createUserWithEmailAndPassword(auth, loginEmail, password);
          await updateProfile(cred.user, { displayName: name || email });
        } catch (err) {
          localStorage.removeItem('nextup_needs_onboarding');
          throw err;
        }
      }
    } catch (err: any) {
      let friendlyError = err.message;
      if (err.code === "auth/invalid-credential") friendlyError = "Invalid username or PIN.";
      if (err.code === "auth/user-not-found") friendlyError = "User not found.";
      if (err.code === "auth/wrong-password") friendlyError = "Incorrect PIN.";
      if (err.code === "auth/email-already-in-use") friendlyError = "Username is already taken.";
      if (err.code === "auth/too-many-requests") friendlyError = "Too many failed attempts. Try again later.";
      
      setError(friendlyError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-2xl">
        <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-orange-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-orange-500/20">
          <Tv className="w-8 h-8 text-slate-950" />
        </div>
        
        <h1 className="text-4xl font-display font-bold text-slate-900 dark:text-white mb-2 tracking-tight">
          Next<span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600 font-black italic">Up</span>
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 text-lg">
          Track every show. Never lose your place.
        </p>
        
        {true && (
          <div className="flex p-1 bg-slate-800/50 rounded-xl mb-6">
            <button
              onClick={() => { setIsLogin(true); setError(""); }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
                isLogin ? "bg-orange-500 text-slate-950 shadow-md shadow-orange-500/20" : "text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              Sign in
            </button>
            <button
              onClick={() => { setIsLogin(false); setError(""); }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
                !isLogin ? "bg-orange-500 text-slate-950 shadow-md shadow-orange-500/20" : "text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              Register
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">Name</label>
              <div className="relative">
                <UserRound className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-500 dark:text-slate-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-3 pl-11 pr-4 text-slate-900 dark:text-white text-base focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                  placeholder="Alex"
                />
              </div>
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">Username</label>
            <div className="relative">
              <UserRound className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-500 dark:text-slate-400" />
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-3 pl-11 pr-4 text-slate-900 dark:text-white text-base focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                placeholder="alex"
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              🔑 Usernames are strictly case-sensitive (e.g. <span className="font-semibold text-slate-600 dark:text-slate-300">Alex</span> and <span className="font-semibold text-slate-600 dark:text-slate-300">alex</span> are separate accounts).
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">6-digit PIN</label>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-500 dark:text-slate-400" />
              <input
                type="password"
                inputMode="numeric"
                value={password}
                onChange={(e) => setPassword(e.target.value.replace(/[^0-9]/g, ''))}
                required
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-3 pl-11 pr-4 text-slate-900 dark:text-white text-base focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all tracking-[0.3em] font-mono"
                placeholder="••••••"
              />
            </div>
          </div>

          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}

          {isLogin && (
            <div className="text-center mt-4">
              <button
                type="button"
                onClick={() => setError("PINs cannot be reset. If you forgot your PIN, please register a new username.")}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-400 transition-colors"
              >
                Forgot PIN?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-slate-950 font-bold py-3.5 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? "Working..." : isLogin ? "Continue to NextUp" : "Create Account"}
            {!loading && <ArrowRight className="w-5 h-5" />}
          </button>
        </form>
      </div>
    </div>
  );
}
