import { IGrantable } from "aws-cdk-lib/aws-iam";
import { Architecture, ILayerVersion, Runtime } from "aws-cdk-lib/aws-lambda";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { IQueue } from "aws-cdk-lib/aws-sqs";
import { ISecurityGroup, IVpc } from "aws-cdk-lib/aws-ec2";

export type AccessibleResources = ITable | IBucket | IQueue | IGrantable;

export type FunctionConfig = {
  securityGroups?: ISecurityGroup[];
  vpc?: IVpc;
  memorySize?: number;
  /**Timeout in seconds */
  timeout?: number;
  environment?: { [key: string]: string };
  layers?: ILayerVersion[];
  logRetention?: RetentionDays;
  permissions?: AccessibleResources[];
  name?: string;
  runtime?: Runtime;
  architecture?: Architecture;
};
