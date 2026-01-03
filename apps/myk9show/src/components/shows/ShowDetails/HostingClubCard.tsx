import React from "react";
import { Button } from "@/components/ui/button";

const HostingClubCard: React.FC = () => (
  <div className="col-span-1">
    <div className="overflow-hidden card">
      <div className="h-48 overflow-hidden">
        <img
          src="https://readdy.ai/api/search-image?query=professional%20dog%20show%20club%20logo%20on%20a%20clean%20minimal%20background%2C%20elegant%20design%20with%20silhouette%20of%20a%20show%20dog%2C%20corporate%20identity%20for%20a%20dog%20show%20organization%2C%20professional%20branding%2C%20high%20quality&width=600&height=400&seq=club1&orientation=landscape"
          alt="Hosting Club"
          className="w-full h-full object-cover object-top"
        />
      </div>
      <div className="p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-2">National Kennel Club</h3>
        <p className="text-gray-600 mb-4">Established in 1985, organizing premium dog shows and competitions nationwide.</p>
        <div className="space-y-2">
          <div className="flex items-center text-gray-700">
            <i className="fas fa-map-marker-alt w-5"></i>
            <a
              href="https://www.google.com/maps/search/?api=1&query=123+Kennel+Drive+Dogtown+CA+94123"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 hover:text-blue-600 transition-colors"
            >
              123 Kennel Drive, Dogtown, CA 94123
            </a>
          </div>
          <div className="flex items-center text-gray-700">
            <i className="fas fa-phone w-5"></i>
            <span className="ml-2">(555) 123-4567</span>
          </div>
          <div className="flex items-center text-gray-700">
            <i className="fas fa-envelope w-5"></i>
            <a href="mailto:contact@nationalkennelclub.com" className="ml-2 hover:text-blue-600 transition-colors">contact@nationalkennelclub.com</a>
          </div>
          <div className="flex items-center text-gray-700">
            <i className="fas fa-globe w-5"></i>
            <a href="http://www.nationalkennelclub.com" target="_blank" rel="noopener noreferrer" className="ml-2 hover:text-blue-600 transition-colors">www.nationalkennelclub.com</a>
          </div>
        </div>
        <Button className="w-full mt-6 !rounded-button whitespace-nowrap cursor-pointer">
          Visit Club Page
        </Button>
      </div>
    </div>
  </div>
);

export default HostingClubCard;
