import { IHttpApi } from "@aws-cdk/aws-apigatewayv2-alpha";
import {
  Column,
  GraphWidget,
  IWidget,
  Row,
  SingleValueWidget,
} from "aws-cdk-lib/aws-cloudwatch";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { IFunction } from "aws-cdk-lib/aws-lambda";
import { ResourceMonitor } from "./base";
import { DynamoTableMonitor } from "./dynamoTable";
import { LambdaMonitor } from "./lambda";

export class HttpApiMonitor extends ResourceMonitor {
  private readonly httpApi: IHttpApi;
  private readonly tables?: { name: string; table: ITable }[];
  private readonly lambdas?: { name: string; lambda: IFunction }[];
  displayName: string;
  constructor(
    api: IHttpApi,
    displayName: string,
    lambdas?: { name: string; lambda: IFunction }[],
    tables?: { name: string; table: ITable }[]
  ) {
    super(displayName);
    this.httpApi = api;
    this.tables = tables;
    this.lambdas = lambdas;
  }

  buildWidget(): IWidget {
    const duration = this.httpApi.metricLatency();
    const invocations = this.httpApi.metricCount();
    const errors400 = this.httpApi.metricClientError();
    const errors500 = this.httpApi.metricServerError();

    const row = new Row(
      new Column(
        new SingleValueWidget({
          title: this.displayName + " Requests",
          metrics: [invocations.with({ statistic: "sum" })],
          height: 3,
          width: 5,
          setPeriodToTimeRange: true,
        }),
        new GraphWidget({
          title: "Request",
          left: [invocations],
          height: 3,
          width: 5,
        })
      ),
      new Column(
        new SingleValueWidget({
          title: "Request time (P95)",
          metrics: [duration.with({ statistic: "p95" })],
          height: 3,
          width: 5,
          setPeriodToTimeRange: true,
        }),
        new GraphWidget({
          title: "P95",
          left: [duration.with({ statistic: "p95" })],
          height: 3,
          width: 5,
        })
      ),
      new Column(
        new SingleValueWidget({
          title: "HTTP 5xx Errors",
          metrics: [errors500],
          height: 3,
          width: 5,
          setPeriodToTimeRange: true,
        }),
        new GraphWidget({
          title: "Errors",
          left: [errors500],
          height: 3,
          width: 5,
        })
      ),
      new GraphWidget({
        title: this.displayName + " Invocations",
        left: [invocations, errors500, errors400],
      })
    );

    if (this.lambdas?.length) {
      this,
        this.lambdas.forEach((lambda) =>
          row.addWidget(
            new LambdaMonitor(lambda.lambda, lambda.name).buildWidget()
          )
        );
    }

    if (this.tables?.length) {
      this,
        this.tables.forEach((table) =>
          row.addWidget(
            new DynamoTableMonitor(table.table, table.name).buildWidget()
          )
        );
    }

    return row;
  }
}
