import { Duration } from "aws-cdk-lib";
import { Runtime, IFunction } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { AbstractLambdaApi, LambdaApiProps } from "./common";

interface NodeJsLambdaApiProps extends LambdaApiProps {}

export class NodeJsLambdaApi extends AbstractLambdaApi<NodeJsLambdaApiProps> {
  createLambdaFunction(id: string, props: NodeJsLambdaApiProps): IFunction {
    return new NodejsFunction(this, id, {
      runtime: props.runtime || Runtime.NODEJS_16_X,
      handler: props.handler || "handler",
      entry: props.functionRootFolder,
      description: props.description || `${id} function`,
      logRetention: props.logRetention || RetentionDays.ONE_WEEK,
      environment: props.environment,
      bundling: {
        externalModules: ["aws-sdk"],
      },
    });
  }
}
