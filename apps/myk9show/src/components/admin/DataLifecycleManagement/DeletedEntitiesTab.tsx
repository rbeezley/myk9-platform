/**
 * Deleted Entities tab panel – manage soft-deleted clubs and dogs.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Home,
  Users,
  Shield,
  AlertTriangle,
  RefreshCw,
  X,
} from 'lucide-react';
import type { DeletedEntitiesTabProps } from './types';

export function DeletedEntitiesTab({
  deletedClubs,
  deletedDogs,
  isLoadingDeleted,
  onShowRestoreDialog,
  onShowDeleteDialog,
  onRefreshDeletedEntities,
}: DeletedEntitiesTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Deleted Clubs */}
        <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="h-5 w-5 text-orange-600" />
              Deleted Clubs ({deletedClubs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {isLoadingDeleted ? (
                <p className="text-muted-foreground">Loading deleted clubs...</p>
              ) : deletedClubs.length === 0 ? (
                <p className="text-muted-foreground">No deleted clubs found.</p>
              ) : (
                deletedClubs.map((club) => (
                  <div key={club.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{club.name || 'Unnamed Club'}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Deleted: {club.deleted_at ? new Date(club.deleted_at).toLocaleDateString() : 'Unknown'}</span>
                        {club.deleted_by_user && (
                          <span>by {club.deleted_by_user.email || 'Unknown'}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 ml-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="!border-green-200/20 !bg-green-50/10 hover:!bg-green-50/20 !text-green-700 hover:!text-green-800"
                        onClick={() => onShowRestoreDialog(club.id, club.name || 'Unnamed Club', 'club')}
                        disabled={isLoadingDeleted}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Restore
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="!border-red-200/20 !bg-red-50/10 hover:!bg-red-50/20 !text-red-700 hover:!text-red-800"
                        onClick={() => onShowDeleteDialog(club.id, club.name || 'Unnamed Club', 'club')}
                        disabled={isLoadingDeleted}
                      >
                        <X className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            {deletedClubs.length > 0 && (
              <div className="mt-4">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full border-border/20 bg-muted/30 hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                  onClick={onRefreshDeletedEntities}
                  disabled={isLoadingDeleted}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh List
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Deleted Dogs */}
        <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              Deleted Dogs ({deletedDogs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {isLoadingDeleted ? (
                <p className="text-muted-foreground">Loading deleted dogs...</p>
              ) : deletedDogs.length === 0 ? (
                <p className="text-muted-foreground">No deleted dogs found.</p>
              ) : (
                deletedDogs.map((dog) => (
                  <div key={dog.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{dog.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{dog.breed}</span>
                        <span>•</span>
                        <span>Deleted: {dog.deleted_at ? new Date(dog.deleted_at).toLocaleDateString() : 'Unknown'}</span>
                        {dog.deleted_by_user && (
                          <>
                            <span>by</span>
                            <span>{dog.deleted_by_user.email || 'Unknown'}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 ml-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="!border-green-200/20 !bg-green-50/10 hover:!bg-green-50/20 !text-green-700 hover:!text-green-800"
                        onClick={() => onShowRestoreDialog(dog.id, dog.name, 'dog')}
                        disabled={isLoadingDeleted}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Restore
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="!border-red-200/20 !bg-red-50/10 hover:!bg-red-50/20 !text-red-700 hover:!text-red-800"
                        onClick={() => onShowDeleteDialog(dog.id, dog.name, 'dog')}
                        disabled={isLoadingDeleted}
                      >
                        <X className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            {deletedDogs.length > 0 && (
              <div className="mt-4">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full border-border/20 bg-muted/30 hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                  onClick={onRefreshDeletedEntities}
                  disabled={isLoadingDeleted}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh List
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Admin Information */}
      <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-purple-600" />
            Soft Delete Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="!border-amber-200/20 !bg-amber-50/10">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Restore:</strong> Restores a soft-deleted entity back to active status. The entity will reappear in normal lists and can be used again.
              <br /><br />
              <strong>Delete:</strong> Permanently removes the entity from the database. This action cannot be undone and all related data will be lost.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Safety Features</h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Audit trail tracks who deleted each item</li>
                <li>• Deletion timestamps are preserved</li>
                <li>• Permanent deletion requires confirmation</li>
                <li>• Related data is handled appropriately</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Quick Stats</h4>
              <div className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Deleted Clubs:</span>
                  <span className="text-orange-600">{deletedClubs.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Deleted Dogs:</span>
                  <span className="text-blue-600">{deletedDogs.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Items:</span>
                  <span className="font-medium">{deletedClubs.length + deletedDogs.length}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
