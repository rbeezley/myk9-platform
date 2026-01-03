import { useState } from 'react';
import type { Registration, Dog } from '../types/dog-types';

export function useDogRegistrations(initialDog: Dog | null) {
  const [dog, setDog] = useState<Dog | null>(initialDog);

  const addRegistration = (registration: Omit<Registration, 'id'>) => {
    if (!dog) return;
    setDog({
      ...dog,
      registrations: [...(dog.registrations || []), { ...registration, id: Date.now().toString() }],
    });
  };

  const editRegistration = (index: number, updatedRegistration: Registration) => {
    if (!dog) return;
    const updatedRegs = [...(dog.registrations || [])];
    updatedRegs[index] = updatedRegistration;
    setDog({ ...dog, registrations: updatedRegs });
  };

  const deleteRegistration = (index: number) => {
    if (!dog) return;
    const updatedRegs = [...(dog.registrations || [])];
    updatedRegs.splice(index, 1);
    setDog({ ...dog, registrations: updatedRegs });
  };

  return {
    dog,
    setDog,
    addRegistration,
    editRegistration,
    deleteRegistration,
  };
}
