import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export default function HomePage() {
  const { isAuthenticated } = useAuthStore();

  return (
    <div className="min-h-[calc(100vh-12rem)]">
      {/* Hero Section */}
      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-secondary/20" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-display text-6xl md:text-8xl text-white mb-6">
            OPTCG<span className="text-accent">SIM</span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Play One Piece Trading Card Game online. Free, no download required.
          </p>
          <div className="flex justify-center gap-4">
            {isAuthenticated ? (
              <Link to="/lobby" className="btn-primary text-lg px-8 py-3">
                Play Now
              </Link>
            ) : (
              <>
                <Link to="/register" className="btn-primary text-lg px-8 py-3">
                  Get Started
                </Link>
                <Link to="/login" className="btn-secondary text-lg px-8 py-3">
                  Login
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 bg-surface/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12">Features</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              title="Ranked Matches"
              description="Climb the leaderboard with ELO-based ranking. Compete against players worldwide."
              icon="🏆"
            />
            <FeatureCard
              title="Deck Builder"
              description="Build and save unlimited decks with our intuitive deck builder and card search."
              icon="🃏"
            />
            <FeatureCard
              title="All Cards Available"
              description="Complete card library with all sets from OP01 to the latest release."
              icon="📚"
            />
            <FeatureCard
              title="Practice vs AI"
              description="Hone your skills against AI opponents of varying difficulty levels."
              icon="🤖"
            />
            <FeatureCard
              title="Match Replays"
              description="Watch and learn from your matches with full replay functionality."
              icon="📹"
            />
            <FeatureCard
              title="Social Features"
              description="Add friends, challenge them directly, and chat during matches."
              icon="👥"
            />
          </div>
        </div>
      </section>

      {/* Quick Stats */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 text-center">
            <StatCard value="4,800+" label="Cards" />
            <StatCard value="50+" label="Card Sets" />
            <StatCard value="Free" label="To Play" />
            <StatCard value="24/7" label="Online" />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-primary to-secondary">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Duel?</h2>
          <p className="text-lg text-white/80 mb-8">
            Join thousands of players and start building your deck today.
          </p>
          <Link
            to={isAuthenticated ? '/lobby' : '/register'}
            className="btn bg-white text-primary hover:bg-gray-100 text-lg px-8 py-3"
          >
            {isAuthenticated ? 'Find a Match' : 'Create Free Account'}
          </Link>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <div className="card p-6 text-center">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-gray-400">{description}</p>
    </div>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-4xl font-bold text-accent">{value}</div>
      <div className="text-gray-400">{label}</div>
    </div>
  );
}
