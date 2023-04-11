import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { TaskStateBaseProps } from "aws-cdk-lib/aws-stepfunctions";
import { CallAwsService } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";

type DynamoGetItemTaskProps = {
  table: ITable;
  indexName?: string;
  keyConditionExpression: string;
  expressionAttributeNames?: { [key: string]: string };
  expressionAttributeValues?: { [key: string]: string | number | boolean };
} & TaskStateBaseProps;

export class DynamoDBQueryTask extends CallAwsService {
  constructor(scope: Construct, id: string, props: DynamoGetItemTaskProps) {
    const {
      table,
      indexName,
      keyConditionExpression,
      expressionAttributeNames,
      expressionAttributeValues,
      ...taskProps
    } = props;

    super(scope, id, {
      service: "dynamodb",
      action: "query",
      iamResources: [table.tableArn],
      parameters: {
        KeyConditionExpression: keyConditionExpression,
        TableName: table.tableName,
        IndexName: indexName,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      },
      ...taskProps,
      resultPath: taskProps.resultPath || "$.queryResult",
    });
  }
}
