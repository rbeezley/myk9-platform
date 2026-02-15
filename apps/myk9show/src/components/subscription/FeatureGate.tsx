import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Lock,
  ArrowRight,
  Check,
  Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PlanType,
  FeatureType,
  Feature,
  features,
  planHierarchy,
  planDetails
} from './featureUtils';

// Extracted UpgradeCard component
interface UpgradeCardProps {
  feature: Feature;
  requiredPlanDetails: (typeof planDetails)[keyof typeof planDetails] | undefined;
  onOpenDialog: () => void;
}

const UpgradeCard = ({ feature, requiredPlanDetails, onOpenDialog }: UpgradeCardProps) => (
  <Card className="border-dashed border-2 border-muted-foreground/25">
    <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-4">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
        <Lock className="h-8 w-8 text-muted-foreground" />
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-semibold">{feature.name}</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          {feature.description}
        </p>
      </div>

      <Badge variant="outline" className="flex items-center gap-1">
        {feature.icon}
        Requires {requiredPlanDetails?.name}
      </Badge>

      <Button
        onClick={onOpenDialog}
        className="flex items-center gap-2"
      >
        Upgrade Now
        <ArrowRight className="h-4 w-4" />
      </Button>
    </CardContent>
  </Card>
);

interface FeatureGateProps {
  feature: FeatureType;
  userPlan?: PlanType;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showDialog?: boolean;
  onUpgrade?: () => void;
}

export function FeatureGate({ 
  feature, 
  userPlan = 'free', 
  children, 
  fallback,
  showDialog = false,
  onUpgrade 
}: FeatureGateProps) {
  const featureConfig = features[feature];
  const hasAccess = planHierarchy[userPlan] >= planHierarchy[featureConfig.requiredPlan];

  if (hasAccess) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <FeatureUpgradePrompt
      feature={featureConfig}
      userPlan={userPlan}
      showDialog={showDialog}
      {...(onUpgrade !== undefined && { onUpgrade })}
    />
  );
}

interface FeatureUpgradePromptProps {
  feature: Feature;
  userPlan: PlanType;
  showDialog?: boolean;
  onUpgrade?: () => void;
}

function FeatureUpgradePrompt({
  feature,
  userPlan,
  showDialog = false,
  onUpgrade
}: FeatureUpgradePromptProps) {
  const [dialogOpen, setDialogOpen] = React.useState(showDialog);
  const requiredPlanDetails = planDetails[feature.requiredPlan as keyof typeof planDetails];

  return (
    <>
      <UpgradeCard
        feature={feature}
        requiredPlanDetails={requiredPlanDetails}
        onOpenDialog={() => setDialogOpen(true)}
      />
      
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Upgrade Required
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
              {feature.icon}
              <p className="text-blue-800 text-sm">
                <strong>{feature.name}</strong> requires a {requiredPlanDetails?.name} subscription or higher.
              </p>
            </div>

            <div className="grid gap-4">
              {Object.entries(planDetails).map(([planKey, plan]) => {
                const isRequired = planKey === feature.requiredPlan;
                const isCurrent = planKey === userPlan;
                const hasFeature = planHierarchy[planKey as PlanType] >= planHierarchy[feature.requiredPlan];
                
                return (
                  <Card 
                    key={planKey}
                    className={cn(
                      "relative",
                      isRequired && "ring-2 ring-primary",
                      isCurrent && "bg-muted/50"
                    )}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">{plan.name}</CardTitle>
                          {isCurrent && <Badge variant="secondary">Current</Badge>}
                          {isRequired && <Badge>Recommended</Badge>}
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold">{plan.price}</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {plan.features.map((f, index) => (
                          <li key={index} className="flex items-center gap-2 text-sm">
                            <Check className="h-4 w-4 text-green-500" />
                            {f}
                          </li>
                        ))}
                      </ul>
                      
                      {hasFeature && (
                        <div className="mt-4 flex items-center gap-2 text-sm text-green-600">
                          <Check className="h-4 w-4" />
                          Includes {feature.name}
                        </div>
                      )}
                      
                      {!isCurrent && (
                        <Button 
                          className="w-full mt-4"
                          variant={isRequired ? "default" : "outline"}
                          onClick={() => {
                            onUpgrade?.();
                            setDialogOpen(false);
                          }}
                        >
                          {planHierarchy[planKey as PlanType] > planHierarchy[userPlan] ? 'Upgrade' : 'Downgrade'} to {plan.name}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="flex justify-between">
              <Button 
                variant="outline" 
                onClick={() => setDialogOpen(false)}
              >
                Maybe Later
              </Button>
              <Button 
                onClick={() => window.location.href = '/pricing-page'}
                className="flex items-center gap-2"
              >
                View All Plans
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

