import {
  HttpApi,
  HttpMethod,
  HttpRoute,
  HttpRouteKey,
  IHttpRouteAuthorizer,
  PayloadFormatVersion,
} from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { IFunction, ILayerVersion, Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { PythonLambdaFunction } from "./python";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { CfnStage } from "aws-cdk-lib/aws-apigateway";
import { ServicePrincipal } from "aws-cdk-lib/aws-iam";

interface PythonLambdaApiProps {
  layers?: ILayerVersion[] | undefined;
  handlerFileName?: string;
  authorizationScopes?: string[] | undefined;
  httpMethods?: HttpMethod[];
  functionRootFolder: string;
  handler?: string;
  runtime?: Runtime;
  routePaths: string[] | string;
  description?: string;
  logRetention?: RetentionDays;
  environment?: any;
  authorizer: IHttpRouteAuthorizer;
  apiGateway: HttpApi;
  displayName: string;
  assetExcludes?: string[];
}

export class PythonLambdaApiV2 extends Construct {
  readonly lambadaFunction: IFunction;
  constructor(scope: Construct, id: string, props: PythonLambdaApiProps) {
    super(scope, id);

    this.lambadaFunction = new PythonLambdaFunction(this, "Function", {
      description: props.description || `${id} function`,
      runtime: props.runtime,
      handler: props.handler,
      handlerFileName: props.handlerFileName,
      logRetention: props.logRetention,
      environment: props.environment,
      functionRootFolder: props.functionRootFolder,
      layers: props.layers,
      assetExcludes: props.assetExcludes,
    });

    new LambdaAsHttApi(this, "api", {
      httpApi: props.apiGateway,
      lambdaFunction: this.lambadaFunction,
      routePaths: props.routePaths,
      authorizationScopes: props.authorizationScopes,
      authorizer: props.authorizer,
      httpMethods: props.httpMethods,
    });
  }
}

type LambdaAsHttApiProps = {
  lambdaFunction: IFunction;
  httpApi: HttpApi;
  routePaths: string[] | string;
  authorizer: IHttpRouteAuthorizer;
  authorizationScopes?: string[] | undefined;
  httpMethods?: HttpMethod[];
};

export class LambdaAsHttApi extends Construct {
  constructor(scope: Construct, id: string, props: LambdaAsHttApiProps) {
    super(scope, id);

    const {
      lambdaFunction,
      httpApi,
      httpMethods,
      authorizationScopes,
      authorizer,
    } = props;

    const lambdaIntegration = new HttpLambdaIntegration(
      `${id}-lambda-integration`,
      lambdaFunction,
      { payloadFormatVersion: PayloadFormatVersion.VERSION_2_0 }
    );

    if (typeof props.routePaths === "string") {
      props.routePaths = [props.routePaths];
    }

    const methods = httpMethods || [HttpMethod.ANY];

    props.routePaths.map((routePath) => {
      return methods.map((method) => {
        return new HttpRoute(this, `${method}${routePath}`, {
          httpApi,
          routeKey: HttpRouteKey.with(routePath, method),
          integration: lambdaIntegration,
          authorizer,
          authorizationScopes,
        });
      });
    });
  }
}

type HttpApiLogsProps = {
  retention: RetentionDays;
};

export class HttpApiLogs {
  static enableLogging(httpApi: HttpApi, props: HttpApiLogsProps) {
    const stage = httpApi.defaultStage!.node.defaultChild as CfnStage;
    const logGroup = new LogGroup(httpApi, "AccessLogs", {
      retention: props.retention,
    });

    stage.accessLogSetting = {
      destinationArn: logGroup.logGroupArn,
      format: JSON.stringify({
        requestId: "$context.requestId",
        userAgent: "$context.identity.userAgent",
        sourceIp: "$context.identity.sourceIp",
        requestTime: "$context.requestTime",
        httpMethod: "$context.httpMethod",
        path: "$context.path",
        status: "$context.status",
        responseLength: "$context.responseLength",
      }),
    };

    logGroup.grantWrite(new ServicePrincipal("apigateway.amazonaws.com"));
  }
}
