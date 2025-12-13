import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { ParticleBackground } from '@/components/ParticleBackground';
import { Card } from '@/components/ui/card';
import { Target, TrendingUp, Network, Zap } from 'lucide-react';

const About = () => {
  const features = [
    {
      icon: Network,
      title: 'Network Mapping',
      description:
        'Visualize journalist connections and relationships in an interactive force-directed graph.',
      color: 'hsl(180, 100%, 50%)',
    },
    {
      icon: TrendingUp,
      title: 'Influence Analysis',
      description:
        'Measure and track journalist influence scores based on articles, reach, and network position.',
      color: 'hsl(300, 100%, 50%)',
    },
    {
      icon: Target,
      title: 'Topic Clustering',
      description:
        'Automatically group journalists by topics and areas of coverage for better insights.',
      color: 'hsl(30, 100%, 50%)',
    },
    {
      icon: Zap,
      title: 'Real-Time Updates',
      description:
        'Live activity feed showing new journalists, articles, and network changes as they happen.',
      color: 'hsl(120, 100%, 50%)',
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <ParticleBackground />
      <Header />

      <main className="pt-32 pb-20 px-6 relative z-10">
        <div className="container mx-auto max-w-4xl">
          {/* Hero */}
          <div className="text-center mb-16">
            <h1 className="text-5xl font-bold font-mono text-foreground mb-4">
              About <span className="text-primary">AtenFlux</span>
            </h1>
            <p className="text-xl text-muted-foreground font-mono">
              Mapping the Media Landscape, One Connection at a Time
            </p>
          </div>

          {/* Mission */}
          <Card className="bg-card border-primary/20 p-8 mb-12">
            <h2 className="text-2xl font-bold font-mono text-primary mb-4">
              Our Mission
            </h2>
            <p className="text-muted-foreground font-mono leading-relaxed mb-4">
              AtenFlux is designed to bring transparency and insight to the world of
              journalism. By mapping journalist networks and analyzing influence
              patterns, we help researchers, media professionals, and curious minds
              understand how information flows through the media ecosystem.
            </p>
            <p className="text-muted-foreground font-mono leading-relaxed">
              Our platform combines real-time data collection, advanced network
              analysis, and interactive visualization to create a comprehensive view of
              the journalist landscape.
            </p>
          </Card>

          {/* Features Grid */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold font-mono text-foreground mb-8 text-center">
              Key Features
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              {features.map((feature) => (
                <Card
                  key={feature.title}
                  className="bg-card border-primary/20 p-6 transition-all hover:scale-105"
                  style={{
                    borderColor: `${feature.color}30`,
                  }}
                >
                  <feature.icon
                    className="w-8 h-8 mb-4"
                    style={{ color: feature.color }}
                  />
                  <h3 className="text-lg font-bold font-mono text-foreground mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground font-mono leading-relaxed">
                    {feature.description}
                  </p>
                </Card>
              ))}
            </div>
          </div>

          {/* Technology */}
          <Card className="bg-card border-primary/20 p-8">
            <h2 className="text-2xl font-bold font-mono text-primary mb-4">
              Technology Stack
            </h2>
            <p className="text-muted-foreground font-mono leading-relaxed mb-6">
              Built with modern web technologies for performance and scalability:
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {['React', 'TypeScript', 'D3.js', 'Tailwind CSS'].map((tech) => (
                <div
                  key={tech}
                  className="bg-muted p-4 text-center border-l-2 border-primary"
                >
                  <span className="text-sm font-mono text-foreground">{tech}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default About;
