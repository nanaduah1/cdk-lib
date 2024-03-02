import { HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { Authorizer, PassthroughBehavior } from "aws-cdk-lib/aws-apigateway";
import { CfnIntegration, CfnRoute } from "aws-cdk-lib/aws-apigatewayv2";

import {
  Effect,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

type SqsHttpApiProps = {
  httpApi: HttpApi;
  routePath: string;
  httpMethod?: HttpMethod;
  queue?: Queue;
  authorizer?: Authorizer;
  requestParameters?: string;
  responseParameters?: any;
};

export class SqsHttpApi extends Construct {
  readonly sqs: Queue;
  constructor(scope: Construct, id: string, props: SqsHttpApiProps) {
    super(scope, id);

    const {
      httpApi,
      queue,
      routePath,
      httpMethod,
      authorizer,
      requestParameters,
      responseParameters,
    } = props;

    // - Role to allow HTTP API to Execute the step function ---
    const httpApiRole = new Role(this, "HttpApiExecuteStateMachine", {
      assumedBy: new ServicePrincipal("apigateway.amazonaws.com"),
    });

    const messageQueue = queue ?? new Queue(this, `${id}-Queue`);

    httpApiRole.addToPolicy(
      new PolicyStatement({
        actions: ["sqs:SendMessage"],
        effect: Effect.ALLOW,
        resources: [messageQueue.queueArn],
      })
    );

    const integration = new CfnIntegration(this, "StepFuncHttpApiIntegration", {
      apiId: httpApi.apiId,
      integrationType: "AWS_PROXY",
      passthroughBehavior: PassthroughBehavior.WHEN_NO_MATCH,
      integrationSubtype: "SQS-SendMessage",
      credentialsArn: httpApiRole.roleArn,
      payloadFormatVersion: "1.0",
      connectionType: "INTERNET",
      requestParameters: {
        MessageBody: requestParameters || "$request.body",
        QueueUrl: messageQueue.queueUrl,
      },
      responseParameters: responseParameters,
      timeoutInMillis: 3000,
    });

    new CfnRoute(this, "SqsHttpApiIntegrationRoute", {
      apiId: httpApi.apiId,
      routeKey: `${(httpMethod ?? HttpMethod.POST)
        .toString()
        .toUpperCase()} ${routePath}`,
      target: `integrations/${integration.ref}`,
      authorizerId: authorizer?.authorizerId,
    });

    this.sqs = messageQueue;
  }
}
