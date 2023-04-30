import { CloudFormationInit, InitConfig } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { IClusterInitializer } from "../abstractions";

export class MicroK8sInitializer implements IClusterInitializer {
  init(scope: Construct): CloudFormationInit {
    return CloudFormationInit.fromConfigSets({
      configSets: {
        default: ["createAccounts", "install", "config"],
      },
      configs: {
        createAccounts: new InitConfig([]),
        install: new InitConfig([]),
        config: new InitConfig([]),
      },
    });
  }
}
