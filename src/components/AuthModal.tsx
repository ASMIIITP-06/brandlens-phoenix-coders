import React, { useState } from 'react';
import {
  Shield,
  Lock,
  Mail,
  Key,
  LogIn,
  UserPlus,
  Zap,
  AlertTriangle,
  X,
  CheckCircle,
} from 'lucide-react';
import {
  signInWithGoogle,
  signInWithEmail,
  signInAsGuest,
} from '../services/firebase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (email: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGoogle = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const user = await signInWithGoogle();
      onSuccess(user.email || 'Google User');
      onClose();
    } catch (err: any) {
      console.warn('Google sign in error:', err);
      if (err.code === 'auth/popup-blocked') {
        setErrorMsg('The sign-in popup was blocked by the browser. Please allow popups or use Email sign-in below.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setErrorMsg('Domain not yet authorized in Firebase Console > Authentication > Settings > Authorized domains. Use Email / Guest session below.');
      } else {
        setErrorMsg(err.message || 'Google sign-in could not be completed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const user = await signInWithEmail(email.trim(), password);
      onSuccess(user.email || email);
      onClose();
    } catch (err: any) {
      console.warn('Email auth error:', err);
      if (err.code === 'auth/operation-not-allowed') {
        setErrorMsg('Email/Password provider is not yet enabled in the Firebase Console. You can enable it in Firebase Console > Authentication > Sign-in method, or use Quick Workspace Session below.');
      } else {
        setErrorMsg(err.message || 'Authentication failed. Please verify credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGuestSession = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const user = await signInAsGuest();
      onSuccess(user.uid ? `guest-${user.uid.slice(0, 8)}@phoenix.studio` : 'Guest Reviewer');
      onClose();
    } catch (err: any) {
      console.warn('Guest sign in error:', err);
      setErrorMsg(err.message || 'Could not initialize guest session.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemoCredentials = () => {
    setEmail('lead@phoenix.studio');
    setPassword('BrandLens2026!');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-[#151F35] border border-[#283650] rounded-xl max-w-md w-full p-6 shadow-2xl relative space-y-5">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#9AABC5] hover:text-[#EEF3FF] p-1"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="text-center space-y-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#46E3C1] to-[#75D9F5] flex items-center justify-center mx-auto shadow-lg shadow-[#46E3C1]/20">
            <Shield className="w-5 h-5 text-[#0B1020]" />
          </div>
          <h3 className="text-lg font-bold text-[#EEF3FF]">
            Sign in to BrandLens
          </h3>
          <p className="text-xs text-[#9AABC5]">
            Access persistent Firestore brand governance in Phoenix Studio.
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-[#FB7185]/15 border border-[#FB7185]/30 text-xs text-[#FB7185] flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-snug">{errorMsg}</span>
          </div>
        )}

        {/* Primary Action: Google Sign In */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          className="w-full py-2.5 px-4 rounded-xl bg-[#EEF3FF] hover:bg-white text-[#0B1020] text-xs font-bold flex items-center justify-center gap-2.5 shadow-md transition-all cursor-pointer disabled:opacity-50"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Continue with Google</span>
        </button>

        {/* Divider */}
        <div className="flex items-center gap-2 my-2">
          <div className="h-px bg-[#283650] flex-1" />
          <span className="text-[10px] font-mono uppercase text-[#9AABC5]">
            or sign in with email
          </span>
          <div className="h-px bg-[#283650] flex-1" />
        </div>

        {/* Email / Password Form */}
        <form onSubmit={handleEmailAuth} className="space-y-3 text-xs">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-mono uppercase text-[#9AABC5]">
                Work Email
              </label>
              <button
                type="button"
                onClick={fillDemoCredentials}
                className="text-[10px] text-[#46E3C1] hover:underline font-mono"
              >
                Use Demo Login
              </button>
            </div>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 text-[#9AABC5] absolute left-3 top-2.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="lead@phoenix.studio"
                className="w-full bg-[#10192C] border border-[#283650] rounded-lg pl-9 pr-3 py-2 text-[#EEF3FF] focus:outline-none focus:border-[#46E3C1]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase text-[#9AABC5] mb-1">
              Password
            </label>
            <div className="relative">
              <Key className="w-3.5 h-3.5 text-[#9AABC5] absolute left-3 top-2.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#10192C] border border-[#283650] rounded-lg pl-9 pr-3 py-2 text-[#EEF3FF] focus:outline-none focus:border-[#46E3C1]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-[#10192C] hover:bg-[#151F35] border border-[#46E3C1]/50 text-[#46E3C1] font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>{loading ? 'Authenticating...' : 'Sign In with Email'}</span>
          </button>
        </form>

        {/* Quick Authenticated Session Fallback */}
        <div className="pt-2 border-t border-[#283650]/60 text-center">
          <button
            type="button"
            onClick={handleGuestSession}
            disabled={loading}
            className="text-[11px] text-[#9AABC5] hover:text-[#75D9F5] flex items-center justify-center gap-1.5 mx-auto font-mono transition-colors"
          >
            <Zap className="w-3.5 h-3.5 text-[#75D9F5]" />
            <span>Start Quick Authenticated Session</span>
          </button>
        </div>
      </div>
    </div>
  );
};
