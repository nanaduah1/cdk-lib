import { Construct } from "constructs";
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
import { PythonFunctionV2 } from "../..";
import { randomUUID } from "crypto";

type FrontendAuthorizerProps = {
  httpApiId: string;
  pathPatterns?: string[];
  apiSecretKey: string;
  publicDistribution?: Distribution;
};

export class SecureBackendAccess extends Construct {
  private readonly distribution: Distribution;
  private readonly defaultOrigin: HttpOrigin;

  constructor(scope: Construct, id: string, props: FrontendAuthorizerProps) {
    super(scope, id);

    const { httpApiId, publicDistribution, pathPatterns, apiSecretKey } = props;
    const region = Stack.of(this).region;
    const configuredPatterns = pathPatterns || ["/api/*"];
    const origin = new HttpOrigin(
      `${httpApiId}.execute-api.${region}.amazonaws.com`,
      {
        customHeaders: {
          "x-public-api-key": apiSecretKey,
        },
        protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
      }
    );

    this.distribution =
      publicDistribution ?? this.createNewDistribution(id, origin);
    this.defaultOrigin = origin;

    configuredPatterns.forEach((pattern) => {
      this.distribution.addBehavior(pattern, origin, {
        allowedMethods: AllowedMethods.ALLOW_ALL,
        viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
      });
    });
  }

  private createNewDistribution(id: string, origin: HttpOrigin) {
    return new Distribution(this, `${id}-Distribution`, {
      defaultBehavior: {
        origin,
        allowedMethods: AllowedMethods.ALLOW_ALL,
        viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
      },
    });
  }

  addEndpoint(path: string, origin?: HttpOrigin) {
    this.distribution.addBehavior(path, origin ?? this.defaultOrigin, {
      allowedMethods: AllowedMethods.ALLOW_ALL,
      viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
    });
  }
}

type KnownFrontendAuthorizerProps = {
  httpApi: HttpApi;
  allowedRoutes?: { [path: string]: HttpMethod[] };
  apiSecretParameter?: StringParameter;
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

    let apiSecretParameter = props.apiSecretParameter;
    // Create a secret parameter if one is not provided
    if (!apiSecretParameter) {
      apiSecretParameter = new StringParameter(scope, `${id}-Secret`, {
        stringValue: randomUUID(),
      });
    }

    const authFunction = new PythonFunctionV2(scope, `${id}-LambdaAuth`, {
      description: "Public web access auth",
      path: path.join(__dirname, "auth"),
      handlerFileName: "auth/handler2.py",
      environment: {
        AppName: id,
        AllowedEndpoints: allowedPaths.join(",") || "",
        ApiKeyParameterName: apiSecretParameter.parameterName,
      },
      excludeAssests: ["tests"],
    });

    super(id, authFunction, {
      identitySource: ["$request.header.x-public-api-key"],
      responseTypes: [HttpLambdaResponseType.IAM],
      resultsCacheTtl: Duration.minutes(10),
    });
    apiSecretParameter.grantRead(authFunction);
    this.authFunction = authFunction;
  }
}
