import {
  GraphWidget,
  IWidget,
  Row,
  SingleValueWidget,
} from "aws-cdk-lib/aws-cloudwatch";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { ResourceMonitor } from "./base";

export class DynamoTableMonitor extends ResourceMonitor {
  private readonly table: ITable;
  displayName: string;
  constructor(dynamoTable: ITable, displayName: string) {
    super(displayName);
    this.table = dynamoTable;
  }
  buildWidget(): IWidget {
    return new Row(
      new SingleValueWidget({
        title: this.displayName + "  Consumed RCU",
        metrics: [this.table.metricConsumedReadCapacityUnits()],
        height: 6,
        width: 5,
        sparkline: true,
      }),
      new SingleValueWidget({
        title: "Consumed WCU",
        metrics: [this.table.metricConsumedWriteCapacityUnits()],
        height: 6,
        width: 5,
        sparkline: true,
      }),
      new SingleValueWidget({
        title: "Read Throttles",
        metrics: [
          this.table.metric("ReadThrottleEvents", { statistic: "sum" }),
        ],
        height: 6,
        width: 5,
        sparkline: true,
      }),
      new SingleValueWidget({
        title: "Write Throttles",
        metrics: [
          this.table.metric("WriteThrottleEvents", { statistic: "sum" }),
        ],
        height: 6,
        width: 5,
        sparkline: true,
      })
    );
  }
}
