import {
  HttpApi,
  HttpMethod,
  IHttpRouteAuthorizer,
} from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import { Runtime, IFunction } from "aws-cdk-lib/aws-lambda";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

export interface LambdaApiProps {
  authorizationScopes?: string[] | undefined;
  httpMethods?: HttpMethod[];
  functionRootFolder: string;
  handler?: string;
  runtime?: Runtime;
  routePaths: string[] | string;
  description?: string;
  logRetention?: RetentionDays;
  environment?: any;
  authorizer?: IHttpRouteAuthorizer;
  apiGateway: HttpApi;
  displayName: string;
  assetExcludes?: string[];
}

// Defines an abstract base class for creating LambdaApi constructs
export abstract class AbstractLambdaApi<
  TProps extends LambdaApiProps
> extends Construct {
  readonly lambdaFunction: IFunction;
  readonly displayName: string;
  constructor(scope: Construct, id: string, props: TProps) {
    super(scope, id);

    const lambdaFunction = this.createLambdaFunction(id, props);

    const httpApiGateway = props.apiGateway;

    const lambdaIntegration = new HttpLambdaIntegration(
      `${id}-API-Gateway-integration`,
      lambdaFunction
    );

    if (typeof props.routePaths === "string") {
      props.routePaths = [props.routePaths];
    }

    props.routePaths.map((routePath) => {
      httpApiGateway.addRoutes({
        path: routePath,
        integration: lambdaIntegration,
        methods: props.httpMethods,
        authorizer: props.authorizer,
        authorizationScopes: props.authorizationScopes,
      });
    });

    new CfnOutput(this, `${id}-APIEndpoint`, {
      value: httpApiGateway.url!,
    });
    this.lambdaFunction = lambdaFunction;
    this.displayName = props.displayName;
  }

  abstract createLambdaFunction(id: string, props: LambdaApiProps): IFunction;
}

export abstract class BaseApp extends Stack {
  readonly stageName: string;
  readonly productionStageName: string;
  constructor(
    scope: Construct,
    id: string,
    stages: string[],
    props: StackProps
  ) {
    const stageName = scope.node.tryGetContext("stage") || "beta";

    const supportedStages = stages;

    if (!supportedStages.includes(stageName)) {
      throw Error(`ALLOWED_STAGES does not include ${stageName}`);
    }

    super(scope, `${id}-${stageName}`, props);
    this.stageName = stageName;
  }

  get IsProductionStage() {
    return this.ProductionStageNames.includes(this.stageName);
  }

  get ProductionStageNames() {
    return ["prod", "production"];
  }
}
