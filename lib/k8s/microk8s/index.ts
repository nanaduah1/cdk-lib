import {
  CloudFormationInit,
  InitConfig,
  InitPackage,
} from "aws-cdk-lib/aws-ec2";
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
        install: new InitConfig([
          InitPackage.apt("nginx"),
          InitPackage.apt("python@3.11"),
        ]),
        config: new InitConfig([]),
      },
    });
  }
}
