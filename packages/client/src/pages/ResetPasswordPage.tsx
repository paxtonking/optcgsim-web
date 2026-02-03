import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState('');

  const { resetPassword, isLoading, error, successMessage, clearError, clearSuccessMessage } = useAuthStore();

  useEffect(() => {
    // Clear any previous messages when component mounts
    clearError();
    clearSuccessMessage();
  }, [clearError, clearSuccessMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');
    clearError();

    // Validate passwords match
    if (password !== confirmPassword) {
      setValidationError('Passwords do not match');
      return;
    }

    // Validate password length
    if (password.length < 8) {
      setValidationError('Password must be at least 8 characters');
      return;
    }

    if (!token) {
      setValidationError('Invalid reset link. Please request a new password reset.');
      return;
    }

    try {
      await resetPassword(token, password);
    } catch {
      // Error handled in store
    }
  };

  // No token in URL
  if (!token) {
    return (
      <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center px-4">
        <div className="panel max-w-md w-full p-8 text-center">
          <h1 className="text-3xl mb-4">Invalid Link</h1>
          <p className="text-muted mb-6">
            This password reset link is invalid or has expired.
          </p>
          <Link to="/forgot-password" className="btn-primary">
            Request New Link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center px-4">
      <div className="panel max-w-md w-full p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-accent text-center">Account Recovery</p>
        <h1 className="text-3xl text-center mb-6">Reset Password</h1>

        {(error || validationError) && (
          <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-2 rounded mb-4">
            {error || validationError}
            <button
              onClick={() => {
                clearError();
                setValidationError('');
              }}
              className="float-right text-red-400 hover:text-red-300"
            >
              x
            </button>
          </div>
        )}

        {successMessage ? (
          <div className="text-center">
            <div className="bg-green-500/10 border border-green-500 text-green-400 px-4 py-3 rounded mb-4">
              {successMessage}
            </div>
            <button
              onClick={() => navigate('/login')}
              className="btn-primary"
            >
              Go to Login
            </button>
          </div>
        ) : (
          <>
            <p className="text-muted mb-4 text-sm">
              Enter your new password below.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input pr-10"
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white px-2"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Confirm Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input"
                  required
                  minLength={8}
                  placeholder="Confirm your password"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full"
              >
                {isLoading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>
          </>
        )}

        <p className="text-center mt-6 text-muted">
          <Link to="/login" className="text-primary hover:underline">
            Back to Login
          </Link>
        </p>
      </div>
    </div>
  );
}
