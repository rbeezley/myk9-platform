import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatCardNumber, formatExpiryDate, stripNonDigits, detectCardBrand } from './utils';
import type { CardBrand } from './utils';

interface CreditCardVisualProps {
  cardNumber: string;
  expiryDate: string;
  cvv: string;
  cardholderName: string;
  onCardNumberChange: (value: string) => void;
  onExpiryDateChange: (value: string) => void;
  onCvvChange: (value: string) => void;
  onCardholderNameChange: (value: string) => void;
}

/** SVG brand logos rendered inline to avoid external dependencies. */
const BrandLogo: React.FC<{ brand: CardBrand }> = ({ brand }) => {
  switch (brand) {
    case 'visa':
      return (
        <svg viewBox="0 0 48 32" className="h-8 w-12" aria-label="Visa">
          <rect width="48" height="32" rx="4" fill="#1A1F71" />
          <text
            x="24"
            y="20"
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize="14"
            fontWeight="bold"
            fontStyle="italic"
            fontFamily="Arial, sans-serif"
          >
            VISA
          </text>
        </svg>
      );
    case 'mastercard':
      return (
        <svg viewBox="0 0 48 32" className="h-8 w-12" aria-label="Mastercard">
          <rect width="48" height="32" rx="4" fill="#1A1A2E" />
          <circle cx="19" cy="16" r="9" fill="#EB001B" />
          <circle cx="29" cy="16" r="9" fill="#F79E1B" />
          <path d="M24 9.17a9 9 0 0 1 0 13.66 9 9 0 0 1 0-13.66z" fill="#FF5F00" />
        </svg>
      );
    case 'amex':
      return (
        <svg viewBox="0 0 48 32" className="h-8 w-12" aria-label="American Express">
          <rect width="48" height="32" rx="4" fill="#2E77BC" />
          <text
            x="24"
            y="18"
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize="7"
            fontWeight="bold"
            fontFamily="Arial, sans-serif"
          >
            AMEX
          </text>
        </svg>
      );
    case 'discover':
      return (
        <svg viewBox="0 0 48 32" className="h-8 w-12" aria-label="Discover">
          <rect width="48" height="32" rx="4" fill="#FF6600" />
          <text
            x="24"
            y="18"
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize="7"
            fontWeight="bold"
            fontFamily="Arial, sans-serif"
          >
            DISC
          </text>
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 48 32" className="h-8 w-12" aria-label="Credit Card">
          <rect width="48" height="32" rx="4" fill="#4B5563" />
          <rect x="6" y="10" width="14" height="10" rx="2" fill="#9CA3AF" />
          <rect x="28" y="22" width="14" height="2" rx="1" fill="#9CA3AF" />
        </svg>
      );
  }
};

/** A chip icon for the card front. */
const ChipIcon: React.FC = () => (
  <svg viewBox="0 0 40 28" className="h-7 w-10">
    <rect width="40" height="28" rx="4" fill="#D4AF37" opacity="0.9" />
    <line x1="0" y1="10" x2="40" y2="10" stroke="#B8941F" strokeWidth="1" />
    <line x1="0" y1="18" x2="40" y2="18" stroke="#B8941F" strokeWidth="1" />
    <line x1="14" y1="0" x2="14" y2="28" stroke="#B8941F" strokeWidth="1" />
    <line x1="26" y1="0" x2="26" y2="28" stroke="#B8941F" strokeWidth="1" />
  </svg>
);

/** Contactless payment icon. */
const ContactlessIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 text-white/50" fill="none" stroke="currentColor">
    <path d="M8 18a6 6 0 0 1 0-12" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M12 15a3 3 0 0 1 0-6" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M16 12h.01" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/**
 * Visual credit card input component.
 *
 * Renders a realistic credit card with front and back faces.
 * Clicking on the CVC field flips to the back; clicking anywhere
 * else flips to the front. All fields are editable inline.
 */
