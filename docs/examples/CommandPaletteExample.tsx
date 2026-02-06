import { CommandPaletteEnhanced } from '../common/CommandPaletteEnhanced';
import { useCommandPalette } from '@/hooks/useCommandPalette';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Search, Keyboard } from 'lucide-react';

/**
 * Example component demonstrating the enhanced CommandPalette usage
 */
export function CommandPaletteExample() {
  const { open, setOpen } = useCommandPalette();

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Enhanced Command Palette Demo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-600">
            The enhanced command palette provides powerful search and navigation capabilities with
            RBAC integration, faceted filtering, and performance optimizations.
          </p>
          
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Features</h3>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">RBAC Integration</Badge>
                <Badge variant="secondary">Faceted Filtering</Badge>
                <Badge variant="secondary">Debounced Search</Badge>
                <Badge variant="secondary">Enhanced Results</Badge>
                <Badge variant="secondary">Category Grouping</Badge>
                <Badge variant="secondary">Type-based Filters</Badge>
              </div>
            </div>
            
            <div>
              <h3 className="font-semibold mb-2">How to Use</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                <li>Press <Badge variant="outline" className="mx-1"><Keyboard className="h-3 w-3 mr-1" />Cmd/Ctrl + K</Badge> to open</li>
                <li>Type to search dogs, people, shows, or commands</li>
                <li>Click the filter icon to show faceted filters</li>
                <li>Filter by category (Navigate, Search, Actions) or type (Dogs, Users, Shows)</li>
                <li>Results are ranked by relevance and user permissions</li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold mb-2">RBAC Features</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                <li><strong>Exhibitors:</strong> See only their own dogs and basic navigation</li>
                <li><strong>Secretaries:</strong> Access all dogs, people creation, show management</li>
                <li><strong>Club Admins:</strong> Full club management capabilities</li>
                <li><strong>Site Admins:</strong> System administration access</li>
              </ul>
            </div>
          </div>
          
          <div className="pt-4 border-t">
            <Button onClick={() => setOpen(true)} className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Open Command Palette
            </Button>
            <p className="text-xs text-gray-500 mt-2">
              Or press <code className="bg-gray-100 px-1 rounded">Cmd/Ctrl + K</code>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Render the enhanced command palette */}
      <CommandPaletteEnhanced open={open} onOpenChange={setOpen} />
    </div>
  );
}