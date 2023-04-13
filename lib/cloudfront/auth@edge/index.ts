import { Construct } from "constructs";
import { PythonLambdaFunction } from "../../python";
import * as path from "path";
import { Duration, Stack } from "aws-cdk-lib";
import {
  AllowedMethods,
  Distribution,
  OriginProtocolPolicy,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { HttpOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import {
  HttpLambdaAuthorizer,
  HttpLambdaResponseType,
} from "@aws-cdk/aws-apigatewayv2-authorizers-alpha";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { HttpApi, HttpMethod } from "@aws-cdk/aws-apigatewayv2-alpha";
import { IFunction } from "aws-cdk-lib/aws-lambda";

type FrontendAuthorizerProps = {
  httpApiId: string;
  publicDistribution: Distribution;
  pathPatterns?: string[];
  apiSecretKey: string;
};

export class SecureBackendAccess extends Construct {
  constructor(scope: Construct, id: string, props: FrontendAuthorizerProps) {
    super(scope, id);

    const { httpApiId, publicDistribution, pathPatterns, apiSecretKey } = props;
    const region = Stack.of(this).region;
    const configuredPatterns = pathPatterns || ["/api/*"];

    configuredPatterns.forEach((pattern) => {
      publicDistribution.addBehavior(
        pattern,
        new HttpOrigin(`${httpApiId}.execute-api.${region}.amazonaws.com`, {
          customHeaders: {
            "x-public-api-key": apiSecretKey,
          },
          protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
        }),
        {
          allowedMethods: AllowedMethods.ALLOW_ALL,
          viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
        }
      );
    });
  }
}

type KnownFrontendAuthorizerProps = {
  apiSecretParameter: StringParameter;
  httpApi: HttpApi;
  allowedRoutes?: { [path: string]: HttpMethod[] };
};

export class KnownFrontendAuthorizer extends HttpLambdaAuthorizer {
  private readonly authFunction: IFunction;
  constructor(
    scope: Construct,
    id: string,
    props: KnownFrontendAuthorizerProps
  ) {
    const allowedPaths: string[] = [];

    if (props.allowedRoutes) {
      for (let path in props.allowedRoutes) {
        props.allowedRoutes[path].forEach((method) =>
          allowedPaths.push(`${method} ${path}`)
        );
      }
    }

    const authFunction = new PythonLambdaFunction(scope, `${id}-LambdaAuth`, {
      description: "Public web access auth",
      functionRootFolder: path.join(__dirname, "auth"),
      handlerFileName: "auth/handler2.py",
      environment: {
        AppName: id,
        AllowedEndpoints: allowedPaths.join(",") || "",
        ApiKeyParameterName: props.apiSecretParameter.parameterName,
      },
      assetExcludes: ["tests"],
    });

    super(id, authFunction, {
      identitySource: ["$request.header.x-public-api-key"],
      responseTypes: [HttpLambdaResponseType.IAM],
      resultsCacheTtl: Duration.minutes(10),
    });
    props.apiSecretParameter.grantRead(authFunction);
    this.authFunction = authFunction;
  }
}
