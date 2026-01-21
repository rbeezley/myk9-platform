/**
 * Virtual Scrolling Demo Component
 * 
 * Demonstrates the performance benefits of virtual scrolling
 * with large datasets. Includes performance comparisons and
 * real-world examples.
 */

import React, { useState, useMemo } from 'react';
import { VirtualScrollList } from '@/components/common/virtual/VirtualScrollList';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Zap,
  TrendingUp,
  Clock,
  HardDrive,
  Eye,
  Users,
  Heart,
  Calendar,
  Check,
  X,
  AlertTriangle
} from 'lucide-react';

interface MockItem {
  id: string;
  name: string;
  category: string;
  value: number;
  status: 'active' | 'inactive' | 'pending';
  date: string;
}

export function VirtualScrollingDemo() {
  const [itemCount, setItemCount] = useState(1000);
  const [renderMode, setRenderMode] = useState<'virtual' | 'traditional'>('virtual');

  // Generate mock data with deterministic values (based on index)
  const mockData = useMemo(() => {
    const categories = ['Category A', 'Category B', 'Category C', 'Category D', 'Category E'];
    const statuses: MockItem['status'][] = ['active', 'inactive', 'pending'];

    // Simple seeded pseudo-random function for deterministic values
    const seededValue = (index: number) => ((index * 1103515245 + 12345) >>> 16) % 1000;

    return Array.from({ length: itemCount }, (_, i) => ({
      id: `item-${i}`,
      name: `Item ${i + 1}`,
      category: categories[i % categories.length],
      value: seededValue(i),
      status: statuses[i % statuses.length],
      date: new Date(2024, 0, 1 + (i % 365)).toISOString().split('T')[0],
    }));
  }, [itemCount]);

  // Performance metrics (simulated)
  const performanceMetrics = useMemo(() => {
    const domNodes = renderMode === 'virtual' ? Math.min(50, itemCount) : itemCount;
    const memoryUsage = renderMode === 'virtual' ? 
      Math.min(10 + (itemCount / 1000) * 2, 25) : // Virtual: minimal memory growth
      10 + (itemCount / 100) * 5; // Traditional: significant memory growth
    
    const renderTime = renderMode === 'virtual' ? 
      Math.min(50 + (itemCount / 10000) * 20, 100) : // Virtual: consistent render time
      50 + (itemCount / 100) * 10; // Traditional: increases with item count

    return {
      domNodes,
      memoryUsage: Math.round(memoryUsage),
      renderTime: Math.round(renderTime),
      scrollFps: renderMode === 'virtual' ? 60 : Math.max(60 - (itemCount / 500), 15),
    };
  }, [itemCount, renderMode]);

  // Search function
  const searchFunction = (items: MockItem[], query: string) => {
    if (!query) return items;
    const lowercaseQuery = query.toLowerCase();
    return items.filter(item => 
      item.name.toLowerCase().includes(lowercaseQuery) ||
      item.category.toLowerCase().includes(lowercaseQuery)
    );
  };

  // Render item function
  const renderItem = (item: MockItem, index: number, style: React.CSSProperties) => {
    const statusColors = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-red-100 text-red-800',
      pending: 'bg-yellow-100 text-yellow-800',
    };

    return (
      <div style={style} className="flex items-center justify-between px-4 py-3 border-b hover:bg-muted/50">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-xs font-bold">
            {index + 1}
          </div>
          <div>
            <h4 className="font-medium">{item.name}</h4>
            <p className="text-sm text-muted-foreground">{item.category}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">${item.value}</Badge>
          <Badge className={statusColors[item.status]}>
            {item.status}
          </Badge>
          <span className="text-xs text-muted-foreground">{item.date}</span>
        </div>
      </div>
    );
  };

  // Traditional render (for comparison)
  const renderTraditionalList = () => (
    <div className="border rounded-lg max-h-96 overflow-auto">
      {mockData.slice(0, 100).map((item, index) => (
        <div key={item.id}>
          {renderItem(item, index, {})}
        </div>
      ))}
      {mockData.length > 100 && (
        <div className="p-4 text-center text-muted-foreground bg-muted/50">
          ... and {mockData.length - 100} more items (truncated for performance)
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Virtual Scrolling Performance Demo
          </CardTitle>
          <p className="text-muted-foreground">
            Compare performance between virtual scrolling and traditional rendering
            for large datasets.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="flex items-center gap-2">
              <label htmlFor="itemCount" className="text-sm font-medium">
                Items:
              </label>
              <select
                id="itemCount"
                value={itemCount}
                onChange={(e) => setItemCount(Number(e.target.value))}
                className="px-3 py-1 border rounded text-sm"
              >
                <option value={100}>100</option>
                <option value={1000}>1,000</option>
                <option value={5000}>5,000</option>
                <option value={10000}>10,000</option>
                <option value={50000}>50,000</option>
              </select>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant={renderMode === 'virtual' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRenderMode('virtual')}
              >
                Virtual Scrolling
              </Button>
              <Button
                variant={renderMode === 'traditional' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRenderMode('traditional')}
              >
                Traditional
              </Button>
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{performanceMetrics.domNodes}</div>
              <div className="text-xs text-muted-foreground">DOM Nodes</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{performanceMetrics.memoryUsage}MB</div>
              <div className="text-xs text-muted-foreground">Memory Usage</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{performanceMetrics.renderTime}ms</div>
              <div className="text-xs text-muted-foreground">Render Time</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{Math.round(performanceMetrics.scrollFps)}</div>
              <div className="text-xs text-muted-foreground">Scroll FPS</div>
            </div>
          </div>

          {/* Rendering Mode Display */}
          {renderMode === 'virtual' ? (
            <VirtualScrollList
              items={mockData}
              itemHeight={70}
              containerHeight={400}
              renderItem={renderItem}
              getItemKey={(item) => item.id}
              searchFunction={searchFunction}
              filters={[
                {
                  id: 'status',
                  name: 'Status',
                  options: [
                    { value: 'all', label: 'All' },
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                    { value: 'pending', label: 'Pending' },
                  ],
                },
              ]}
              customFilter={(item, filters) => {
                if (filters.status && filters.status !== 'all' && item.status !== filters.status) {
                  return false;
                }
                return true;
              }}
              title={`Virtual List (${itemCount.toLocaleString()} items)`}
              icon={Zap}
            />
          ) : (
            <div className="space-y-4">
              <h3 className="font-medium">Traditional List (showing first 100 items)</h3>
              {renderTraditionalList()}
              <div className="text-sm text-muted-foreground bg-yellow-50 p-3 rounded flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                <span>
                  Traditional rendering shows only first 100 items to prevent browser freeze.
                  Virtual scrolling can handle all {itemCount.toLocaleString()} items smoothly.
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Performance Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Performance Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="benefits">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="benefits">Benefits</TabsTrigger>
              <TabsTrigger value="metrics">Metrics</TabsTrigger>
              <TabsTrigger value="use-cases">Use Cases</TabsTrigger>
            </TabsList>
            
            <TabsContent value="benefits" className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h4 className="font-medium text-green-700 flex items-center gap-2">
                    <Check className="h-4 w-4" /> Virtual Scrolling
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-green-500" />
                      Renders only visible items
                    </li>
                    <li className="flex items-center gap-2">
                      <HardDrive className="h-4 w-4 text-green-500" />
                      Constant memory usage
                    </li>
                    <li className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-green-500" />
                      Fast initial render
                    </li>
                    <li className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      Smooth 60fps scrolling
                    </li>
                  </ul>
                </div>
                
                <div className="space-y-3">
                  <h4 className="font-medium text-red-700 flex items-center gap-2">
                    <X className="h-4 w-4" /> Traditional Rendering
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-red-500" />
                      Renders all items at once
                    </li>
                    <li className="flex items-center gap-2">
                      <HardDrive className="h-4 w-4 text-red-500" />
                      Memory usage grows linearly
                    </li>
                    <li className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-red-500" />
                      Slow initial render
                    </li>
                    <li className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-red-500" />
                      Choppy scrolling with many items
                    </li>
                  </ul>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="metrics" className="space-y-4">
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {((1 - performanceMetrics.domNodes / itemCount) * 100).toFixed(1)}%
                    </div>
                    <div className="text-sm text-muted-foreground">DOM Nodes Saved</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {Math.round(performanceMetrics.memoryUsage)}MB
                    </div>
                    <div className="text-sm text-muted-foreground">Memory Usage</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {Math.round(performanceMetrics.renderTime)}ms
                    </div>
                    <div className="text-sm text-muted-foreground">Initial Render</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      {Math.round(performanceMetrics.scrollFps)}
                    </div>
                    <div className="text-sm text-muted-foreground">Scroll FPS</div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            
            <TabsContent value="use-cases" className="space-y-4">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Heart className="h-4 w-4" />
                    Dogs Management
                  </h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• Browse 10,000+ dogs efficiently</li>
                    <li>• Filter by breed, registration status</li>
                    <li>• Admin bulk operations</li>
                    <li>• Smooth scrolling on mobile</li>
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Users Directory
                  </h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• Large contact databases</li>
                    <li>• Exhibitor and judge lists</li>
                    <li>• Quick contact lookup</li>
                    <li>• Regional filtering</li>
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Show History
                  </h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• Years of show records</li>
                    <li>• Entry and result history</li>
                    <li>• Performance analytics</li>
                    <li>• Archive browsing</li>
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Search Results
                  </h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• Large search result sets</li>
                    <li>• Real-time filtering</li>
                    <li>• Cross-data-type searches</li>
                    <li>• Export capabilities</li>
                  </ul>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}