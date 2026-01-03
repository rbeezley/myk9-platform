import React, { useState, useEffect } from 'react';
import {
  Circle,
  Settings,
  FileText,
  Coffee,
  Clock,
  Play,
  CheckCircle
} from 'lucide-react';
import '../pages/ClassList/ClassList.css';

interface DemoClassEntry {
  id: number;
  element: string;
  level: string;
  section: string;
  class_status: string;
}

const StatusPopupDemo: React.FC = () => {
  const [activeStatusPopup, setActiveStatusPopup] = useState<number | null>(null);
  const [statusPopupPosition, setStatusPopupPosition] = useState<{ top: number; left: number } | null>(null);

  // Mock class data
  const classes: DemoClassEntry[] = [
    { id: 1, element: "Novice A", level: "Novice", section: "Obedience", class_status: "setup" },
    { id: 2, element: "Open B", level: "Open", section: "Obedience", class_status: "in_progress" },
    { id: 3, element: "Utility A", level: "Utility", section: "Obedience", class_status: "completed" },
    { id: 4, element: "Rally Novice", level: "Novice", section: "Rally", class_status: "briefing" },
    { id: 5, element: "Rally Advanced", level: "Advanced", section: "Rally", class_status: "break" },
  ];

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      'none': 'None',
      'setup': 'Setup',
      'briefing': 'Briefing',
      'break': 'Break',
      'start_time': 'Start Time',
      'in_progress': 'In Progress',
      'completed': 'Completed'
    };
    return labels[status] || 'Unknown';
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'none': 'status-none',
      'setup': 'status-setup',
      'briefing': 'status-briefing',
      'break': 'status-break',
      'start_time': 'status-start-time',
      'in_progress': 'status-in-progress',
      'completed': 'status-completed'
    };
    return colors[status] || 'status-none';
  };

  const handleClassStatusChange = (_classId: number, _status: string) => {
    // In real implementation, this would update the database
  };

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.status-popup') && !target.closest('.status-badge')) {
        setActiveStatusPopup(null);
        setStatusPopupPosition(null);
      }
    };

    if (activeStatusPopup !== null) {
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 0);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [activeStatusPopup]);

  return (
    <div style={{
      padding: '2rem',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
      backgroundColor: 'var(--background)',
      color: 'var(--foreground)',
      minHeight: '100vh'
    }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '1rem', textAlign: 'center' }}>
          Status Selection UX Demo
        </h1>
        <p style={{ marginBottom: '2rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
          Click on any status badge to see the improved contextual dropdown (desktop) or bottom sheet (mobile)
        </p>

        <div style={{
          display: 'grid',
          gap: '1rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))'
        }}>
          {classes.map((classEntry) => (
            <div
              key={classEntry.id}
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                transition: 'all 0.2s ease'
              }}
            >
              <div>
                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.125rem', fontWeight: '590' }}>
                  {classEntry.element}
                </h3>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                  {classEntry.level} • {classEntry.section}
                </p>
              </div>

              <div className="status-container">
                <button
                  className={`status-badge ${getStatusColor(classEntry.class_status)} clickable`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const target = e.currentTarget;
                    const rect = target.getBoundingClientRect();
                    const isDesktop = window.innerWidth >= 768;

                    if (activeStatusPopup === classEntry.id) {
                      setActiveStatusPopup(null);
                      setStatusPopupPosition(null);
                    } else {
                      setActiveStatusPopup(classEntry.id);

                      if (isDesktop) {
                        // Position dropdown below and to the right of the badge
                        const dropdownWidth = 240; // matches CSS width
                        const viewportWidth = window.innerWidth;
                        const spaceOnRight = viewportWidth - rect.right;

                        let left = rect.left + window.scrollX;

                        // Adjust if dropdown would go off-screen
                        if (spaceOnRight < dropdownWidth) {
                          left = rect.right + window.scrollX - dropdownWidth;
                        }

                        setStatusPopupPosition({
                          top: rect.bottom + window.scrollY + 8,
                          left: left
                        });
                      } else {
                        setStatusPopupPosition(null);
                      }
                    }
                  }}
                >
                  {getStatusLabel(classEntry.class_status)}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Demo info */}
        <div style={{
          marginTop: '3rem',
          padding: '1.5rem',
          background: 'var(--muted)',
          borderRadius: '12px',
          border: '1px solid var(--border)'
        }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.125rem', fontWeight: '590' }}>
            🎯 UX Improvements Demonstrated
          </h3>
          <ul style={{ margin: 0, paddingLeft: '1.5rem', lineHeight: '1.6' }}>
            <li><strong>Desktop:</strong> Contextual dropdown positioned near the clicked status badge</li>
            <li><strong>Mobile:</strong> Bottom sheet that slides up from the bottom</li>
            <li><strong>Smart positioning:</strong> Dropdown adjusts to stay within viewport bounds</li>
            <li><strong>Smooth animations:</strong> Apple-inspired easing and timing</li>
            <li><strong>Click outside to close:</strong> Intuitive dismissal behavior</li>
            <li><strong>Smaller footprint:</strong> No more full-screen modal interruption on desktop</li>
            <li><strong>Consistent icons and colors:</strong> Maintains visual hierarchy</li>
          </ul>
        </div>
      </div>

      {/* Status Selection Popup */}
      {activeStatusPopup !== null && (
        <>
          {!statusPopupPosition && (
            <div className="bottom-sheet-backdrop" onClick={() => {
              setActiveStatusPopup(null);
              setStatusPopupPosition(null);
            }} />
          )}
          <div
            className="status-popup"
            style={statusPopupPosition ? {
              top: statusPopupPosition.top,
              left: statusPopupPosition.left,
              position: 'absolute'
            } : {}}
          >
            <div className="status-popup-content">
              <div className="mobile-sheet-header">
                <h3>Class Status</h3>
                <button
                  className="close-sheet-btn"
                  onClick={() => {
                    setActiveStatusPopup(null);
                    setStatusPopupPosition(null);
                  }}
                >
                  ✕
                </button>
              </div>
              {[
                { status: 'none', label: 'None', icon: Circle },
                { status: 'setup', label: 'Setup', icon: Settings },
                { status: 'briefing', label: 'Briefing', icon: FileText },
                { status: 'break', label: 'Break', icon: Coffee },
                { status: 'start_time', label: 'Start Time', icon: Clock },
                { status: 'in_progress', label: 'In Progress', icon: Play },
                { status: 'completed', label: 'Completed', icon: CheckCircle }
              ].map(({ status, label, icon: IconComponent }) => (
                <button
                  key={status}
                  className={`status-option status-${status}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClassStatusChange(activeStatusPopup, status);
                    setActiveStatusPopup(null);
                    setStatusPopupPosition(null);
                  }}
                >
                  <span className="popup-icon">
                    <IconComponent size={statusPopupPosition ? 16 : 18} />
                  </span>
                  <span className="popup-label">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default StatusPopupDemo;