import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const { forgotPassword, isLoading, error, successMessage, clearError, clearSuccessMessage } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    clearSuccessMessage();
    try {
      await forgotPassword(email);
    } catch {
      // Error handled in store
    }
  };

  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center px-4">
      <div className="panel max-w-md w-full p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-accent text-center">Account Recovery</p>
        <h1 className="text-3xl text-center mb-6">Forgot Password</h1>

        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-2 rounded mb-4">
            {error}
            <button
              onClick={clearError}
              className="float-right text-red-400 hover:text-red-300"
            >
              x
            </button>
          </div>
        )}

        {successMessage && (
          <div className="bg-green-500/10 border border-green-500 text-green-400 px-4 py-3 rounded mb-4">
            {successMessage}
          </div>
        )}

        {!successMessage ? (
          <>
            <p className="text-muted mb-4 text-sm">
              Enter your email address and we'll send you a link to reset your password.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  required
                  placeholder="your@email.com"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full"
              >
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
          </>
        ) : (
          <div className="text-center">
            <p className="text-muted mb-4">
              Check your email for a link to reset your password. The link will expire in 1 hour.
            </p>
            <button
              onClick={() => {
                clearSuccessMessage();
                setEmail('');
              }}
              className="btn-secondary"
            >
              Send Another Link
            </button>
          </div>
        )}

        <p className="text-center mt-6 text-muted">
          Remember your password?{' '}
          <Link to="/login" className="text-primary hover:underline">
            Back to Login
          </Link>
        </p>
      </div>
    </div>
  );
}
