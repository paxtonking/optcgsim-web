import React from 'react';
import { useAuthStore } from '../stores/authStore';

interface ComingSoonOverlayProps {
  featureName: string;
  children: React.ReactNode;
}

export const ComingSoonOverlay: React.FC<ComingSoonOverlayProps> = ({
  featureName,
  children
}) => {
  const { user } = useAuthStore();

  // Admins can bypass the overlay
  if (user?.isAdmin) {
    return <>{children}</>;
  }

  return (
    <div className="relative min-h-screen">
      {children}
      {/* Overlay */}
      <div className="absolute inset-0 bg-gray-900/90 backdrop-blur-sm flex flex-col items-center justify-center z-50">
        <div className="text-center p-8">
          <div className="text-6xl mb-4">🚧</div>
          <h2 className="text-3xl font-bold text-white mb-2">Coming Soon</h2>
          <p className="text-gray-400 text-lg mb-4">{featureName}</p>
          <p className="text-gray-500 text-sm">This feature is under development and will be available soon.</p>
        </div>
      </div>
    </div>
  );
};

export default ComingSoonOverlay;
