import { RemovalPolicy } from "aws-cdk-lib";
import {
  AttributeType,
  BillingMode,
  StreamViewType,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

export class DynamoTable extends Table {
  constructor(
    scope: Construct,
    id: string,
    removalPolicy?: RemovalPolicy,
    stream?: StreamViewType
  ) {
    super(scope, id, {
      removalPolicy,
      billingMode: BillingMode.PROVISIONED,

      partitionKey: {
        name: "pk",
        type: AttributeType.STRING,
      },
      sortKey: {
        name: "sk",
        type: AttributeType.STRING,
      },
      stream: stream,
    });

    this.autoScaleWriteCapacity({
      maxCapacity: 10,
      minCapacity: 1,
    }).scaleOnUtilization({ targetUtilizationPercent: 80 });

    this.autoScaleReadCapacity({
      maxCapacity: 10,
      minCapacity: 1,
    }).scaleOnUtilization({ targetUtilizationPercent: 80 });
  }
}
