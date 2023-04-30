import { CloudFormationInit } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export interface INode {}

export interface IClusterInitializer {
  init(scope: Construct): CloudFormationInit;
}
