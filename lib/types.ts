import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { ILayerVersion, Runtime } from "aws-cdk-lib/aws-lambda";
import { RetentionDays } from "aws-cdk-lib/aws-logs";

export type FunctionConfig = {
  memorySize?: number;
  /**Timeout in seconds */
  timeout?: number;
  environment?: { [key: string]: string };
  layers?: ILayerVersion[];
  logRetention?: RetentionDays;
  db?: ITable[];
};
