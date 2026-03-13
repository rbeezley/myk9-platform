export interface ConfirmEmailProps {
  confirmUrl: string;
  firstName: string;
}

export interface ResetPasswordProps {
  resetUrl: string;
  firstName: string;
}

export interface RegistrationConfirmationProps {
  firstName: string;
  confirmationNumber: string;
  show: {
    name: string;
    startDate: string;
    endDate: string;
    location: string;
    venue?: string;
    confirmationMessage?: string;
  };
  entries: Array<{
    dogName: string;
    className: string;
    armband?: string;
  }>;
  payment: {
    subtotal: number;
    discount?: number;
    total: number;
    method: string;
  };
}