export const CreditCardVisual: React.FC<CreditCardVisualProps> = ({
  cardNumber,
  expiryDate,
  cvv,
  cardholderName,
  onCardNumberChange,
  onExpiryDateChange,
  onCvvChange,
  onCardholderNameChange,
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const cvvInputRef = useRef<HTMLInputElement>(null);
  const flipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (flipTimeoutRef.current) clearTimeout(flipTimeoutRef.current);
    };
  }, []);

  const brand = detectCardBrand(cardNumber);
  const displayNumber =
    cardNumber ||
    '\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022';
  const displayName = cardholderName || 'YOUR NAME';
  const displayExpiry = expiryDate || 'MM/YY';
  const displayCvv = cvv ? '\u2022'.repeat(cvv.length) : '\u2022\u2022\u2022';

  const handleCvvFocus = () => {
    setIsFlipped(true);
    setFocusedField('cvv');
  };

  const handleCvvBlur = () => {
    setFocusedField(null);
    // Delay flip-back so the user can see the CVV field
    flipTimeoutRef.current = setTimeout(() => setIsFlipped(false), 800);
  };

  const handleFrontFieldFocus = (field: string) => {
    setIsFlipped(false);
    setFocusedField(field);
  };

  const handleFieldBlur = () => {
    setFocusedField(null);
  };

  return (
    <div className="mx-auto w-full max-w-sm">
      {/* Card container with perspective */}
      <div className="relative" style={{ perspective: '1000px' }}>
        <div
          className={cn(
            'relative h-52 w-full transition-transform duration-700',
            '[transform-style:preserve-3d]',
            isFlipped && '[transform:rotateY(180deg)]'
          )}
        >
          {/* ---- FRONT FACE ---- */}
          <div
            className={cn(
              'absolute inset-0 rounded-2xl p-6',
              'bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950',
              'shadow-xl shadow-black/30',
              'border border-white/10',
              '[backface-visibility:hidden]',
              'flex flex-col justify-between'
            )}
          >
            {/* Top row: chip + contactless + brand */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <ChipIcon />
                <ContactlessIcon />
              </div>
              <BrandLogo brand={brand} />
            </div>

            {/* Card number */}
            <div>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="cc-number"
                value={cardNumber}
                onChange={e => onCardNumberChange(formatCardNumber(e.target.value))}
                onFocus={() => handleFrontFieldFocus('number')}
                onBlur={handleFieldBlur}
                placeholder={displayNumber}
                maxLength={19}
                className={cn(
                  'w-full bg-transparent text-xl tracking-[0.15em] text-white',
                  'placeholder:text-white/40 font-mono',
                  'border-none outline-none focus:ring-0 p-0',
                  focusedField === 'number' && 'placeholder:text-white/60'
                )}
                aria-label="Card number"
              />
            </div>

            {/* Bottom row: name + expiry */}
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">
                  Card Holder
                </div>
                <input
                  type="text"
                  autoComplete="cc-name"
                  value={cardholderName}
                  onChange={e => onCardholderNameChange(e.target.value)}
                  onFocus={() => handleFrontFieldFocus('name')}
                  onBlur={handleFieldBlur}
                  placeholder={displayName}
                  className={cn(
                    'w-full bg-transparent text-sm uppercase tracking-wider text-white',
                    'placeholder:text-white/40 font-mono truncate',
                    'border-none outline-none focus:ring-0 p-0',
                    focusedField === 'name' && 'placeholder:text-white/60'
                  )}
                  aria-label="Cardholder name"
                />
              </div>
              <div className="shrink-0">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">
                  Expires
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  value={expiryDate}
                  onChange={e => onExpiryDateChange(formatExpiryDate(e.target.value))}
                  onFocus={() => handleFrontFieldFocus('expiry')}
                  onBlur={handleFieldBlur}
                  placeholder={displayExpiry}
                  maxLength={5}
                  className={cn(
                    'w-20 bg-transparent text-sm tracking-wider text-white text-right',
                    'placeholder:text-white/40 font-mono',
                    'border-none outline-none focus:ring-0 p-0',
                    focusedField === 'expiry' && 'placeholder:text-white/60'
                  )}
                  aria-label="Expiry date"
                />
              </div>
            </div>
          </div>

          {/* ---- BACK FACE ---- */}
          <div
            className={cn(
              'absolute inset-0 rounded-2xl',
              'bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950',
              'shadow-xl shadow-black/30',
              'border border-white/10',
              '[backface-visibility:hidden] [transform:rotateY(180deg)]',
              'flex flex-col'
            )}
          >
            {/* Magnetic stripe */}
            <div className="mt-6 h-12 w-full bg-slate-950/80" />

            {/* Signature strip + CVV */}
            <div className="mt-6 flex items-center gap-3 px-6">
              <div className="flex-1 rounded bg-white/90 px-3 py-2">
                <div className="h-4 w-full bg-[repeating-linear-gradient(90deg,#E5E7EB_0px,#E5E7EB_4px,transparent_4px,transparent_8px)]" />
              </div>
              <div className="shrink-0">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">CVV</div>
                <input
                  ref={cvvInputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  value={cvv}
                  onChange={e => onCvvChange(stripNonDigits(e.target.value))}
                  onFocus={handleCvvFocus}
                  onBlur={handleCvvBlur}
                  placeholder={displayCvv}
                  maxLength={4}
                  className={cn(
                    'w-14 rounded bg-white px-2 py-1 text-center text-sm font-mono text-slate-900',
                    'border border-slate-300 outline-none',
                    'focus:ring-2 focus:ring-primary'
                  )}
                  aria-label="CVV"
                />
              </div>
            </div>

            {/* Issuer info */}
            <div className="mt-auto px-6 pb-6">
              <p className="text-[9px] text-white/30 leading-relaxed">
                This card is property of the issuing bank. Unauthorized use is prohibited. If found,
                please return to any branch of the issuing bank.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Flip hint */}
      <p className="mt-3 text-center text-xs text-muted-foreground">
        {isFlipped ? 'Enter your CVV code' : 'Click the CVV field to flip the card'}
      </p>

      {/* Hidden button to flip card for keyboard users */}
      <button
        type="button"
        onClick={() => {
          setIsFlipped(!isFlipped);
          if (!isFlipped) {
            setTimeout(() => cvvInputRef.current?.focus(), 400);
          }
        }}
        className="mt-1 mx-auto block text-xs text-muted-foreground/60 hover:text-muted-foreground underline"
      >
        {isFlipped ? 'Show card front' : 'Enter CVV'}
      </button>
    </div>
  );
};
