import { Mail } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-background text-muted-foreground border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="flex flex-col md:flex-row md:justify-between gap-8 mb-8">
          <div>
            <h3 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-blue-400 dark:from-blue-400 dark:to-blue-300 mb-4">
              myK9Show
            </h3>
            <p className="mb-4 max-w-sm">Dog show management software for clubs and exhibitors.</p>
            <div className="flex items-center">
              <Mail size={16} className="mr-2" />
              <a
                href="mailto:hello@myk9show.com"
                className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
              >
                hello@myk9show.com
              </a>
            </div>
          </div>
          <div>
            <h4 className="text-lg font-semibold text-foreground mb-4">Legal</h4>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/terms"
                  className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                >
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link
                  to="/privacy"
                  className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  to="/sms"
                  className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                >
                  SMS Ring Alerts
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="pt-8 border-t border-border">
          <p>&copy; {currentYear} myK9Show. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
