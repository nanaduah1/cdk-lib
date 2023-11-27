import {
  DomainName,
  HttpApi,
  HttpApiProps,
  HttpMethod,
  HttpRoute,
  HttpRouteKey,
  IHttpRouteAuthorizer,
  PayloadFormatVersion,
  SecurityPolicy,
} from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { IFunction, ILayerVersion, Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { CfnStage } from "aws-cdk-lib/aws-apigateway";
import { ServicePrincipal } from "aws-cdk-lib/aws-iam";
import {
  Certificate,
  CertificateValidation,
} from "aws-cdk-lib/aws-certificatemanager";
import { ARecord, IHostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { ApiGatewayv2DomainProperties } from "aws-cdk-lib/aws-route53-targets";
import { Duration } from "aws-cdk-lib";
import { PythonFunctionV2 } from "./lambda/python";
import { IVpc } from "aws-cdk-lib/aws-ec2";
import { AccessibleResources } from "./types";

interface PythonLambdaApiProps {
  timeout?: Duration | undefined;
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
  memorySize?: number;
  vpc?: IVpc;
  permissions?: AccessibleResources[];
}

export class PythonLambdaApiV2 extends Construct {
  readonly lambadaFunction: IFunction;
  constructor(scope: Construct, id: string, props: PythonLambdaApiProps) {
    super(scope, id);

    this.lambadaFunction = new PythonFunctionV2(this, "Function", {
      description: props.description || `${id} function`,
      runtime: props.runtime,
      handler: props.handler,
      handlerFileName: props.handlerFileName,
      logRetention: props.logRetention,
      environment: props.environment,
      memorySize: props.memorySize,
      layers: props.layers,
      timeout: props.timeout?.toSeconds(),
      path: props.functionRootFolder,
      excludeAssests: props.assetExcludes,
      vpc: props.vpc,
      permissions: props.permissions,
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

type HttpApiGatewayProps = {
  domainName?: string;
  mappingKey?: string;
  hostedZone?: IHostedZone;
  throttlingBurstLimit?: number;
  throttlingRateLimit?: number;
} & HttpApiProps;
export class HttpApiGateway extends HttpApi {
  constructor(scope: Construct, id: string, props: HttpApiGatewayProps) {
    const {
      domainName,
      hostedZone,
      mappingKey,
      defaultDomainMapping,
      throttlingBurstLimit,
      throttlingRateLimit,
      ...apiProps
    } = props;

    let domainMapping = defaultDomainMapping;
    if (domainName && hostedZone) {
      const [subdomain, ..._] = domainName.split(".");

      const certificate = new Certificate(scope, `${id}-domain-certificate`, {
        validation: CertificateValidation.fromDns(hostedZone),
        domainName,
      });

      const domain = new DomainName(scope, `${id}-domain-name`, {
        certificate,
        domainName,
        securityPolicy: SecurityPolicy.TLS_1_2,
      });

      new ARecord(scope, `${id}-aRecord`, {
        zone: hostedZone,
        recordName: subdomain,
        target: RecordTarget.fromAlias(
          new ApiGatewayv2DomainProperties(
            domain.regionalDomainName,
            domain.regionalHostedZoneId
          )
        ),
      });

      domainMapping = { domainName: domain, mappingKey };
    }

    super(scope, id, {
      ...apiProps,
      defaultDomainMapping: domainMapping,
    });

    const cnfStage = this.defaultStage?.node.defaultChild as CfnStage;
    cnfStage.addPropertyOverride("DefaultRouteSettings", {
      ThrottlingBurstLimit: throttlingBurstLimit ?? 100,
      ThrottlingRateLimit: throttlingRateLimit ?? 100,
    });
  }
}
