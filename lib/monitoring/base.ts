import { Dashboard, IWidget } from "aws-cdk-lib/aws-cloudwatch";

export abstract class ResourceMonitor {
  readonly displayName: string;
  constructor(displayName: string) {
    this.displayName = displayName;
  }
  addToDashboard(dashboard: Dashboard): void {
    dashboard.addWidgets(this.buildWidget());
  }
  abstract buildWidget(): IWidget;
}
