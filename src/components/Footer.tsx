import { Github, Linkedin, Mail } from 'lucide-react';
import AtenLogo from '@/assets/Aten.png';

export const Footer = () => {
  return (
    <footer className="bg-card/90 backdrop-blur-sm border-t border-primary/20 py-12 px-6">
      <div className="container mx-auto">
        <div className="grid md:grid-cols-3 gap-8">
          {/* Project Info */}
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <img src={AtenLogo} alt="Aten Logo" className="w-6 h-6 rounded-sm" />
              <span className="text-xl font-bold text-primary font-mono">
                ATENFLUX
              </span>
            </div>
            <p className="text-sm text-foreground font-mono leading-relaxed">
              Real-time journalist network mapping and influence analysis platform.
              Track media connections, analyze influence patterns, and discover the
              journalists shaping today's narratives.
            </p>
          </div>

          
          <div>
            <h4 className="text-sm font-mono uppercase text-primary mb-4">
              Quick Links
            </h4>
            <ul className="space-y-2">
              {['Home','About','Top Journalists','Topics'].map((link) => (
                <li key={link}>
                  <a
                    href={`/${link.toLowerCase().replace(/\s/g,'-')}`}
                    className="text-sm text-foreground font-mono hover:text-primary hover:underline transition-all"
                  >
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Connect */}
          <div>
            <h4 className="text-sm font-mono uppercase text-primary mb-4">
              Connect
            </h4>
            <div className="flex gap-4">
              {[{
                icon: <Github className="w-5 h-5"/>,
                href: "https://github.com"
              },{
                icon: <Linkedin className="w-5 h-5"/>,
                href: "https://linkedin.com"
              },{
                icon: <Mail className="w-5 h-5"/>,
                href: "mailto:contact@atenflux.com"
              }].map((item, i) => (
                <a
                  key={i}
                  href={item.href}
                  target={item.href.startsWith('http') ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  className="w-10 h-10 bg-base-200 flex items-center justify-center rounded-md transition-all hover:bg-primary hover:text-primary-foreground hover:scale-110 shadow-md"
                >
                  {item.icon}
                </a>
              ))}
            </div>
            <p className="text-xs text-foreground mt-4 font-mono">
              Engineered for innovators and journalists worldwide
            </p>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-primary/20 text-center">
          <p className="text-xs text-foreground font-mono">
            © 2025 AtenFlux. All rights reserved. | Made with ❤️ by AtenRise
          </p>
        </div>
      </div>
    </footer>
  );
};
