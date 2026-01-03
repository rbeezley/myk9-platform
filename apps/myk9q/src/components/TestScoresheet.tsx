import React from 'react';

export const TestScoresheet: React.FC = () => {
  return (
    <div style={{
      minHeight: '100vh',
      maxHeight: '100vh',
      overflow: 'hidden',
      background: '#1a1a1a',
      color: '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif'
    }}>
      {/* Compact Header */}
      <header style={{
        height: '60px',
        minHeight: '60px',
        maxHeight: '60px',
        background: '#2a2a2a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        borderBottom: '1px solid #333'
      }}>
        <button style={{
          width: '40px',
          height: '40px',
          border: 'none',
          background: 'transparent',
          color: '#ffffff',
          fontSize: '18px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '20px'
        }}>←</button>
        <h1 style={{
          fontSize: '18px',
          fontWeight: 600,
          margin: 0,
          textAlign: 'center',
          flex: 1
        }}>AKC Scent Work</h1>
        <button style={{
          width: '40px',
          height: '40px',
          border: 'none',
          background: 'transparent',
          color: '#ffffff',
          fontSize: '18px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '20px'
        }}>🌙</button>
      </header>
      
      {/* Compact Dog Info */}
      <div style={{
        height: '80px',
        minHeight: '80px',
        maxHeight: '80px',
        background: '#333333',
        display: 'flex',
        alignItems: 'center',
        padding: '12px 16px',
        gap: '16px',
        borderBottom: '1px solid #444'
      }}>
        <div style={{
          fontSize: '28px',
          fontWeight: 700,
          minWidth: '80px',
          textAlign: 'center',
          color: '#4CAF50'
        }}>#10</div>
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '2px'
        }}>
          <div style={{
            fontSize: '16px',
            fontWeight: 600,
            color: '#ffffff'
          }}>Call Name</div>
          <div style={{
            fontSize: '14px',
            color: '#aaaaaa',
            lineHeight: 1.2
          }}>Breed</div>
          <div style={{
            fontSize: '14px',
            color: '#aaaaaa',
            lineHeight: 1.2
          }}>Handler: Handler</div>
        </div>
      </div>
      
      {/* Timer Section */}
      <div style={{
        flex: '0 0 auto',
        background: '#2a2a2a',
        padding: '20px 16px',
        borderBottom: '1px solid #444'
      }}>
        <div style={{
          textAlign: 'center',
          marginBottom: '16px'
        }}>
          <div style={{
            fontSize: '48px',
            fontWeight: 700,
            fontFamily: '"SF Mono", "Monaco", "Consolas", monospace',
            color: '#ffffff',
            marginBottom: '8px',
            letterSpacing: '-2px'
          }}>00:00.00</div>
          <div style={{
            color: '#ff4444',
            fontSize: '14px',
            fontWeight: 500,
            marginBottom: '20px'
          }}>30 Second Warning</div>
          
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px'
          }}>
            <button style={{
              width: '60px',
              height: '60px',
              borderRadius: '30px',
              background: '#4A90E2',
              border: 'none',
              color: 'white',
              fontSize: '20px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>⟲</button>
            <button style={{
              width: '120px',
              height: '60px',
              borderRadius: '30px',
              background: '#2ed573',
              border: 'none',
              color: 'white',
              fontSize: '16px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}>▶ Start</button>
            <button style={{
              width: '60px',
              height: '60px',
              borderRadius: '30px',
              background: '#4A90E2',
              border: 'none',
              color: 'white',
              fontSize: '20px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>⏱</button>
          </div>
        </div>
        
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '14px',
          color: '#aaaaaa'
        }}>
          <span>Timer 2x Time Display Value</span>
          <div style={{ fontSize: '20px' }}>⚪</div>
        </div>
      </div>
      
      {/* Areas Input */}
      <div style={{
        flex: '1 1 auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        overflowY: 'auto',
        maxHeight: '200px'
      }}>
        {[1, 2, 3].map((area) => (
          <div key={area} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            height: '50px'
          }}>
            <button style={{
              flex: '0 0 80px',
              height: '40px',
              borderRadius: '20px',
              background: area === 1 ? '#4A90E2' : '#4A90E2',
              border: 'none',
              color: 'white',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: area === 1 ? '0 0 0 2px #ffffff' : 'none'
            }}>
              Area {area}
            </button>
            <input
              type="text"
              placeholder="Enter Area Time"
              style={{
                flex: 1,
                height: '40px',
                background: '#333333',
                border: '1px solid #555',
                borderRadius: '20px',
                color: '#ffffff',
                fontSize: '14px',
                textAlign: 'center',
                padding: '0 16px',
                fontFamily: '"SF Mono", "Monaco", "Consolas", monospace'
              }}
            />
            <span style={{
              flex: '0 0 60px',
              fontSize: '12px',
              color: '#aaaaaa',
              textAlign: 'right'
            }}>Max: []</span>
          </div>
        ))}
      </div>
      
      {/* Result Buttons */}
      <div style={{
        flex: '0 0 auto',
        padding: '16px',
        background: '#2a2a2a',
        borderTop: '1px solid #444',
        borderBottom: '1px solid #444'
      }}>
        <div style={{
          display: 'flex',
          gap: '8px',
          justifyContent: 'space-between'
        }}>
          {['Qualified', 'NQ', 'Absent', 'EX', 'WD'].map((result, idx) => (
            <button key={result} style={{
              flex: 1,
              height: '50px',
              borderRadius: '8px',
              background: idx === 0 ? '#4A90E2' : '#555555',
              border: 'none',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              transform: idx === 0 ? 'scale(0.95)' : 'none'
            }}>
              {result}
            </button>
          ))}
        </div>
      </div>
      
      {/* Faults Section */}
      <div style={{
        flex: '0 0 auto',
        padding: '16px',
        background: '#333333',
        borderBottom: '1px solid #444'
      }}>
        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '8px'
        }}>
          {['Incorrect Call', 'Max Time', 'Point to Hide'].map((fault) => (
            <button key={fault} style={{
              flex: 1,
              height: '45px',
              borderRadius: '6px',
              background: '#555555',
              border: 'none',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              padding: '8px',
              textAlign: 'center',
              lineHeight: 1.2
            }}>
              {fault}
            </button>
          ))}
        </div>
        <div style={{
          display: 'flex',
          gap: '8px'
        }}>
          {['Harsh Correction', 'Significant Disruption'].map((fault) => (
            <button key={fault} style={{
              flex: 1,
              height: '45px',
              borderRadius: '6px',
              background: '#555555',
              border: 'none',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              padding: '8px',
              textAlign: 'center',
              lineHeight: 1.2
            }}>
              {fault}
            </button>
          ))}
        </div>
      </div>
      
      {/* Submit Button */}
      <div style={{
        flex: '0 0 auto',
        padding: '16px',
        background: '#2a2a2a',
        borderBottom: '1px solid #444'
      }}>
        <button style={{
          width: '100%',
          height: '60px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #4A90E2 0%, #357ABD 100%)',
          border: 'none',
          color: 'white',
          fontSize: '18px',
          fontWeight: 700,
          cursor: 'pointer',
          textTransform: 'uppercase',
          letterSpacing: '1px'
        }}>
          Submit Score
        </button>
      </div>
      
      {/* Status Bar */}
      <div style={{
        flex: '0 0 auto',
        height: '50px',
        minHeight: '50px',
        maxHeight: '50px',
        background: '#1a1a1a',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        fontSize: '14px',
        fontWeight: 500,
        borderTop: '1px solid #333'
      }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <span style={{ color: '#4CAF50' }}>Online</span>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span>Total: 0:00.00</span>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <span>1/1</span>
        </div>
      </div>
    </div>
  );
};