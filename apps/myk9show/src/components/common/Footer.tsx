import React from 'react';

const Footer: React.FC = () => (
  <footer className="bg-background text-muted-foreground pt-16 pb-8 transition-colors duration-300 border-t mt-12">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
        <div>
          <h4 className="font-semibold mb-4 text-foreground">Follow Us</h4>
          <div className="flex space-x-4">
            <a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 cursor-pointer transition-colors"><i className="fab fa-facebook-f"></i></a>
            <a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 cursor-pointer transition-colors"><i className="fab fa-twitter"></i></a>
            <a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 cursor-pointer transition-colors"><i className="fab fa-instagram"></i></a>
            <a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 cursor-pointer transition-colors"><i className="fab fa-linkedin-in"></i></a>
          </div>
        </div>
        <div>
          <h4 className="font-semibold mb-4 text-foreground">Product</h4>
          <ul className="space-y-2">
            <li><a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 cursor-pointer transition-colors">Features</a></li>
            <li><a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 cursor-pointer transition-colors">Pricing</a></li>
            <li><a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 cursor-pointer transition-colors">Integrations</a></li>
            <li><a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 cursor-pointer transition-colors">Updates</a></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold mb-4 text-foreground">Resources</h4>
          <ul className="space-y-2">
            <li><a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 cursor-pointer transition-colors">Documentation</a></li>
            <li><a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 cursor-pointer transition-colors">Guides</a></li>
            <li><a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 cursor-pointer transition-colors">Support Center</a></li>
            <li><a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 cursor-pointer transition-colors">Community</a></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold mb-4 text-foreground">Company</h4>
          <ul className="space-y-2">
            <li><a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 cursor-pointer transition-colors">About Us</a></li>
            <li><a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 cursor-pointer transition-colors">Blog</a></li>
            <li><a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 cursor-pointer transition-colors">Careers</a></li>
            <li><a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 cursor-pointer transition-colors">Contact</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border pt-8">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <p className="text-sm"> {new Date().getFullYear()} myK9Show. All rights reserved.</p>
          <div className="flex space-x-6 mt-4 md:mt-0">
            <a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 text-sm transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 text-sm transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-blue-700 dark:hover:text-blue-400 text-sm transition-colors">Cookie Policy</a>
          </div>
        </div>
      </div>
    </div>
  </footer>
);

export default Footer;
