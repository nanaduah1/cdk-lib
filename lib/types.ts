import { IGrantable } from "aws-cdk-lib/aws-iam";
import { ILayerVersion } from "aws-cdk-lib/aws-lambda";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { IQueue } from "aws-cdk-lib/aws-sqs";

type AccessibleResources = ITable | IBucket | IQueue | IGrantable;

export type FunctionConfig = {
  memorySize?: number;
  /**Timeout in seconds */
  timeout?: number;
  environment?: { [key: string]: string };
  layers?: ILayerVersion[];
  logRetention?: RetentionDays;
  permissions?: AccessibleResources[];
  name?:string;
};
