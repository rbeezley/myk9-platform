import React, { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
} from "@myk9/ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClubFormData, CLUB_TYPES, COUNTRIES } from "@/types/club-types";
import ClubPhotoDialog from "./ClubPhotoDialog";
import { clubSchemas } from "@/lib/validation";
import { Camera } from "lucide-react";

interface EditClubDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: ClubFormData | null;
  handleInputChange: (field: keyof ClubFormData, value: string) => void;
  onSave: () => void;
  isEditMode?: boolean; // true for edit, false for add
}

const EditClubDialog: React.FC<EditClubDialogProps> = ({ 
  open, 
  onOpenChange, 
  formData, 
  handleInputChange, 
  onSave,
  isEditMode = true
}) => {
  const [showPhotoDialog, setShowPhotoDialog] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isValidating, setIsValidating] = useState(false);
  if (!formData) return null;

  const handleCancel = () => {
    onOpenChange(false);
  };

  const validateForm = () => {
    setIsValidating(true);
    const validationResult = clubSchemas.basic.safeParse(formData);
    
    if (!validationResult.success) {
      const newErrors: Record<string, string> = {};
      validationResult.error.issues.forEach((issue) => {
        if (issue.path.length > 0) {
          newErrors[issue.path[0] as string] = issue.message;
        }
      });
      
      // Custom required field validation
      if (!formData.name?.trim()) {
        newErrors.name = 'Club name is required';
      }
      if (!formData.email?.trim()) {
        newErrors.email = 'Email is required';
      }
      if (!formData.phone?.trim()) {
        newErrors.phone = 'Phone number is required';
      }
      if (!formData.street?.trim()) {
        newErrors.street = 'Street address is required';
      }
      if (!formData.city?.trim()) {
        newErrors.city = 'City is required';
      }
      if (!formData.state?.trim()) {
        newErrors.state = 'State/Province is required';
      }
      if (!formData.zipCode?.trim()) {
        newErrors.zipCode = 'ZIP/Postal code is required';
      }
      if (!formData.country?.trim()) {
        newErrors.country = 'Country is required';
      }
      
      setErrors(newErrors);
      return false;
    }
    
    setErrors({});
    return true;
  };

  const handleSave = () => {
    if (validateForm()) {
      onSave();
      onOpenChange(false);
    }
  };

  // Photo handling functions
  const handlePhotoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handlePhotoFile(files[0]);
    }
  };

  const handlePhotoDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handlePhotoDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handlePhotoFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handlePhotoFile(files[0]);
    }
  };

  const handlePhotoFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewImage(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoCancel = () => {
    setPreviewImage(null);
    setShowPhotoDialog(false);
  };

  const handlePhotoSave = (savedImage: string | null) => {
    if (savedImage) {
      handleInputChange('logo', savedImage);
    }
    setShowPhotoDialog(false);
    setPreviewImage(null);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="xl">
        <SheetHeader>
          <SheetTitle>{isEditMode ? 'Edit Club' : 'Add New Club'}</SheetTitle>
          <p className="text-sm text-muted-foreground">
            Fields marked with * are required
          </p>
        </SheetHeader>

        <SheetBody>
          {/* Validation Summary */}
          {isValidating && Object.values(errors).some(error => error && error.trim()) && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <h4 className="text-sm font-semibold text-red-800 mb-2">Please fix the following errors:</h4>
              <ul className="text-sm text-red-700 space-y-1">
                {Object.entries(errors)
                  .filter(([, message]) => message && message.trim())
                  .map(([field, message]) => (
                    <li key={field}>• {message}</li>
                  ))}
              </ul>
            </div>
          )}

          {/* Logo Upload Section */}
          <div className="mb-6">
            <h3 className="form-section-title">Club Logo</h3>
            <div className="form-field">
              <label className="form-label">Logo (optional)</label>
              <div className="flex items-center gap-4">
                {formData.logo && (
                  <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-border">
                    <img
                      src={formData.logo}
                      alt="Club Logo"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPhotoDialog(true)}
                  className="flex items-center gap-2"
                >
                  <Camera className="h-4 w-4" />
                  {formData.logo ? 'Change Logo' : 'Upload Logo'}
                </Button>
              </div>
            </div>
          </div>

          {/* First Row - Club Name and Club Number */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="form-field">
              <label className="form-label required">Club Name</label>
              <Input
                value={formData.name || ''}
                onChange={(e) => {
                  handleInputChange('name', e.target.value);
                  if (errors.name && e.target.value.trim()) {
                    setErrors(prev => {
                      const { name, ...rest } = prev;
                      void name; // Suppress unused variable warning
                      return rest;
                    });
                  }
                }}
                placeholder="Enter club name"
                className={`form-input h-10 ${errors.name ? 'border-red-500' : ''}`}
              />
              {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name}</p>}
            </div>
            <div className="form-field">
              <label className="form-label">Club Number</label>
              <Input
                value={formData.clubNumber || ''}
                onChange={(e) => handleInputChange('clubNumber', e.target.value)}
                placeholder="Enter club number (optional)"
                className="form-input h-10"
              />
            </div>
          </div>

          {/* Second Row - Contact Information */}
          <div className="mb-4">
            <h3 className="form-section-title">Contact Information</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="form-field">
                <label className="form-label required">Email</label>
                <Input
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => {
                    handleInputChange('email', e.target.value);
                    if (errors.email && e.target.value.trim()) {
                      setErrors(prev => {
                        const { email, ...rest } = prev;
                        void email; // Suppress unused variable warning
                        return rest;
                      });
                    }
                  }}
                  placeholder="Enter email address"
                  className={`form-input h-10 ${errors.email ? 'border-red-500' : ''}`}
                />
                {errors.email && <p className="text-sm text-red-500 mt-1">{errors.email}</p>}
              </div>
              <div className="form-field">
                <label className="form-label required">Phone</label>
                <Input
                  type="tel"
                  value={formData.phone || ''}
                  onChange={(e) => {
                    handleInputChange('phone', e.target.value);
                    if (errors.phone && e.target.value.trim()) {
                      setErrors(prev => {
                        const { phone, ...rest } = prev;
                        void phone; // Suppress unused variable warning
                        return rest;
                      });
                    }
                  }}
                  placeholder="Enter phone number"
                  className={`form-input h-10 ${errors.phone ? 'border-red-500' : ''}`}
                />
                {errors.phone && <p className="text-sm text-red-500 mt-1">{errors.phone}</p>}
              </div>
            </div>
            <div className="form-field">
              <label className="form-label">Website</label>
              <Input
                type="url"
                value={formData.website || ''}
                onChange={(e) => handleInputChange('website', e.target.value)}
                placeholder="https://www.clubwebsite.com"
                className="form-input h-10"
              />
            </div>
          </div>

          {/* Third Row - Address */}
          <div className="mb-4">
            <h3 className="form-section-title">Address</h3>
            <div className="space-y-4">
              <div className="form-field">
                <label className="form-label required">Street Address</label>
                <Input
                  value={formData.street || ''}
                  onChange={(e) => {
                    handleInputChange('street', e.target.value);
                    if (errors.street && e.target.value.trim()) {
                      setErrors(prev => {
                        const { street, ...rest } = prev;
                        void street; // Suppress unused variable warning
                        return rest;
                      });
                    }
                  }}
                  placeholder="123 Main Street"
                  className={`form-input h-10 ${errors.street ? 'border-red-500' : ''}`}
                />
                {errors.street && <p className="text-sm text-red-500 mt-1">{errors.street}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-field">
                  <label className="form-label required">City</label>
                  <Input
                    value={formData.city || ''}
                    onChange={(e) => {
                      handleInputChange('city', e.target.value);
                      if (errors.city && e.target.value.trim()) {
                        setErrors(prev => {
                          const { city, ...rest } = prev;
                          void city; // Suppress unused variable warning
                          return rest;
                        });
                      }
                    }}
                    placeholder="City"
                    className={`form-input h-10 ${errors.city ? 'border-red-500' : ''}`}
                  />
                  {errors.city && <p className="text-sm text-red-500 mt-1">{errors.city}</p>}
                </div>
                <div className="form-field">
                  <label className="form-label required">State/Province</label>
                  <Input
                    value={formData.state || ''}
                    onChange={(e) => {
                      handleInputChange('state', e.target.value);
                      if (errors.state && e.target.value.trim()) {
                        setErrors(prev => {
                          const { state, ...rest } = prev;
                          void state; // Suppress unused variable warning
                          return rest;
                        });
                      }
                    }}
                    placeholder="State or Province"
                    className={`form-input h-10 ${errors.state ? 'border-red-500' : ''}`}
                  />
                  {errors.state && <p className="text-sm text-red-500 mt-1">{errors.state}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-field">
                  <label className="form-label required">ZIP/Postal Code</label>
                  <Input
                    value={formData.zipCode || ''}
                    onChange={(e) => {
                      handleInputChange('zipCode', e.target.value);
                      if (errors.zipCode && e.target.value.trim()) {
                        setErrors(prev => {
                          const { zipCode, ...rest } = prev;
                          void zipCode; // Suppress unused variable warning
                          return rest;
                        });
                      }
                    }}
                    placeholder="12345 or A1B 2C3"
                    className={`form-input h-10 ${errors.zipCode ? 'border-red-500' : ''}`}
                  />
                  {errors.zipCode && <p className="text-sm text-red-500 mt-1">{errors.zipCode}</p>}
                </div>
                <div className="form-field">
                  <label className="form-label required">Country</label>
                  <Select
                    value={formData.country || ''}
                    onValueChange={(value) => {
                      handleInputChange('country', value);
                      if (errors.country && value) {
                        setErrors(prev => {
                          const { country, ...rest } = prev;
                          void country; // Suppress unused variable warning
                          return rest;
                        });
                      }
                    }}
                  >
                    <SelectTrigger className={`form-input h-10 ${errors.country ? 'border-red-500' : ''}`}>
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((country) => (
                        <SelectItem key={country.value} value={country.value}>
                          {country.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.country && <p className="text-sm text-red-500 mt-1">{errors.country}</p>}
                </div>
              </div>
            </div>
          </div>

          {/* Additional Information */}
          <div className="mb-4">
            <h3 className="form-section-title">Additional Information</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="form-field">
                <label className="form-label">Club Type</label>
                <Select
                  value={formData.clubType || ''}
                  onValueChange={(value) => handleInputChange('clubType', value)}
                >
                  <SelectTrigger className="form-input h-10">
                    <SelectValue placeholder="Select club type" />
                  </SelectTrigger>
                  <SelectContent>
                    {CLUB_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="form-field">
                <label className="form-label">Founded</label>
                <Input
                  type="date"
                  value={formData.founded || ''}
                  onChange={(e) => handleInputChange('founded', e.target.value)}
                  className="form-input h-10"
                />
              </div>
            </div>
            <div className="form-field">
              <label className="form-label">Description</label>
              <Textarea
                value={formData.description || ''}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Enter club description"
                className="form-input min-h-[80px]"
              />
            </div>
          </div>
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            {isEditMode ? 'Save Changes' : 'Create Club'}
          </Button>
        </SheetFooter>

        {/* Photo Upload Dialog */}
        <ClubPhotoDialog
          open={showPhotoDialog}
          onOpenChange={setShowPhotoDialog}
          previewImage={previewImage}
          currentPhoto={formData.logo || ''}
          isDragging={isDragging}
          onDrop={handlePhotoDrop}
          onDragOver={handlePhotoDragOver}
          onDragLeave={handlePhotoDragLeave}
          onFileInput={handlePhotoFileInput}
          onCancel={handlePhotoCancel}
          onSave={handlePhotoSave}
        />
      </SheetContent>
    </Sheet>
  );
};

export default EditClubDialog;