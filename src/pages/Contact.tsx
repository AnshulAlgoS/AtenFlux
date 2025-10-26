import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { ParticleBackground } from '@/components/ParticleBackground';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Mail, Github, Linkedin, Send } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const Contact = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success('Message sent! We\'ll get back to you soon.');
    setFormData({ name: '', email: '', message: '' });
  };

  return (
    <div className="min-h-screen bg-background">
      <ParticleBackground />
      <Header />

      <main className="pt-32 pb-20 px-6 relative z-10">
        <div className="container mx-auto max-w-4xl">
          {/* Hero */}
          <div className="text-center mb-16">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Mail className="text-primary w-12 h-12" />
              <h1 className="text-5xl font-bold font-mono text-foreground">
                Get in <span className="text-primary">Touch</span>
              </h1>
            </div>
            <p className="text-xl text-muted-foreground font-mono">
              Questions, feedback, or collaboration ideas? We'd love to hear from you.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            {/* Contact Cards */}
            <Card className="bg-card border-primary/20 p-6 text-center">
              <Mail className="w-8 h-8 text-primary mx-auto mb-4" />
              <h3 className="text-sm font-mono uppercase text-foreground mb-2">
                Email
              </h3>
              <p className="text-sm text-muted-foreground font-mono">
                contact@atenflux.com
              </p>
            </Card>

            <Card className="bg-card border-primary/20 p-6 text-center">
              <Github className="w-8 h-8 text-primary mx-auto mb-4" />
              <h3 className="text-sm font-mono uppercase text-foreground mb-2">
                GitHub
              </h3>
              <p className="text-sm text-muted-foreground font-mono">
                github.com/atenflux
              </p>
            </Card>

            <Card className="bg-card border-primary/20 p-6 text-center">
              <Linkedin className="w-8 h-8 text-primary mx-auto mb-4" />
              <h3 className="text-sm font-mono uppercase text-foreground mb-2">
                LinkedIn
              </h3>
              <p className="text-sm text-muted-foreground font-mono">
                linkedin.com/company/atenflux
              </p>
            </Card>
          </div>

          {/* Contact Form */}
          <Card className="bg-card border-primary/20 p-8">
            <h2 className="text-2xl font-bold font-mono text-primary mb-6">
              Send us a message
            </h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-mono uppercase text-muted-foreground mb-2">
                  Name
                </label>
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Your name"
                  className="bg-muted border-primary/20"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-mono uppercase text-muted-foreground mb-2">
                  Email
                </label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  placeholder="your.email@example.com"
                  className="bg-muted border-primary/20"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-mono uppercase text-muted-foreground mb-2">
                  Message
                </label>
                <Textarea
                  value={formData.message}
                  onChange={(e) =>
                    setFormData({ ...formData, message: e.target.value })
                  }
                  placeholder="Tell us what's on your mind..."
                  className="bg-muted border-primary/20 min-h-[150px]"
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 glow-cyan"
              >
                <Send className="mr-2 h-4 w-4" />
                Send Message
              </Button>
            </form>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Contact;
