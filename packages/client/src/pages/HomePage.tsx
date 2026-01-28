import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import AnnouncementsBanner from '../components/AnnouncementsBanner';

export default function HomePage() {
  const { isAuthenticated } = useAuthStore();

  return (
    <div className="min-h-[calc(100vh-12rem)]">
      {/* Hero Section */}
      <section className="relative py-24 sm:py-32 overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-surface/40 via-transparent to-transparent" />
          <div className="absolute -top-24 left-10 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
          <div className="absolute top-10 right-0 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-sand mb-6 tracking-tight leading-tight">
            Play One Piece TCG online with friends
          </h1>
          <p className="text-lg md:text-xl text-muted mb-10 max-w-2xl mx-auto leading-relaxed">
            Ranked matches, deck building, and live duels. Build your deck and start playing for free.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            {isAuthenticated ? (
              <Link to="/lobby" className="btn-primary text-base px-8 py-3">
                Find a Match
              </Link>
            ) : (
              <>
                <Link to="/register" className="btn-primary text-base px-8 py-3">
                  Get Started
                </Link>
                <Link to="/login" className="btn-secondary text-base px-8 py-3">
                  Login
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Announcements */}
      <AnnouncementsBanner />

      {/* Features Grid */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12 text-sand">
            Everything you need to duel
          </h2>
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
      <section className="py-20 bg-gradient-to-r from-primary/80 to-secondary/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-sand mb-4">Ready to play?</h2>
          <p className="text-base text-sand/80 mb-8">
            Join players worldwide and start building your deck today.
          </p>
          <Link
            to={isAuthenticated ? '/lobby' : '/register'}
            className="btn bg-sand text-ink hover:brightness-110 text-base px-8 py-3 font-semibold"
          >
            {isAuthenticated ? 'Find a Match' : 'Get Started for Free'}
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
    <div className="card-hover p-6 text-left">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-xl font-semibold mb-2 text-sand">{title}</h3>
      <p className="text-muted">{description}</p>
    </div>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-4xl font-bold text-accent">{value}</div>
      <div className="text-muted">{label}</div>
    </div>
  );
}
