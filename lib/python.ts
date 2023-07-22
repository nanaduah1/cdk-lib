import { PythonFunction } from "@aws-cdk/aws-lambda-python-alpha";
import { aws_lambda, Duration } from "aws-cdk-lib";
import { IVpc } from "aws-cdk-lib/aws-ec2";
import { Architecture, ILayerVersion, Runtime } from "aws-cdk-lib/aws-lambda";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { FunctionConfig } from "./types";

type PythonLambdaFunctionProps = {
  handlerFileName?: string;
  memorySize?: number;
  timeout?: Duration;
  layers?: ILayerVersion[] | undefined;
  hasDependencies?: boolean;
  functionRootFolder: string;
  environment?: { [key: string]: string } | undefined;
  handler?: string;
  logRetention?: RetentionDays;
  runtime?: aws_lambda.Runtime;
  description: string | undefined;
  assetExcludes?: string[];
  vpc?: IVpc;
};
export class PythonLambdaFunction extends PythonFunction {
  constructor(scope: Construct, id: string, props: PythonLambdaFunctionProps) {
    const runtime = props.runtime || Runtime.PYTHON_3_9;
    const projectName = props.functionRootFolder.split("/").slice(-1)[0];
    super(scope, id, {
      entry: props.functionRootFolder,
      runtime,
      description: props.description,
      logRetention: props.logRetention || RetentionDays.ONE_WEEK,
      handler: props.handler,
      index: props.handlerFileName || `${projectName.toLowerCase()}/handler.py`,
      environment: props.environment,
      memorySize: props.memorySize || 128,
      layers: props.layers,
      timeout: props.timeout || Duration.seconds(5),
      architecture: Architecture.ARM_64,
      vpc: props.vpc,
      bundling: {
        assetExcludes: [...(props.assetExcludes || []), "tests", "README.md"],
      },
    });
  }
}

type PythonFunctionPropsV2 = {
  /**
   * The path to the root folder of the lambda function.
   * It should be relative to the bin folder.
   */
  path: string;
  runtime?: Runtime;
  description?: string;
  handler?: string;
  handlerFileName?: string;
  vpc?: IVpc;
  excludeAssests?: string[];
} & FunctionConfig;

export class PythonFunctionV2 extends PythonFunction {
  constructor(scope: Construct, id: string, props: PythonFunctionPropsV2) {
    const runtime = props.runtime || Runtime.PYTHON_3_9;
    const projectName = props.path.split("/").slice(-1)[0];
    super(scope, id, {
      entry: props.path,
      runtime,
      description: props.description,
      logRetention: props.logRetention || RetentionDays.ONE_WEEK,
      handler: props.handler,
      index: props.handlerFileName || `${projectName.toLowerCase()}/handler.py`,
      environment: props.environment,
      memorySize: props.memorySize || 128,
      layers: props.layers,
      timeout: Duration.seconds(props.timeout || 5),
      architecture: Architecture.ARM_64,
      vpc: props.vpc,
      bundling: {
        assetExcludes: [...(props.excludeAssests || []), "tests", "README.md"],
      },
    });

    props.db?.forEach((table) => {
      table.grantReadWriteData(this);
    });
  }
}
