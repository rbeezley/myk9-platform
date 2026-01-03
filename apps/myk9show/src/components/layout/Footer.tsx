import { Mail, Phone, MapPin, Github, Twitter, Linkedin, Facebook, Instagram } from 'lucide-react';

export default function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="bg-background text-muted-foreground border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
          {/* Company info */}
          <div>
            <h3 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-blue-400 dark:from-blue-400 dark:to-blue-300 mb-4">
              myK9Show
            </h3>
            <p className="mb-4">
              Transforming dog show management with innovative technology solutions.
            </p>
            <div className="space-y-2">
              <div className="flex items-center">
                <Mail size={16} className="mr-2" />
                <span>info@myk9show.com</span>
              </div>
              <div className="flex items-center">
                <Phone size={16} className="mr-2" />
                <span>+1 (555) 123-4567</span>
              </div>
              <div className="flex items-center">
                <MapPin size={16} className="mr-2" />
                <span>San Francisco, CA</span>
              </div>
            </div>
          </div>
          {/* Links */}
          <div>
            <h4 className="text-lg font-semibold text-foreground mb-4">
              Product
            </h4>
            <ul className="space-y-2">
              <li>
                <a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors" style={{ WebkitTextFillColor: 'unset' }}>
                  Features
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors" style={{ WebkitTextFillColor: 'unset' }}>
                  Pricing
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors" style={{ WebkitTextFillColor: 'unset' }}>
                  Testimonials
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors" style={{ WebkitTextFillColor: 'unset' }}>
                  Upcoming Events
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors" style={{ WebkitTextFillColor: 'unset' }}>
                  Release Notes
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-lg font-semibold text-foreground mb-4">
              Company
            </h4>
            <ul className="space-y-2">
              <li>
                <a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors" style={{ WebkitTextFillColor: 'unset' }}>
                  About Us
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors" style={{ WebkitTextFillColor: 'unset' }}>
                  Careers
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors" style={{ WebkitTextFillColor: 'unset' }}>
                  Blog
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors" style={{ WebkitTextFillColor: 'unset' }}>
                  Press
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors" style={{ WebkitTextFillColor: 'unset' }}>
                  Contact
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-lg font-semibold text-foreground mb-4">
              Support
            </h4>
            <ul className="space-y-2">
              <li>
                <a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors" style={{ WebkitTextFillColor: 'unset' }}>
                  Help Center
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors" style={{ WebkitTextFillColor: 'unset' }}>
                  Documentation
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors" style={{ WebkitTextFillColor: 'unset' }}>
                  Status
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors" style={{ WebkitTextFillColor: 'unset' }}>
                  API
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors" style={{ WebkitTextFillColor: 'unset' }}>
                  Community
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="pt-8 border-t border-border">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="mb-4 md:mb-0">
              &copy; {currentYear} myK9Show. All rights reserved.
            </p>
            <div className="flex space-x-4">
              <a 
                href="#" 
                className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                aria-label="Twitter"
                style={{ WebkitTextFillColor: 'unset' }}
              >
                <Twitter size={20} />
              </a>
              <a 
                href="#" 
                className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                aria-label="Facebook"
                style={{ WebkitTextFillColor: 'unset' }}
              >
                <Facebook size={20} />
              </a>
              <a 
                href="#" 
                className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                aria-label="Instagram"
                style={{ WebkitTextFillColor: 'unset' }}
              >
                <Instagram size={20} />
              </a>
              <a 
                href="#" 
                className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                aria-label="LinkedIn"
                style={{ WebkitTextFillColor: 'unset' }}
              >
                <Linkedin size={20} />
              </a>
              <a 
                href="#" 
                className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                aria-label="GitHub"
                style={{ WebkitTextFillColor: 'unset' }}
              >
                <Github size={20} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
