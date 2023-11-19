import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import { toDynamoJson } from "../utils";

type DynamoBatchWriteItemProps = {
  table: ITable;
  items: any[];
  physicalResourceId?: string;
};

export class DynamoBatchWriteItem extends AwsCustomResource {
  constructor(scope: Construct, id: string, props: DynamoBatchWriteItemProps) {
    const { table, items, physicalResourceId } = props;
    const b64ItemJson = Buffer.from(JSON.stringify(items)).toString("base64");

    super(scope, id, {
      logRetention: RetentionDays.ONE_DAY,
      onCreate: {
        action: "batchWriteItem",
        service: "DynamoDB",
        parameters: {
          RequestItems: {
            [table.tableName]: items.map((item) => ({
              PutRequest: {
                Item: toDynamoJson(item),
              },
            })),
          },
        },
        physicalResourceId: PhysicalResourceId.of(
          physicalResourceId ?? b64ItemJson
        ),
      },
      installLatestAwsSdk: true,
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: [table.tableArn],
      }),
    });
  }
}
