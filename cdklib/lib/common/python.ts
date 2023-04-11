import { PythonFunction } from "@aws-cdk/aws-lambda-python-alpha";
import { aws_lambda, Duration } from "aws-cdk-lib";
import { IVpc } from "aws-cdk-lib/aws-ec2";
import { Architecture, ILayerVersion, Runtime } from "aws-cdk-lib/aws-lambda";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { AbstractLambdaApi, LambdaApiProps } from "./common";

interface PythonLambdaApiProps extends LambdaApiProps {
  layers?: ILayerVersion[] | undefined;
  hasDependencies?: boolean;
  handlerFileName?: string;
}
export class PythonLambdaApi extends AbstractLambdaApi<PythonLambdaApiProps> {
  createLambdaFunction(
    id: string,
    props: PythonLambdaApiProps
  ): aws_lambda.IFunction {
    return new PythonLambdaFunction(this, "Function", {
      description: props.description || `${id} function`,
      runtime: props.runtime,
      handler: props.handler,
      handlerFileName: props.handlerFileName,
      logRetention: props.logRetention,
      environment: props.environment,
      functionRootFolder: props.functionRootFolder,
      hasDependencies: props.hasDependencies,
      layers: props.layers,
      assetExcludes: props.assetExcludes,
    });
  }
}

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
    const runtime = props.runtime || Runtime.PYTHON_3_8;
    super(scope, id, {
      entry: props.functionRootFolder,
      runtime,
      description: props.description,
      logRetention: props.logRetention || RetentionDays.ONE_WEEK,
      handler: props.handler,
      index: props.handlerFileName || "handler.py",
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
