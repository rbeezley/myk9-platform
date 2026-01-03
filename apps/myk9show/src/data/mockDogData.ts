import type { Dog, Owner } from '@/types/dog-types';

export const mockDog: Dog = {
  id: "1",
  name: "Champion Bella the Beagle",
  breed: "Beagle", // Required field
  sex: "female", // Required field
  age: 3,
  description: "Friendly and energetic beagle with excellent show performance",
  callName: "Bella",
  height: "14",
  weight: "18",
  gender: "Female",
  dateOfBirth: "2021-03-09",
  imageUrl: "https://images.unsplash.com/photo-1558788353-f76d92427f16?auto=format&fit=facearea&w=256&h=256&q=80",
  registrations: [
    {
      id: "reg-1",
      organization: "AKC",
      registeredName: "Bella the Beagle",
      breed: "Beagle",
      variety: "Standard",
      registrationNumber: "AKC123456",
      status: "Active"
    }
  ],
  ownerId: "owner-1",
  color: "Tri-color",
  microchip: "123456789012345"
};

export const mockOwner: Owner = {
  id: "owner-1",
  name: "John Doe",
  email: "johndoe@example.com",
  phone: "555-123-4567"
};
