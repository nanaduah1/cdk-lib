import { Construct } from "constructs";
import { Table, ITable } from "aws-cdk-lib/aws-dynamodb";
import { AwsCustomResource } from "aws-cdk-lib/custom-resources";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { PolicyStatement, Effect } from "aws-cdk-lib/aws-iam";

type ConfigWriterProps = {
  configTable?: string;
  stage: string;
  appName: string;
};

export class ConfigWriter extends Construct {
  private readonly table: ITable;
  private readonly stage: string;
  private readonly appName: string;

  constructor(scope: Construct, id: string, props: ConfigWriterProps) {
    super(scope, id);

    const { configTable } = props;
    this.table = Table.fromTableName(
      this,
      "ConfigTable",
      configTable ?? "config-table"
    );
    this.stage = props.stage;
    this.appName = props.appName;
  }

  writeConfig(
    config: { [key: string]: string | number },
    id: string,
    shared = false
  ) {
    const pk = shared ? this.appName : `${this.appName}#${this.stage}`;
    const configItems = Object.keys(config).map((key) => ({
      PutRequest: {
        Item: {
          pk: { S: pk.toUpperCase() },
          sk: { S: key },
          value: { S: config[key].toString() },
        },
      },
    }));

    const insertConfig = {
      service: "DynamoDB",
      action: "batchWriteItem",
      parameters: {
        RequestItems: { [this.table.tableName]: configItems },
      },
      physicalResourceId: {
        id: new Date().getTime().toString(),
      },
    };
    new AwsCustomResource(this, id, {
      logRetention: RetentionDays.ONE_DAY,
      onCreate: insertConfig,
      onUpdate: insertConfig,
      policy: {
        statements: [
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["dynamodb:BatchWriteItem"],
            resources: [this.table.tableArn],
          }),
        ],
      },
    });
  }
}
