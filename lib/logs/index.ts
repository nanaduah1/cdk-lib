import { Construct } from "constructs";
import {
  HttpApi,
  HttpMethod,
  IHttpRouteAuthorizer,
} from "aws-cdk-lib/aws-apigatewayv2";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import {
  Table,
  AttributeType,
  BillingMode,
  ITable,
} from "aws-cdk-lib/aws-dynamodb";
import { RemovalPolicy } from "aws-cdk-lib";
import { PythonFunctionV2 } from "../lambda/python";
import path = require("path");
import { SqsHttpApi } from "../sqsHttpApi";
import { PythonLambdaApiV2 } from "../apiv2";

type ApplicationLogsProps = {
  routePath: string;
  httpApi: HttpApi;
  writeMemorySize?: number;
  readMemorySize?: number;
  stageName: string;
  authorizer: IHttpRouteAuthorizer;
  logsTable?: ITable;
};

export class ApplicationLogs extends Construct {
  readonly logsDataTable: ITable;
  constructor(scope: Construct, id: string, props: ApplicationLogsProps) {
    super(scope, id);

    const { routePath, httpApi, writeMemorySize, stageName, authorizer } =
      props;

    const logsDatabase =
      props.logsTable ??
      new Table(this, `${id}-Logs${stageName}`, {
        partitionKey: { name: "pk", type: AttributeType.STRING },
        sortKey: { name: "sk", type: AttributeType.STRING },
        billingMode: BillingMode.PAY_PER_REQUEST,
        removalPolicy:
          stageName === "prod" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      });

    const createLogs = new SqsHttpApi(this, `${id}-Create`, {
      httpApi,
      routePath,
      httpMethod: HttpMethod.POST,
    });

    const createLogFunction = new PythonFunctionV2(this, `${id}-Create-Log`, {
      runtime: Runtime.PYTHON_3_11,
      path: path.join(__dirname, "lambdas/createLog"),
      description: "Writes queued logs to permanent storage",
      logRetention: RetentionDays.ONE_WEEK,
      memorySize: writeMemorySize ?? 256,
      environment: {
        DatabaseTableName: logsDatabase.tableName,
      },
    });

    const getLogsFunction = new PythonLambdaApiV2(this, `${id}-GetLogs`, {
      apiGateway: httpApi,
      functionRootFolder: path.join(__dirname, "lambdas/getLogs2"),
      runtime: Runtime.PYTHON_3_11,
      routePaths: routePath,
      handlerFileName: "getlogs2/handler.py",
      httpMethods: [HttpMethod.GET],
      displayName: "Get event logs",
      authorizer,
      environment: {
        DatabaseTableName: logsDatabase.tableName,
      },
    });

    const sqsSource = new SqsEventSource(createLogs.sqs);
    sqsSource.bind(createLogFunction);
    logsDatabase.grantWriteData(createLogFunction);
    logsDatabase.grantReadData(getLogsFunction.lambadaFunction);
    this.logsDataTable = logsDatabase;
  }
}
