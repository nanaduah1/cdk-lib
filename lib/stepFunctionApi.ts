import {
  HttpApi,
  HttpAuthorizer,
  HttpMethod,
  HttpRoute,
} from "@aws-cdk/aws-apigatewayv2-alpha";
import {
  ConnectionType,
  Integration,
  IntegrationType,
  PassthroughBehavior,
} from "aws-cdk-lib/aws-apigateway";
import { CfnIntegration, CfnRoute } from "aws-cdk-lib/aws-apigatewayv2";
import {
  Effect,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { StateMachine } from "aws-cdk-lib/aws-stepfunctions";
import { Construct } from "constructs";

type HttApiToStepFunctionProps = {
  stepFunction: StateMachine;
  httpApi: HttpApi;
  method: HttpMethod;
  routePath: string;
  authorizerType: AuthorizationTypes;
  authorizerId?: string;
  requestParameters?: string;
  responseParameters?: any;
};

export enum AuthorizationTypes {
  None = "NONE",
  AWS_IAM = "AWS_IAM",
  JWT = "JWT",
  LAMBDA = "CUSTOM",
}

export class HttApiToStepFunction extends Construct {
  readonly route: CfnRoute;
  constructor(scope: Construct, props: HttApiToStepFunctionProps) {
    super(scope, "HttpApiToStepFunction");

    const {
      httpApi,
      stepFunction,
      method,
      routePath,
      authorizerType,
      authorizerId,
      requestParameters,
      responseParameters,
    } = props;

    // - Role to allow HTTP API to Execute the step function ---
    const httpApiRole = new Role(this, "HttpApiExecuteStateMachine", {
      assumedBy: new ServicePrincipal("apigateway.amazonaws.com"),
    });

    httpApiRole.addToPolicy(
      new PolicyStatement({
        actions: ["states:StartSyncExecution"],
        effect: Effect.ALLOW,
        resources: [stepFunction.stateMachineArn],
      })
    );

    const integration = new CfnIntegration(this, "StepFuncHttpApiIntegration", {
      apiId: httpApi.apiId,
      integrationType: "AWS_PROXY",
      passthroughBehavior: PassthroughBehavior.WHEN_NO_MATCH,
      integrationSubtype: "StepFunctions-StartSyncExecution",
      credentialsArn: httpApiRole.roleArn,
      payloadFormatVersion: "1.0",
      connectionType: "INTERNET",
      requestParameters: {
        Input: requestParameters ?? "$request.body",
        StateMachineArn: stepFunction.stateMachineArn,
      },
      responseParameters: responseParameters,
    });

    this.route = new CfnRoute(this, "StepFuncHttpApiIntegrationRoute", {
      apiId: httpApi.apiId,
      routeKey: `${method.toUpperCase()} ${routePath}`,
      target: `integrations/${integration.ref}`,
      authorizationType: authorizerType.toString(),
      authorizerId,
    });
  }
}
