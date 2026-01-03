import React from 'react';
import { Trophy, Star } from 'lucide-react';
import type { CleanSweepDog } from '../types/stats.types';

interface CleanSweepSectionProps {
  dogs: CleanSweepDog[];
  onDogClick?: (armbandNumber: string) => void;
}

const CleanSweepSection: React.FC<CleanSweepSectionProps> = ({ dogs, onDogClick }) => {
  return (
    <div className="clean-sweep-section">
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 'var(--token-space-xl)'
      }}>
        {dogs.map((dog) => (
          <div
            key={`${dog.armbandNumber}-${dog.dogCallName}`}
            className="clean-sweep-card"
            style={{
              cursor: onDogClick ? 'pointer' : 'default'
            }}
            onClick={() => onDogClick && onDogClick(dog.armbandNumber)}
            onMouseEnter={(e) => {
              if (onDogClick) {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(16, 185, 129, 0.3)';
              }
            }}
            onMouseLeave={(e) => {
              if (onDogClick) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }
            }}
          >
            {/* Perfect Record Badge */}
            <div style={{
              position: 'absolute',
              top: 0,
              right: 0,
              background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
              padding: 'var(--token-space-sm) var(--token-space-lg)',
              borderBottomLeftRadius: 'var(--token-space-lg)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--token-space-xs)'
            }}>
              <Trophy className="h-3 w-3" style={{ color: 'white' }} />
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'white',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Perfect
              </span>
            </div>

            {/* Dog Info */}
            <div style={{ marginTop: 'var(--token-space-lg)' }}>
              <h3 style={{
                fontSize: '1.125rem',
                fontWeight: 600,
                color: 'var(--foreground)',
                marginBottom: 'var(--token-space-xs)'
              }}>
                {dog.dogCallName}
              </h3>

              <p style={{
                fontSize: '0.8125rem',
                color: 'var(--muted-foreground)',
                marginBottom: 'var(--token-space-sm)'
              }}>
                #{dog.armbandNumber}
              </p>

              <div style={{
                borderTop: '1px solid var(--border)',
                paddingTop: 'var(--token-space-md)',
                marginTop: 'var(--token-space-md)'
              }}>
                <p style={{
                  fontSize: '0.875rem',
                  color: 'var(--muted-foreground)',
                  marginBottom: 'var(--token-space-xs)'
                }}>
                  <strong>Handler:</strong> {dog.handlerName}
                </p>

                <p style={{
                  fontSize: '0.875rem',
                  color: 'var(--muted-foreground)',
                  marginBottom: 'var(--token-space-md)'
                }}>
                  <strong>Breed:</strong> {dog.dogBreed}
                </p>

                {/* Elements Badge */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--token-space-sm)',
                  backgroundColor: 'var(--accent)',
                  padding: 'var(--token-space-md)',
                  borderRadius: 'var(--token-space-md)',
                  marginTop: 'var(--token-space-lg)'
                }}>
                  <Star className="h-4 w-4" style={{ color: 'var(--primary)' }} />
                  <div>
                    <p style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--primary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: 'var(--token-space-xs)'
                    }}>
                      {dog.elementsQualified} of {dog.elementsEntered} Elements
                    </p>
                    <p style={{
                      fontSize: '0.75rem',
                      color: 'var(--muted-foreground)'
                    }}>
                      {dog.elementsList.join(', ')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {dogs.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: 'var(--token-space-4xl)',
          color: 'var(--muted-foreground)'
        }}>
          <Trophy className="h-12 w-12" style={{
            margin: '0 auto var(--token-space-xl)',
            color: 'var(--muted-foreground)',
            opacity: 0.5
          }} />
          <p>No dogs achieved clean sweeps in the selected criteria.</p>
        </div>
      )}
    </div>
  );
};

export default CleanSweepSection;