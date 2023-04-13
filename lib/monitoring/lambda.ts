import {
  GraphWidget,
  IWidget,
  Row,
  SingleValueWidget,
} from "aws-cdk-lib/aws-cloudwatch";
import { IFunction } from "aws-cdk-lib/aws-lambda";
import { ResourceMonitor } from "./base";

export class LambdaMonitor extends ResourceMonitor {
  private readonly function: IFunction;
  displayName: string;
  constructor(lambda: IFunction, displayName: string) {
    super(displayName);
    this.function = lambda;
  }
  buildWidget(): IWidget {
    const duration = this.function.metricDuration();
    const invocations = this.function.metricInvocations();
    const errors = this.function.metricErrors();
    const throttles = this.function.metricThrottles();

    return new Row(
      new SingleValueWidget({
        title: this.displayName + " Requests",
        metrics: [invocations],
        height: 6,
        width: 5,
        sparkline: true,
      }),
      new SingleValueWidget({
        title: "Request time (P95)",
        metrics: [
          duration.with({
            statistic: "p95",
          }),
        ],
        height: 6,
        width: 5,
        sparkline: true,
      }),
      new SingleValueWidget({
        title: "HTTP 5xx Errors",
        metrics: [errors],
        height: 6,
        width: 5,
        sparkline: true,
      }),
      new GraphWidget({
        title: this.displayName + " Duration",
        left: [invocations, errors, throttles],
      })
    );
  }
}
